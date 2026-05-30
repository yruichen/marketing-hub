import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy as CopyIcon,
  Film,
  GitBranch,
  Image,
  Mic,
  Move,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Share2,
} from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '../hooks/useApi';
import type {
  BrandContext,
  CampaignRecord,
  GenerationTaskRecord,
  OrganizationRecord,
  ProjectRecord,
  WorkflowEdge,
  WorkflowNode,
  WorkflowTemplateRecord,
  WorkspaceDraftRecord,
} from '../types/workspace';

interface ProjectDetail extends ProjectRecord {
  campaigns: CampaignRecord[];
  drafts: WorkspaceDraftRecord[];
}

interface WorkflowBuilderProps {
  organization: OrganizationRecord | null;
  project: Pick<ProjectRecord, 'id' | 'name' | 'slug'> | null;
  campaign: Pick<CampaignRecord, 'id' | 'name'> | null;
  username: string;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
}

const palette = [
  { type: 'context', label: '品牌卖点提炼', icon: Settings },
  { type: 'copy', label: '小红书文案专家', icon: CopyIcon },
  { type: 'image', label: '配图生成器', icon: Image },
  { type: 'storyboard', label: '分镜脚本导演', icon: Film },
  { type: 'audio', label: '旁白配音合成', icon: Mic },
] as const;

function defaultNodes(projectName: string): WorkflowNode[] {
  return [
    {
      id: 'brand-brief',
      type: 'context',
      label: '品牌卖点提炼',
      x: 70,
      y: 130,
      status: 'idle',
      config: { summary: `${projectName} 品牌上下文` },
      output: {},
    },
    {
      id: 'copy-agent',
      type: 'copy',
      label: '小红书文案专家',
      x: 350,
      y: 90,
      status: 'idle',
      config: { tone: '爆款活泼', platform: 'Xiaohongshu' },
      output: {},
    },
    {
      id: 'image-agent',
      type: 'image',
      label: '配图生成器',
      x: 640,
      y: 200,
      status: 'idle',
      config: { style: 'minimalist', aspect_ratio: '1:1' },
      output: {},
    },
  ];
}

const defaultEdges: WorkflowEdge[] = [
  { id: 'edge-brand-copy', source: 'brand-brief', target: 'copy-agent' },
  { id: 'edge-copy-image', source: 'copy-agent', target: 'image-agent' },
];

function nodeStatusClass(status?: string) {
  if (status === 'running') return 'border-blue-500 bg-blue-50 dark:bg-blue-950/20';
  if (status === 'succeeded') return 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20';
  if (status === 'failed') return 'border-rose-500 bg-rose-50 dark:bg-rose-950/20';
  if (status === 'queued') return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20';
  return 'border-[var(--editorial-stroke)] bg-[var(--editorial-paper)]';
}

function compactOutput(output?: Record<string, unknown>) {
  if (!output || Object.keys(output).length === 0) return 'No output';
  return JSON.stringify(output, null, 2).slice(0, 260);
}

export function WorkflowBuilder({ organization, project, campaign, username, triggerToast }: WorkflowBuilderProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const idCounterRef = useRef(0);
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [draft, setDraft] = useState<WorkspaceDraftRecord | null>(null);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [brandContext, setBrandContext] = useState<BrandContext>({});
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [connectionSource, setConnectionSource] = useState('');
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [templates, setTemplates] = useState<WorkflowTemplateRecord[]>([]);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastTasks, setLastTasks] = useState<GenerationTaskRecord[]>([]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId],
  );

  const loadTemplates = useCallback(async () => {
    try {
      const suffix = organization?.slug ? `?organization=${encodeURIComponent(organization.slug)}` : '';
      const data = await apiGet<WorkflowTemplateRecord[]>(`/templates/${suffix}`);
      setTemplates(data);
    } catch {
      triggerToast('模板加载失败', 'error');
    }
  }, [organization, triggerToast]);

  const loadProjectWorkflow = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const detail = await apiGet<ProjectDetail>(`/projects/${project.id}/`);
      setProjectDetail(detail);
      const campaignDraft = detail.drafts.find((item) => item.campaign_id === campaign?.id);
      const fallbackDraft = detail.drafts[0];
      const nextDraft = campaignDraft || fallbackDraft || null;
      const nextNodes = nextDraft?.nodes?.length ? nextDraft.nodes : defaultNodes(detail.name);
      const nextEdges = nextDraft?.edges?.length ? nextDraft.edges : defaultEdges;
      setDraft(nextDraft);
      setNodes(nextNodes);
      setEdges(nextEdges);
      setBrandContext(nextDraft?.brand_context || detail.brand_context || {});
      setSelectedNodeId(nextNodes[0]?.id || '');
    } catch {
      triggerToast('工作流草稿加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [campaign?.id, project, triggerToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadProjectWorkflow();
      loadTemplates();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProjectWorkflow, loadTemplates]);

  const persistDraft = async (nextNodes = nodes, nextEdges = edges, silent = false) => {
    if (!project) throw new Error('Project is required');
    const body = {
      project_id: project.id,
      campaign_id: campaign?.id,
      name: draft?.name || 'Default Workflow',
      brand_context: brandContext,
      nodes: nextNodes,
      edges: nextEdges,
      selected_node_id: selectedNodeId,
      status: 'draft',
    };
    const saved = draft
      ? await apiPatch<WorkspaceDraftRecord>(`/drafts/${draft.id}/`, body)
      : await apiPost<WorkspaceDraftRecord>('/drafts/', body);
    setDraft(saved);
    setNodes(saved.nodes);
    setEdges(saved.edges);
    setBrandContext(saved.brand_context);
    if (!silent) triggerToast('画布草稿已保存', 'success');
    return saved;
  };

  const addNode = (type: WorkflowNode['type'], label: string) => {
    idCounterRef.current += 1;
    const id = `${type}-local-${idCounterRef.current}`;
    const nextNode: WorkflowNode = {
      id,
      type,
      label,
      x: 140 + nodes.length * 34,
      y: 120 + nodes.length * 42,
      status: 'idle',
      config: {},
      output: {},
    };
    if (type === 'copy') nextNode.config = { tone: brandContext.tone || '爆款活泼', platform: 'Xiaohongshu' };
    if (type === 'image') nextNode.config = { style: brandContext.visual_style || 'minimalist', aspect_ratio: '1:1' };
    if (type === 'storyboard') nextNode.config = { duration: 30, target_audience: brandContext.audience || '' };
    if (type === 'audio') nextNode.config = { voice_id: 'female_warm', speed: 1 };
    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeId(id);
  };

  const removeSelectedNode = () => {
    if (!selectedNode) return;
    setNodes((prev) => prev.filter((node) => node.id !== selectedNode.id));
    setEdges((prev) => prev.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
    setSelectedNodeId('');
  };

  const connectToNode = (targetId: string) => {
    if (!connectionSource || connectionSource === targetId) return;
    const exists = edges.some((edge) => edge.source === connectionSource && edge.target === targetId);
    if (!exists) {
      idCounterRef.current += 1;
      setEdges((prev) => [
        ...prev,
        { id: `edge-local-${idCounterRef.current}`, source: connectionSource, target: targetId },
      ]);
    }
    setConnectionSource('');
  };

  const handleNodeMouseDown = (event: React.MouseEvent<HTMLDivElement>, node: WorkflowNode) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setDragging({
      id: node.id,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    });
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(10, Math.min(980, event.clientX - rect.left - dragging.offsetX));
    const y = Math.max(10, Math.min(460, event.clientY - rect.top - dragging.offsetY));
    setNodes((prev) => prev.map((node) => (node.id === dragging.id ? { ...node, x, y } : node)));
  };

  const updateSelectedConfig = (key: string, value: string | number) => {
    if (!selectedNode) return;
    setNodes((prev) => prev.map((node) => (
      node.id === selectedNode.id
        ? { ...node, config: { ...node.config, [key]: value } }
        : node
    )));
  };

  const updateBrandContext = (key: keyof BrandContext, value: string) => {
    setBrandContext((prev) => ({ ...prev, [key]: value }));
  };

  const runWorkflow = async () => {
    if (!project) return;
    setLoading(true);
    try {
      const saved = await persistDraft(nodes, edges, true);
      const data = await apiPost<{ draft: WorkspaceDraftRecord; tasks: GenerationTaskRecord[] }>(
        `/drafts/${saved.id}/run/`,
        { username },
      );
      setDraft(data.draft);
      setNodes(data.draft.nodes);
      setEdges(data.draft.edges);
      setLastTasks(data.tasks);
      triggerToast('画布工作流执行完毕', 'success');
    } catch {
      triggerToast('工作流执行失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const retryNode = async () => {
    if (!selectedNode || !feedback.trim()) return;
    setLoading(true);
    try {
      const saved = await persistDraft(nodes, edges, true);
      const data = await apiPost<{ draft: WorkspaceDraftRecord; task: GenerationTaskRecord | null }>(
        `/drafts/${saved.id}/nodes/${selectedNode.id}/retry/`,
        { username, feedback },
      );
      setDraft(data.draft);
      setNodes(data.draft.nodes);
      setEdges(data.draft.edges);
      setLastTasks(data.task ? [data.task] : []);
      setFeedback('');
      triggerToast('节点已按修改意见重试', 'success');
    } catch {
      triggerToast('节点重试失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const shareTemplate = async () => {
    if (!project) return;
    try {
      const saved = await persistDraft(nodes, edges, true);
      const template = await apiPost<WorkflowTemplateRecord>('/templates/', {
        project_id: project.id,
        campaign_id: campaign?.id,
        title: `${project.name} Workflow`,
        description: `${saved.nodes.length} nodes / ${saved.edges.length} edges`,
        username,
        brand_context: brandContext,
        nodes: saved.nodes,
        edges: saved.edges,
        tags: ['workflow', project.slug],
      });
      setTemplates((prev) => [template, ...prev]);
      triggerToast('工作流模板已发布', 'success');
    } catch {
      triggerToast('模板发布失败', 'error');
    }
  };

  const forkTemplate = async (template: WorkflowTemplateRecord) => {
    if (!project) return;
    try {
      const data = await apiPost<{ draft: WorkspaceDraftRecord; template: WorkflowTemplateRecord }>(
        `/templates/${template.id}/fork/`,
        { project_id: project.id, campaign_id: campaign?.id, name: `${template.title} Fork` },
      );
      setDraft(data.draft);
      setNodes(data.draft.nodes);
      setEdges(data.draft.edges);
      setBrandContext(data.draft.brand_context);
      setTemplates((prev) => prev.map((item) => (item.id === data.template.id ? data.template : item)));
      triggerToast('模板已 Fork 到当前项目', 'success');
    } catch {
      triggerToast('模板 Fork 失败', 'error');
    }
  };

  const renderConfigFields = () => {
    if (!selectedNode) return null;
    if (selectedNode.type === 'context') {
      return (
        <textarea
          rows={4}
          value={selectedNode.config.summary || ''}
          onChange={(event) => updateSelectedConfig('summary', event.target.value)}
          className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none"
        />
      );
    }
    if (selectedNode.type === 'copy') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <input value={selectedNode.config.tone || ''} onChange={(event) => updateSelectedConfig('tone', event.target.value)} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
          <input value={selectedNode.config.platform || ''} onChange={(event) => updateSelectedConfig('platform', event.target.value)} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
          <textarea value={selectedNode.config.product_description || ''} onChange={(event) => updateSelectedConfig('product_description', event.target.value)} rows={3} className="col-span-2 bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" />
        </div>
      );
    }
    if (selectedNode.type === 'image') {
      return (
        <div className="space-y-3">
          <textarea value={selectedNode.config.prompt || ''} onChange={(event) => updateSelectedConfig('prompt', event.target.value)} rows={3} className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" />
          <div className="grid grid-cols-2 gap-3">
            <input value={selectedNode.config.style || ''} onChange={(event) => updateSelectedConfig('style', event.target.value)} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
            <input value={selectedNode.config.aspect_ratio || ''} onChange={(event) => updateSelectedConfig('aspect_ratio', event.target.value)} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
          </div>
        </div>
      );
    }
    if (selectedNode.type === 'storyboard') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <input value={selectedNode.config.video_topic || ''} onChange={(event) => updateSelectedConfig('video_topic', event.target.value)} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
          <input type="number" value={selectedNode.config.duration || 30} onChange={(event) => updateSelectedConfig('duration', Number(event.target.value))} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
          <input value={selectedNode.config.target_audience || ''} onChange={(event) => updateSelectedConfig('target_audience', event.target.value)} className="col-span-2 bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-3">
        <input value={selectedNode.config.voice_id || ''} onChange={(event) => updateSelectedConfig('voice_id', event.target.value)} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
        <input type="number" step="0.1" value={selectedNode.config.speed || 1} onChange={(event) => updateSelectedConfig('speed', Number(event.target.value))} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
        <textarea value={selectedNode.config.text || ''} onChange={(event) => updateSelectedConfig('text', event.target.value)} rows={3} className="col-span-2 bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" />
      </div>
    );
  };

  if (!project) {
    return (
      <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-8 shadow-editorial text-xs font-mono text-[var(--editorial-text-gray)]">
        请先在项目库选择当前项目。
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 2xl:grid-cols-12 gap-6 font-mono">
      <section className="2xl:col-span-9 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[var(--editorial-stroke)]">
          <div>
            <h3 className="text-xs font-black uppercase">{projectDetail?.name || project.name}</h3>
            <span className="text-[9px] text-[var(--editorial-text-gray)]">{campaign?.name || 'Default Campaign'} / {draft?.status || 'draft'}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {palette.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => addNode(item.type, item.label)}
                  className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black uppercase hover:bg-[var(--editorial-unselected)] flex items-center gap-1.5"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px]">
          <div
            ref={canvasRef}
            className="relative h-[560px] overflow-hidden editorial-grid bg-[var(--editorial-bg)]"
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={() => setDragging(null)}
            onMouseLeave={() => setDragging(null)}
          >
            <svg className="absolute inset-0 h-full w-full pointer-events-none">
              {edges.map((edge) => {
                const source = nodes.find((node) => node.id === edge.source);
                const target = nodes.find((node) => node.id === edge.target);
                if (!source || !target) return null;
                return (
                  <line
                    key={edge.id}
                    x1={source.x + 220}
                    y1={source.y + 60}
                    x2={target.x}
                    y2={target.y + 60}
                    stroke="var(--editorial-stroke)"
                    strokeWidth="1.5"
                    strokeDasharray="5 5"
                  />
                );
              })}
            </svg>

            {nodes.map((node) => (
              <div
                key={node.id}
                className={`absolute w-[220px] min-h-[118px] border-1.5 shadow-editorial-sm p-3 cursor-move select-none ${nodeStatusClass(node.status)} ${
                  selectedNodeId === node.id ? 'ring-2 ring-[var(--editorial-accent-blue)]' : ''
                }`}
                style={{ left: node.x, top: node.y }}
                onMouseDown={(event) => handleNodeMouseDown(event, node)}
                onClick={(event) => {
                  event.stopPropagation();
                  if (connectionSource && connectionSource !== node.id) connectToNode(node.id);
                  setSelectedNodeId(node.id);
                }}
              >
                <div className="flex items-start justify-between gap-2 border-b border-dashed border-[var(--editorial-stroke)]/40 pb-2">
                  <div>
                    <h4 className="text-xs font-black">{node.label}</h4>
                    <span className="text-[8px] text-[var(--editorial-text-gray)] uppercase">{node.type} / {node.status || 'idle'}</span>
                  </div>
                  <button
                    type="button"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setConnectionSource(connectionSource === node.id ? '' : node.id);
                    }}
                    className={`border border-[var(--editorial-stroke)] p-1 ${connectionSource === node.id ? 'bg-[var(--editorial-stroke)] text-[var(--editorial-bg)]' : ''}`}
                    title="连接"
                  >
                    <GitBranch className="h-3 w-3" />
                  </button>
                </div>
                <pre className="mt-2 max-h-[58px] overflow-hidden whitespace-pre-wrap text-[8px] leading-relaxed text-[var(--editorial-text-gray)]">
                  {compactOutput(node.output)}
                </pre>
                <Move className="absolute bottom-2 right-2 h-3 w-3 text-[var(--editorial-text-gray)]" />
              </div>
            ))}
          </div>

          <aside className="border-l border-[var(--editorial-stroke)] p-4 space-y-4 bg-[var(--editorial-paper)]">
            <div className="flex gap-2">
              <button onClick={() => persistDraft()} className="btn-editorial-secondary px-3 py-2 text-[9px] font-black uppercase flex items-center gap-1.5" type="button">
                <Save className="h-3.5 w-3.5" />
                保存
              </button>
              <button onClick={runWorkflow} disabled={loading} className="btn-editorial-primary px-3 py-2 text-[9px] font-black uppercase flex items-center gap-1.5" type="button">
                <Play className="h-3.5 w-3.5" />
                运行
              </button>
            </div>

            <div className="border border-[var(--editorial-stroke)] p-3">
              <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase mb-3">// BRAND MEMORY</h4>
              <div className="space-y-2">
                {(['brand_name', 'audience', 'tone', 'selling_points', 'visual_style', 'campaign_goal'] as const).map((key) => (
                  <input
                    key={key}
                    value={String(brandContext[key] || '')}
                    onChange={(event) => updateBrandContext(key, event.target.value)}
                    placeholder={key}
                    className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-[10px] py-1.5 focus:outline-none"
                  />
                ))}
              </div>
            </div>

            <div className="border border-[var(--editorial-stroke)] p-3">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">// NODE CONFIG</h4>
                <button type="button" onClick={removeSelectedNode} className="text-[9px] font-black hover:text-rose-500">DEL</button>
              </div>
              {selectedNode ? (
                <div className="space-y-3">
                  <input
                    value={selectedNode.label}
                    onChange={(event) => setNodes((prev) => prev.map((node) => (node.id === selectedNode.id ? { ...node, label: event.target.value } : node)))}
                    className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none font-black"
                  />
                  {renderConfigFields()}
                  <textarea
                    rows={3}
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-2 text-[10px] resize-none focus:outline-none"
                  />
                  <button type="button" onClick={retryNode} className="w-full border border-[var(--editorial-stroke)] py-2 text-[9px] font-black uppercase hover:bg-[var(--editorial-unselected)] flex items-center justify-center gap-1.5">
                    <RotateCcw className="h-3.5 w-3.5" />
                    节点重试
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-[var(--editorial-text-gray)]">未选择节点</p>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="2xl:col-span-3 space-y-6">
        <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial-sm">
          <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-3 mb-4">
            <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase">// TEMPLATE FORK</h3>
            <button type="button" onClick={shareTemplate} className="border border-[var(--editorial-stroke)] p-1.5 hover:bg-[var(--editorial-unselected)]" title="发布模板">
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {templates.length === 0 ? (
              <button type="button" onClick={shareTemplate} className="w-full border border-dashed border-[var(--editorial-stroke)] p-4 text-[10px] text-[var(--editorial-text-gray)] hover:bg-[var(--editorial-unselected)] flex items-center justify-center gap-2">
                <Plus className="h-3.5 w-3.5" />
                发布当前画布
              </button>
            ) : (
              templates.map((template) => (
                <div key={template.id} className="border border-[var(--editorial-stroke)]/50 p-3">
                  <h4 className="text-xs font-black">{template.title}</h4>
                  <div className="text-[8px] text-[var(--editorial-text-gray)] mt-1">{template.nodes.length} nodes / Fork {template.fork_count}</div>
                  <button type="button" onClick={() => forkTemplate(template)} className="mt-3 w-full border border-[var(--editorial-stroke)] py-1.5 text-[9px] font-black uppercase hover:bg-[var(--editorial-unselected)]">
                    Fork
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial-sm">
          <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase border-b border-[var(--editorial-stroke)] pb-3 mb-4">// LAST RUN</h3>
          <div className="space-y-2">
            {lastTasks.length === 0 ? (
              <p className="text-[10px] text-[var(--editorial-text-gray)]">暂无执行记录</p>
            ) : (
              lastTasks.map((task) => (
                <div key={task.id} className="border-b border-dashed border-[var(--editorial-stroke)]/40 pb-2 text-[10px]">
                  <span className="font-black">#{task.id}</span>
                  <span className="mx-2">{task.task_type}</span>
                  <span className="text-[var(--editorial-text-gray)]">{task.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
