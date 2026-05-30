import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Eye,
  Film,
  GitBranch,
  Image as ImageIcon,
  Lock,
  Mic,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Undo2,
} from 'lucide-react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
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
  assets: Array<{ id: number; asset_type: string; title: string; created_at: string }>;
}

interface WorkflowBuilderProps {
  organization: OrganizationRecord | null;
  project: Pick<ProjectRecord, 'id' | 'name' | 'slug'> | null;
  campaign: Pick<CampaignRecord, 'id' | 'name'> | null;
  username: string;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
}

type NodeType = 'context' | 'copy' | 'image_prompt' | 'image_generation' | 'storyboard' | 'audio' | 'retrieval' | 'review' | 'custom_agent';
type LegacyNodeType = NodeType | 'image' | 'rag_search';

type NodePreset = {
  type: NodeType;
  label: string;
  icon: typeof Settings2;
  width: number;
  height: number;
};

const presets: NodePreset[] = [
  { type: 'context', label: '品牌上下文', icon: Settings2, width: 260, height: 166 },
  { type: 'copy', label: '文案节点', icon: Copy, width: 260, height: 166 },
  { type: 'image_prompt', label: '图片提示词', icon: Sparkles, width: 260, height: 166 },
  { type: 'image_generation', label: '图片生成', icon: ImageIcon, width: 260, height: 166 },
  { type: 'storyboard', label: '分镜节点', icon: Film, width: 260, height: 166 },
  { type: 'audio', label: '配音节点', icon: Mic, width: 260, height: 166 },
  { type: 'retrieval', label: '检索节点', icon: Search, width: 260, height: 166 },
  { type: 'review', label: '审核节点', icon: ShieldCheck, width: 260, height: 166 },
  { type: 'custom_agent', label: '自定义智能体', icon: Sparkles, width: 260, height: 176 },
];

const ioSchema: Record<LegacyNodeType, { input: Record<string, string>; output: Record<string, string> }> = {
  context: { input: {}, output: { brand_summary: 'String', tone: 'String', audience: 'String', forbidden_words: 'String[]' } },
  copy: {
    input: { brand_summary: 'String', tone: 'String', audience: 'String' },
    output: { title: 'String', body: 'String', tags: 'String[]', cta: 'String', platform_variants: 'Object' },
  },
  image_prompt: {
    input: { title: 'String', body: 'String', brand_summary: 'String' },
    output: { prompt: 'String', negative_prompt: 'String', aspect_ratio: 'String', style: 'String' },
  },
  image_generation: {
    input: { prompt: 'String', negative_prompt: 'String', aspect_ratio: 'String', style: 'String' },
    output: { image_asset: 'Asset', image_url: 'URL', revised_prompt: 'String' },
  },
  image: {
    input: { prompt: 'String', negative_prompt: 'String', aspect_ratio: 'String', style: 'String' },
    output: { image_asset: 'Asset', image_url: 'URL', revised_prompt: 'String' },
  },
  storyboard: {
    input: { title: 'String', body: 'String', target_audience: 'String' },
    output: { shots: 'Shot[]', duration: 'Number', visuals: 'String[]', voiceover: 'String', transitions: 'String[]' },
  },
  audio: {
    input: { voiceover: 'String', voice_id: 'String', speed: 'Number' },
    output: { audio_asset: 'Asset', audio_url: 'URL', subtitle_timeline: 'Subtitle[]' },
  },
  retrieval: {
    input: { query: 'String', scope: 'String' },
    output: { references: 'Reference[]', insights: 'String[]', brand_memory: 'Object' },
  },
  rag_search: {
    input: { query: 'String', scope: 'String' },
    output: { references: 'Reference[]', insights: 'String[]', brand_memory: 'Object' },
  },
  review: {
    input: { title: 'String', body: 'String', tags: 'String[]' },
    output: { sensitive_word_issues: 'Issue[]', brand_consistency: 'Score', channel_rules: 'Issue[]' },
  },
  custom_agent: {
    input: { input: 'Any' },
    output: { response: 'String', metadata: 'Object' },
  },
};

const defaultNodeConfig = (type: NodeType, brandContext: BrandContext) => {
  if (type === 'copy') return { tone: brandContext.tone || '清晰专业', platform: 'Xiaohongshu' };
  if (type === 'image_prompt') return { style: brandContext.visual_style || 'editorial', aspect_ratio: '1:1', prompt: '', negative_prompt: '低清晰度、夸张承诺、品牌不一致' };
  if (type === 'image_generation') return { model: 'image-default', failure_strategy: '失败后保留提示词并重试一次' };
  if (type === 'storyboard') return { duration: 30, target_audience: brandContext.audience || '' };
  if (type === 'audio') return { voice_id: 'female_warm', speed: 1 };
  if (type === 'retrieval') return { retrieval_scope: '品牌记忆和资产库', query: brandContext.campaign_goal || '' };
  if (type === 'review') return { forbidden_words: '绝对、第一、包治', channel_rules: '平台基础合规规则' };
  if (type === 'custom_agent') return { name: '自定义智能体', icon: 'Sparkles', prompt: '', input_fields: 'brief, brand_context', output_schema_text: '{ "response": "string" }', model: 'gpt-mock-agent', temperature: 0.7, failure_strategy: '重试一次后跳过' };
  return { summary: brandContext.campaign_goal || '' };
};

const defaultNodes = (projectName: string): WorkflowNode[] => [
  {
    id: 'brand-brief',
    type: 'context',
    label: '品牌上下文',
    x: 72,
    y: 118,
    width: 260,
    height: 166,
    status: 'idle',
    config: { summary: `${projectName} 品牌上下文`, input_schema: {}, output_schema: ioSchema.context.output },
    output: {},
    input_schema: ioSchema.context.input,
    output_schema: ioSchema.context.output,
  },
  {
    id: 'copy-agent',
    type: 'copy',
    label: '文案节点',
    x: 384,
    y: 98,
    width: 260,
    height: 166,
    status: 'idle',
    config: { tone: '清晰专业', platform: 'Xiaohongshu', input_schema: ioSchema.copy.input, output_schema: ioSchema.copy.output },
    output: {},
    input_schema: ioSchema.copy.input,
    output_schema: ioSchema.copy.output,
  },
  {
    id: 'image-prompt-agent',
    type: 'image_prompt',
    label: '图片提示词',
    x: 696,
    y: 116,
    width: 260,
    height: 166,
    status: 'idle',
    config: { style: 'editorial', aspect_ratio: '1:1', input_schema: ioSchema.image_prompt.input, output_schema: ioSchema.image_prompt.output },
    output: {},
    input_schema: ioSchema.image_prompt.input,
    output_schema: ioSchema.image_prompt.output,
  },
  {
    id: 'review-agent',
    type: 'review',
    label: '审核节点',
    x: 384,
    y: 340,
    width: 260,
    height: 166,
    status: 'idle',
    config: { forbidden_words: '绝对、第一、包治', channel_rules: '平台基础合规规则', input_schema: ioSchema.review.input, output_schema: ioSchema.review.output },
    output: {},
    input_schema: ioSchema.review.input,
    output_schema: ioSchema.review.output,
  },
];

const defaultEdges: WorkflowEdge[] = [
  { id: 'edge-brand-copy', source: 'brand-brief', target: 'copy-agent' },
  { id: 'edge-copy-image-prompt', source: 'copy-agent', target: 'image-prompt-agent' },
  { id: 'edge-copy-review', source: 'copy-agent', target: 'review-agent' },
];

const statusLabels: Record<string, string> = {
  idle: '未运行',
  queued: '排队',
  running: '运行',
  succeeded: '成功',
  failed: '失败',
  skipped: '跳过',
};

const nodeTypeLabels: Record<string, string> = {
  context: '品牌上下文',
  copy: '文案',
  image_prompt: '图片提示词',
  image_generation: '图片生成',
  image: '图片生成',
  storyboard: '分镜',
  audio: '配音',
  retrieval: '检索',
  rag_search: '检索',
  review: '审核',
  custom_agent: '自定义智能体',
};

const normalizeNodeType = (type: string): LegacyNodeType => {
  if (type === 'rag_search') return 'retrieval';
  if (type === 'image') return 'image_generation';
  return (type as LegacyNodeType) in ioSchema ? (type as LegacyNodeType) : 'custom_agent';
};

function nodeStatusClass(status?: string) {
  if (status === 'running') return 'border-blue-500 bg-blue-50 dark:bg-blue-950/20';
  if (status === 'succeeded') return 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20';
  if (status === 'failed') return 'border-rose-500 bg-rose-50 dark:bg-rose-950/20';
  if (status === 'queued') return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20';
  if (status === 'skipped') return 'border-zinc-400 bg-zinc-100 dark:bg-zinc-900/40';
  return 'border-[var(--editorial-stroke)] bg-[var(--editorial-paper)]';
}

function nodeStatusDotClass(status?: string) {
  if (status === 'running') return 'bg-blue-500';
  if (status === 'succeeded') return 'bg-emerald-500';
  if (status === 'failed') return 'bg-rose-500';
  if (status === 'queued') return 'bg-yellow-500';
  if (status === 'skipped') return 'bg-zinc-500';
  return 'bg-[var(--editorial-text-gray)]';
}

function compactOutput(output?: Record<string, unknown>) {
  if (!output || Object.keys(output).length === 0) return '暂无输出内容';
  return JSON.stringify(output, null, 2).slice(0, 180);
}

function schemaText(schema?: Record<string, string>) {
  if (!schema || Object.keys(schema).length === 0) return '无';
  return Object.entries(schema)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' / ');
}

function schemasCompatible(source?: Record<string, string>, target?: Record<string, string>) {
  const sourceTypes = new Set(Object.values(source || {}));
  const targetTypes = new Set(Object.values(target || {}));
  if (sourceTypes.size === 0 || targetTypes.size === 0) return true;
  if (sourceTypes.has('Any') || targetTypes.has('Any')) return true;
  if (sourceTypes.has('String') && targetTypes.has('String')) return true;
  if (sourceTypes.has('String[]') && targetTypes.has('String[]')) return true;
  if (sourceTypes.has('Object') && targetTypes.has('Object')) return true;
  return [...sourceTypes].some((item) => targetTypes.has(item));
}

function normalizeWorkflowNode(node: WorkflowNode, brandContext: BrandContext): WorkflowNode {
  const normalizedType = normalizeNodeType(node.type);
  const schema = ioSchema[normalizedType] || ioSchema.custom_agent;
  return {
    ...node,
    type: normalizedType,
    label: node.label || nodeTypeLabels[normalizedType] || '节点',
    width: node.width || 260,
    height: node.height || 166,
    input_schema: node.input_schema || schema.input,
    output_schema: node.output_schema || schema.output,
    config: {
      ...defaultNodeConfig(normalizedType as NodeType, brandContext),
      ...(node.config || {}),
      input_schema: node.input_schema || schema.input,
      output_schema: node.output_schema || schema.output,
    },
  };
}

interface FlowNodeData {
  [key: string]: unknown;
  node: WorkflowNode;
  iconLabel: string;
  onSelectNode: (id: string) => void;
  onStartConnect: (id: string) => void;
}

type WorkflowSnapshot = {
  id: string;
  label: string;
  createdAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  brandContext: BrandContext;
  selectedNodeId: string;
};

function WorkflowFlowNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const { node, iconLabel, onSelectNode, onStartConnect } = data;
  const preset = presets.find((item) => item.type === node.type as NodeType);
  const Icon = preset?.icon || Settings2;
  const inputEntries = Object.entries(node.input_schema || {}).slice(0, 3);
  const outputEntries = Object.entries(node.output_schema || {}).slice(0, 3);
  return (
    <div
      className={`w-full h-full border-1.5 bg-[var(--editorial-paper)] shadow-editorial-sm p-3 overflow-hidden ${nodeStatusClass(node.status)} ${selected ? 'ring-2 ring-[var(--editorial-accent-blue)]' : ''}`}
      onDoubleClick={() => onSelectNode(node.id)}
    >
      <Handle
        id="input"
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !border-2 !border-[var(--editorial-paper)] !bg-[var(--editorial-accent-blue)]"
        title="输入端口"
      />
      <Handle
        id="output"
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !border-2 !border-[var(--editorial-paper)] !bg-emerald-600"
        title="输出端口"
      />
      <div className="flex items-start justify-between gap-2 border-b border-dashed border-[var(--editorial-stroke)]/40 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0" />
            <h4 className="text-xs font-black truncate">{node.label}</h4>
          </div>
          <span className="mt-1 flex items-center gap-1 text-[8px] text-[var(--editorial-text-gray)]">
            <span className={`h-1.5 w-1.5 rounded-full ${nodeStatusDotClass(node.status)}`} />
            {nodeTypeLabels[iconLabel] || iconLabel} / {statusLabels[node.status || 'idle'] || node.status || '未运行'}
          </span>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onStartConnect(node.id);
          }}
          className="border border-[var(--editorial-stroke)] p-1"
          title="连接"
          aria-label={`从 ${node.label} 开始连线`}
        >
          <GitBranch className="h-3 w-3" />
        </button>
      </div>
      <pre className="mt-2 h-[70px] overflow-hidden whitespace-pre-wrap text-[8px] leading-relaxed text-[var(--editorial-text-gray)]">
        {compactOutput(node.output)}
      </pre>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[8px] text-[var(--editorial-text-gray)]">
        <div className="min-w-0 border border-[var(--editorial-stroke)]/20 px-1.5 py-1">
          <span className="block font-black text-[var(--editorial-text)]">输入</span>
          <span className="block truncate" title={schemaText(node.input_schema)}>{inputEntries.length ? inputEntries.map(([key]) => key).join(' / ') : '无'}</span>
        </div>
        <div className="min-w-0 border border-[var(--editorial-stroke)]/20 px-1.5 py-1">
          <span className="block font-black text-[var(--editorial-text)]">输出</span>
          <span className="block truncate" title={schemaText(node.output_schema)}>{outputEntries.length ? outputEntries.map(([key]) => key).join(' / ') : '无'}</span>
        </div>
      </div>
    </div>
  );
}

export function WorkflowBuilder({ organization, project, campaign, username, triggerToast }: WorkflowBuilderProps) {
  const { fitView, getViewport } = useReactFlow();
  const idCounterRef = useRef(0);
  const dragSnapshotRef = useRef<WorkflowSnapshot | null>(null);
  const clipboardRef = useRef<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [draft, setDraft] = useState<WorkspaceDraftRecord | null>(null);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [brandContext, setBrandContext] = useState<BrandContext>({});
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [connectionSource, setConnectionSource] = useState('');
  const [templates, setTemplates] = useState<WorkflowTemplateRecord[]>([]);
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastTasks, setLastTasks] = useState<GenerationTaskRecord[]>([]);
  const [history, setHistory] = useState<WorkflowSnapshot[]>([]);
  const [future, setFuture] = useState<WorkflowSnapshot[]>([]);
  const [versions, setVersions] = useState<WorkflowSnapshot[]>([]);
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(true);
  const [readOnly, setReadOnly] = useState(() => new URLSearchParams(window.location.search).get('share') === 'readonly');
  const [templateScope, setTemplateScope] = useState<'organization' | 'public'>('organization');
  const [showCustomAgent, setShowCustomAgent] = useState(false);
  const [customAgent, setCustomAgent] = useState({ name: '自定义智能体', icon: 'Sparkles', prompt: '', input_fields: 'brief, brand_context', output_schema_text: '{ "response": "string" }', model: 'gpt-mock-agent', temperature: 0.7, failure_strategy: '重试一次后跳过' });

  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const makeSnapshot = useCallback((label: string): WorkflowSnapshot => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    label,
    createdAt: new Date().toISOString(),
    nodes: nodes.map((node) => ({ ...node, config: { ...node.config }, output: { ...(node.output || {}) } })),
    edges: edges.map((edge) => ({ ...edge })),
    brandContext: { ...brandContext },
    selectedNodeId,
  }), [brandContext, edges, nodes, selectedNodeId]);

  const restoreSnapshot = useCallback((snapshot: WorkflowSnapshot) => {
    setNodes(snapshot.nodes.map((node) => ({ ...node, config: { ...node.config }, output: { ...(node.output || {}) } })));
    setEdges(snapshot.edges.map((edge) => ({ ...edge })));
    setBrandContext({ ...snapshot.brandContext });
    setSelectedNodeId(snapshot.selectedNodeId);
    setSelectedNodeIds(snapshot.selectedNodeId ? [snapshot.selectedNodeId] : []);
  }, []);

  const pushSnapshot = useCallback((snapshot: WorkflowSnapshot) => {
    setHistory((prev) => [...prev.slice(-24), snapshot]);
    setFuture([]);
  }, []);

  const markHistory = useCallback((label: string) => {
    pushSnapshot(makeSnapshot(label));
  }, [makeSnapshot, pushSnapshot]);

  const undo = useCallback(() => {
    setHistory((prev) => {
      const snapshot = prev[prev.length - 1];
      if (!snapshot) return prev;
      setFuture((items) => [makeSnapshot('重做点'), ...items].slice(0, 25));
      restoreSnapshot(snapshot);
      return prev.slice(0, -1);
    });
  }, [makeSnapshot, restoreSnapshot]);

  const redo = useCallback(() => {
    setFuture((prev) => {
      const snapshot = prev[0];
      if (!snapshot) return prev;
      setHistory((items) => [...items.slice(-24), makeSnapshot('撤销点')]);
      restoreSnapshot(snapshot);
      return prev.slice(1);
    });
  }, [makeSnapshot, restoreSnapshot]);
  const schemaWarnings = useMemo(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return edges.flatMap((edge) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      if (!source || !target) return [`连接 ${edge.source} -> ${edge.target} 指向不存在的节点。`];
      const sourceSchema = source.output_schema || ioSchema[source.type as NodeType]?.output || {};
      const targetSchema = target.input_schema || ioSchema[target.type as NodeType]?.input || {};
      const sourceTypes = new Set(Object.values(sourceSchema));
      const targetTypes = new Set(Object.values(targetSchema));
      if (sourceTypes.has('Any') || targetTypes.has('Any')) return [];
      const compatible = [...sourceTypes].some((item) => targetTypes.has(item));
      return compatible ? [] : [`${source.label} 输出与 ${target.label} 输入类型不匹配。`];
    });
  }, [edges, nodes]);

  const nodeTypes = useMemo(() => ({ workflowNode: WorkflowFlowNode }), []);
  const flowNodes = useMemo<Node<FlowNodeData>[]>(
    () =>
      nodes.map((node) => {
        const width = node.width || 240;
        const height = node.height || 144;
        return {
          id: node.id,
          type: 'workflowNode',
          position: { x: node.x, y: node.y },
          data: {
            node,
            iconLabel: node.type,
            onSelectNode: setSelectedNodeId,
            onStartConnect: setConnectionSource,
          },
          selected: selectedNodeId === node.id,
          width,
          height,
          initialWidth: width,
          initialHeight: height,
          style: { width, height },
        };
      }),
    [nodes, selectedNodeId],
  );
  const flowEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: 'var(--editorial-stroke)', strokeWidth: 1.5 },
      })),
    [edges],
  );

  const runPreview = useMemo(() => ({
    stepCount: nodes.length,
    estimatedCost: `$${(nodes.length * 0.03).toFixed(2)}`,
    estimatedMinutes: Math.max(1, Math.round(nodes.length * 0.8)),
  }), [nodes.length]);

  useEffect(() => {
    if (flowNodes.length === 0) return;
    const timer = window.setTimeout(() => {
      fitView({ padding: 0.18, includeHiddenNodes: false, duration: 220 });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [fitView, flowNodes.length, draft?.id]);

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
      const nextNodes = nextDraft?.nodes?.length
        ? nextDraft.nodes.map((node) => normalizeWorkflowNode(node, nextDraft?.brand_context || detail.brand_context || {}))
        : defaultNodes(detail.name);
      const nextEdges = nextDraft?.edges?.length ? nextDraft.edges : defaultEdges;
      setDraft(nextDraft);
      setNodes(nextNodes);
      setEdges(nextEdges);
      setBrandContext(nextDraft?.brand_context || detail.brand_context || {});
      setSelectedNodeId(nextNodes[0]?.id || '');
      setSelectedNodeIds(nextNodes[0]?.id ? [nextNodes[0].id] : []);
      setCustomAgent((prev) => ({ ...prev, ...defaultNodeConfig('custom_agent', nextDraft?.brand_context || detail.brand_context || {}) }));
      const snapshot: WorkflowSnapshot = {
        id: `${detail.id}-${nextDraft?.id || 'draft'}`,
        label: nextDraft ? '加载草稿' : '默认工作流',
        createdAt: new Date().toISOString(),
        nodes: nextNodes.map((node) => ({ ...node, config: { ...node.config }, output: { ...(node.output || {}) } })),
        edges: nextEdges.map((edge) => ({ ...edge })),
        brandContext: { ...(nextDraft?.brand_context || detail.brand_context || {}) },
        selectedNodeId: nextNodes[0]?.id || '',
      };
      setHistory([snapshot]);
      setFuture([]);
      setVersions([snapshot]);
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
    const saved = draft ? await apiPatch<WorkspaceDraftRecord>(`/drafts/${draft.id}/`, body) : await apiPost<WorkspaceDraftRecord>('/drafts/', body);
    setDraft(saved);
    setNodes(saved.nodes.map((node) => normalizeWorkflowNode(node, saved.brand_context || brandContext)));
    setEdges(saved.edges);
    setBrandContext(saved.brand_context);
    const snapshot: WorkflowSnapshot = {
      id: `${saved.id}-${Date.now()}`,
      label: silent ? '自动保存' : '手动保存',
      createdAt: new Date().toISOString(),
      nodes: saved.nodes.map((node) => normalizeWorkflowNode(node, saved.brand_context || brandContext)),
      edges: saved.edges.map((edge) => ({ ...edge })),
      brandContext: { ...saved.brand_context },
      selectedNodeId,
    };
    setHistory((prev) => [...prev.slice(-24), snapshot]);
    setVersions((prev) => [snapshot, ...prev].slice(0, 12));
    setFuture([]);
    if (!silent) triggerToast('画布草稿已保存', 'success');
    return saved;
  };

  const addNode = (type: NodeType, label: string) => {
    if (readOnly) return;
    markHistory('新增节点');
    idCounterRef.current += 1;
    const id = `${type}-local-${idCounterRef.current}`;
    const preset = presets.find((item) => item.type === type);
    const nextNode: WorkflowNode = {
      id,
      type,
      label,
      x: 140 + nodes.length * 28,
      y: 120 + nodes.length * 38,
      width: preset?.width || 240,
      height: preset?.height || 144,
      status: 'idle',
      config: defaultNodeConfig(type, brandContext),
      output: {},
      input_schema: ioSchema[type].input,
      output_schema: ioSchema[type].output,
    };
    if (type === 'custom_agent') {
      nextNode.config = { ...nextNode.config, ...customAgent };
    }
    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
  };

  const updateNode = (id: string, patch: Partial<WorkflowNode>) => {
    if (readOnly) return;
    markHistory(`编辑节点 ${id}`);
    setNodes((prev) => prev.map((node) => (node.id === id ? { ...node, ...patch } : node)));
  };

  const updateSelectedConfig = (key: string, value: string | number) => {
    if (!selectedNode) return;
    if (readOnly) return;
    updateNode(selectedNode.id, {
      config: { ...selectedNode.config, [key]: value },
    });
  };

  const removeSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    if (readOnly) return;
    markHistory('删除节点');
    setNodes((prev) => prev.filter((node) => node.id !== selectedNode.id));
    setEdges((prev) => prev.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
    setSelectedNodeId('');
    setSelectedNodeIds([]);
  }, [markHistory, readOnly, selectedNode]);

  const connectToNode = (targetId: string) => {
    if (readOnly) return;
    if (!connectionSource || connectionSource === targetId) return;
    markHistory('创建连线');
    const source = nodes.find((node) => node.id === connectionSource);
    const target = nodes.find((node) => node.id === targetId);
    if (source && target && !schemasCompatible(source.output_schema || ioSchema[source.type as NodeType]?.output, target.input_schema || ioSchema[target.type as NodeType]?.input)) {
      triggerToast('这两个节点的输入输出类型不兼容', 'error');
      setConnectionSource('');
      return;
    }
    const exists = edges.some((edge) => edge.source === connectionSource && edge.target === targetId);
    if (!exists) {
      idCounterRef.current += 1;
      setEdges((prev) => [...prev, { id: `edge-local-${idCounterRef.current}`, source: connectionSource, target: targetId }]);
    }
    setConnectionSource('');
  };

  const toFlowNode = useCallback(
    (node: WorkflowNode): Node<FlowNodeData> => {
      const width = node.width || 240;
      const height = node.height || 144;
      return {
        id: node.id,
        type: 'workflowNode',
        position: { x: node.x, y: node.y },
        data: {
          node,
          iconLabel: node.type,
          onSelectNode: setSelectedNodeId,
          onStartConnect: setConnectionSource,
        },
        selected: selectedNodeId === node.id,
        width,
        height,
        initialWidth: width,
        initialHeight: height,
        style: { width, height },
      };
    },
    [selectedNodeId],
  );

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    if (readOnly) return;
    setNodes((current) => {
      const nextFlowNodes = applyNodeChanges(changes, current.map(toFlowNode));
      return nextFlowNodes.map((flowNode) => {
        const original = (flowNode.data as FlowNodeData).node;
        return {
          ...original,
          x: flowNode.position.x,
          y: flowNode.position.y,
        };
      });
    });
  }, [readOnly, toFlowNode]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (readOnly) return;
    const nextFlowEdges = applyEdgeChanges(changes, flowEdges);
    setEdges(nextFlowEdges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })));
  }, [flowEdges, readOnly]);

  const handleConnect = useCallback((connection: Connection) => {
    if (readOnly) return;
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    if (source && target && !schemasCompatible(source.output_schema || ioSchema[source.type as NodeType]?.output, target.input_schema || ioSchema[target.type as NodeType]?.input)) {
      triggerToast('这两个节点的输入输出类型不兼容', 'error');
      return;
    }
    const id = `edge-${connection.source}-${connection.target}`;
    const nextFlowEdges = addEdge({ ...connection, id, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, flowEdges);
    setEdges(nextFlowEdges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target })));
  }, [flowEdges, nodes, readOnly, triggerToast]);

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (readOnly || !connection.source || !connection.target || connection.source === connection.target) return false;
    const source = nodes.find((node) => node.id === connection.source);
    const target = nodes.find((node) => node.id === connection.target);
    if (!source || !target) return false;
    return schemasCompatible(source.output_schema || ioSchema[normalizeNodeType(source.type)]?.output, target.input_schema || ioSchema[normalizeNodeType(target.type)]?.input);
  }, [nodes, readOnly]);

  const handleSelectionChange = useCallback(({ nodes: selected }: OnSelectionChangeParams<Node<FlowNodeData>, Edge>) => {
    const ids = selected.map((node) => node.id);
    setSelectedNodeIds(ids);
    if (ids[0]) setSelectedNodeId(ids[0]);
  }, []);

  const copySelection = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const selected = nodes.filter((node) => selectedNodeIds.includes(node.id));
    const selectedSet = new Set(selected.map((node) => node.id));
    clipboardRef.current = {
      nodes: selected.map((node) => ({ ...node, config: { ...node.config }, output: { ...(node.output || {}) } })),
      edges: edges.filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target)).map((edge) => ({ ...edge })),
    };
    triggerToast('已复制选中节点', 'info');
  }, [edges, nodes, selectedNodeIds, triggerToast]);

  const pasteSelection = useCallback(() => {
    if (readOnly || !clipboardRef.current) return;
    markHistory('粘贴节点');
    const idMap = new Map<string, string>();
    const viewport = getViewport();
    const nextNodes = clipboardRef.current.nodes.map((node) => {
      idCounterRef.current += 1;
      const id = `${node.type}-copy-${idCounterRef.current}`;
      idMap.set(node.id, id);
      return {
        ...node,
        id,
        label: `${node.label} 副本`,
        x: node.x + 48 / viewport.zoom,
        y: node.y + 48 / viewport.zoom,
        status: 'idle' as const,
      };
    });
    const nextEdges = clipboardRef.current.edges
      .map((edge) => {
        const source = idMap.get(edge.source);
        const target = idMap.get(edge.target);
        if (!source || !target) return null;
        idCounterRef.current += 1;
        return { id: `edge-copy-${idCounterRef.current}`, source, target };
      })
      .filter((edge): edge is WorkflowEdge => Boolean(edge));
    setNodes((prev) => [...prev, ...nextNodes]);
    setEdges((prev) => [...prev, ...nextEdges]);
    setSelectedNodeIds(nextNodes.map((node) => node.id));
    setSelectedNodeId(nextNodes[0]?.id || '');
    triggerToast('已粘贴节点', 'success');
  }, [getViewport, markHistory, readOnly, triggerToast]);

  const rollbackVersion = useCallback((snapshot: WorkflowSnapshot) => {
    if (readOnly) return;
    markHistory('版本回滚前');
    restoreSnapshot(snapshot);
    triggerToast('已回滚到选中版本', 'success');
  }, [markHistory, readOnly, restoreSnapshot, triggerToast]);

  const createReadOnlyShare = useCallback(async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('share', 'readonly');
    await navigator.clipboard?.writeText(url.toString()).catch(() => undefined);
    setReadOnly(true);
    triggerToast('只读分享链接已复制，当前页面已切换为只读预览', 'info');
  }, [triggerToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      const editable = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA' || activeElement?.isContentEditable;
      if (editable && !(event.metaKey || event.ctrlKey)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelection();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteSelection();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      if ((event.metaKey || event.ctrlKey) && (event.key.toLowerCase() === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
        event.preventDefault();
        redo();
      }
      if (event.key === 'Delete' && selectedNodeId && !readOnly) {
        event.preventDefault();
        removeSelectedNode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [copySelection, pasteSelection, readOnly, redo, removeSelectedNode, selectedNodeId, undo]);

  const runWorkflow = async () => {
    if (!project) return;
    if (readOnly) {
      triggerToast('只读分享模式下不能运行工作流', 'info');
      return;
    }
    setLoading(true);
    try {
      markHistory('运行前保存');
      const saved = await persistDraft(nodes, edges, true);
      const data = await apiPost<{ draft: WorkspaceDraftRecord; tasks: GenerationTaskRecord[] }>(`/drafts/${saved.id}/run/`, { username });
      setDraft(data.draft);
      setNodes(data.draft.nodes.map((node) => normalizeWorkflowNode(node, data.draft.brand_context || brandContext)));
      setEdges(data.draft.edges);
      setLastTasks(data.tasks);
      setVersions((prev) => [{ id: `${data.draft.id}-${Date.now()}`, label: '运行版本', createdAt: new Date().toISOString(), nodes: data.draft.nodes, edges: data.draft.edges, brandContext: data.draft.brand_context, selectedNodeId: data.draft.selected_node_id }, ...prev].slice(0, 12));
      triggerToast('画布工作流执行完毕', 'success');
    } catch {
      triggerToast('工作流执行失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const retryNode = async () => {
    if (!selectedNode || !feedback.trim()) return;
    if (readOnly) return;
    setLoading(true);
    try {
      markHistory(`节点重试 ${selectedNode.id}`);
      const saved = await persistDraft(nodes, edges, true);
      const data = await apiPost<{ draft: WorkspaceDraftRecord; task: GenerationTaskRecord | null }>(`/drafts/${saved.id}/nodes/${selectedNode.id}/retry/`, {
        username,
        feedback,
      });
      setDraft(data.draft);
      setNodes(data.draft.nodes.map((node) => normalizeWorkflowNode(node, data.draft.brand_context || brandContext)));
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
    if (readOnly) return;
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
        is_public: templateScope === 'public',
      });
      setTemplates((prev) => [template, ...prev]);
      triggerToast('工作流模板已发布', 'success');
    } catch {
      triggerToast('模板发布失败', 'error');
    }
  };

  const forkTemplate = async (template: WorkflowTemplateRecord) => {
    if (!project) return;
    if (readOnly) return;
    try {
      const data = await apiPost<{ draft: WorkspaceDraftRecord; template: WorkflowTemplateRecord }>(`/templates/${template.id}/fork/`, {
        project_id: project.id,
        campaign_id: campaign?.id,
        name: `${template.title} Fork`,
      });
      setDraft(data.draft);
      setNodes(data.draft.nodes.map((node) => normalizeWorkflowNode(node, data.draft.brand_context || brandContext)));
      setEdges(data.draft.edges);
      setBrandContext(data.draft.brand_context);
      setTemplates((prev) => prev.map((item) => (item.id === data.template.id ? data.template : item)));
      triggerToast('模板已复制到当前项目', 'success');
    } catch {
      triggerToast('模板复制失败', 'error');
    }
  };

  const saveCustomAgent = () => {
    if (!customAgent.name.trim()) return;
    addNode('custom_agent', customAgent.name.trim());
    setShowCustomAgent(false);
  };

  const renderConfigFields = () => {
    if (!selectedNode) return null;
    if (selectedNode.type === 'custom_agent') {
      return (
        <div className="space-y-3">
          <input value={selectedNode.config.name || ''} onChange={(event) => updateSelectedConfig('name', event.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="智能体名称" />
          <textarea value={selectedNode.config.prompt || ''} onChange={(event) => updateSelectedConfig('prompt', event.target.value)} rows={4} className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="Prompt" />
          <textarea value={selectedNode.config.input_fields || ''} onChange={(event) => updateSelectedConfig('input_fields', event.target.value)} rows={2} className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="输入字段" />
          <textarea value={selectedNode.config.output_schema_text || ''} onChange={(event) => updateSelectedConfig('output_schema_text', event.target.value)} rows={2} className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="输出 schema" />
          <input value={selectedNode.config.model || ''} onChange={(event) => updateSelectedConfig('model', event.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="模型" />
          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={selectedNode.config.temperature ?? 0.7}
            onChange={(event) => updateSelectedConfig('temperature', Number(event.target.value))}
            className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none"
          />
          <input value={selectedNode.config.failure_strategy || ''} onChange={(event) => updateSelectedConfig('failure_strategy', event.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="失败策略" />
        </div>
      );
    }
    if (selectedNode.type === 'context') {
      return (
        <div className="space-y-3">
          <textarea rows={4} value={selectedNode.config.summary || ''} onChange={(event) => updateSelectedConfig('summary', event.target.value)} className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="品牌摘要" />
          <input value={selectedNode.config.tone || ''} onChange={(event) => updateSelectedConfig('tone', event.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="品牌语调" />
          <input value={selectedNode.config.target_audience || ''} onChange={(event) => updateSelectedConfig('target_audience', event.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="目标受众" />
          <input value={selectedNode.config.forbidden_words || ''} onChange={(event) => updateSelectedConfig('forbidden_words', event.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="禁用词" />
        </div>
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
    if (selectedNode.type === 'image_prompt') {
      return (
        <div className="space-y-3">
          <textarea value={selectedNode.config.prompt || ''} onChange={(event) => updateSelectedConfig('prompt', event.target.value)} rows={3} className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="结构化 prompt" />
          <textarea value={selectedNode.config.negative_prompt || ''} onChange={(event) => updateSelectedConfig('negative_prompt', event.target.value)} rows={2} className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="负面 prompt" />
          <div className="grid grid-cols-2 gap-3">
            <input value={selectedNode.config.style || ''} onChange={(event) => updateSelectedConfig('style', event.target.value)} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
            <input value={selectedNode.config.aspect_ratio || ''} onChange={(event) => updateSelectedConfig('aspect_ratio', event.target.value)} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
          </div>
        </div>
      );
    }
    if (selectedNode.type === 'image_generation') {
      return (
        <div className="space-y-3">
          <input value={selectedNode.config.model || ''} onChange={(event) => updateSelectedConfig('model', event.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="图像模型" />
          <input value={selectedNode.config.aspect_ratio || ''} onChange={(event) => updateSelectedConfig('aspect_ratio', event.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="画幅" />
          <input value={selectedNode.config.failure_strategy || ''} onChange={(event) => updateSelectedConfig('failure_strategy', event.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="失败策略" />
        </div>
      );
    }
    if (selectedNode.type === 'storyboard') {
      return (
        <div className="grid grid-cols-2 gap-3">
          <input value={selectedNode.config.video_topic || ''} onChange={(event) => updateSelectedConfig('video_topic', event.target.value)} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
          <input type="number" value={selectedNode.config.duration || 30} onChange={(event) => updateSelectedConfig('duration', Number(event.target.value))} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
          <input value={selectedNode.config.target_audience || ''} onChange={(event) => updateSelectedConfig('target_audience', event.target.value)} className="col-span-2 bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
          <textarea value={selectedNode.config.text || ''} onChange={(event) => updateSelectedConfig('text', event.target.value)} rows={3} className="col-span-2 bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="镜头、画面、口播和转场要求" />
        </div>
      );
    }
    if (selectedNode.type === 'retrieval') {
      return (
        <div className="space-y-3">
          <input value={selectedNode.config.retrieval_scope || ''} onChange={(event) => updateSelectedConfig('retrieval_scope', event.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="检索范围" />
          <textarea value={selectedNode.config.prompt || ''} onChange={(event) => updateSelectedConfig('prompt', event.target.value)} rows={3} className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="检索问题或关键词" />
        </div>
      );
    }
    if (selectedNode.type === 'review') {
      return (
        <div className="space-y-3">
          <textarea value={selectedNode.config.forbidden_words || ''} onChange={(event) => updateSelectedConfig('forbidden_words', event.target.value)} rows={2} className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="敏感词 / 禁用词" />
          <textarea value={selectedNode.config.channel_rules || ''} onChange={(event) => updateSelectedConfig('channel_rules', event.target.value)} rows={3} className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="渠道规则和品牌一致性检查" />
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-3">
        <input value={selectedNode.config.voice_id || ''} onChange={(event) => updateSelectedConfig('voice_id', event.target.value)} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
        <input type="number" step="0.1" value={selectedNode.config.speed || 1} onChange={(event) => updateSelectedConfig('speed', Number(event.target.value))} className="bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
        <textarea value={selectedNode.config.text || ''} onChange={(event) => updateSelectedConfig('text', event.target.value)} rows={3} className="col-span-2 bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="配音文本和字幕时间轴要求" />
      </div>
    );
  };

  if (!project) {
    return <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-8 shadow-editorial text-xs font-mono text-[var(--editorial-text-gray)]">请先在项目库选择当前项目。</div>;
  }

  return (
    <div className="space-y-5 font-mono min-w-0">
      <section className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial overflow-hidden min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[var(--editorial-stroke)]">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black uppercase truncate max-w-[260px]">{projectDetail?.name || project.name}</h3>
              {readOnly && <span className="border border-[var(--editorial-stroke)] px-1.5 py-0.5 text-[8px] flex items-center gap-1"><Lock className="h-3 w-3" />只读</span>}
            </div>
            <span className="text-[9px] text-[var(--editorial-text-gray)]">{campaign?.name || 'Default Campaign'} / {draft?.status || 'draft'} / {selectedNodeIds.length} 个已选</span>
          </div>
          <div className="flex flex-wrap gap-2 max-w-full">
            {presets.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  type="button"
                  disabled={readOnly}
                  onClick={() => addNode(item.type, item.label)}
                  className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)] flex items-center gap-1.5 disabled:opacity-45"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
            <button type="button" disabled={readOnly} onClick={() => addNode('custom_agent', '自定义智能体')} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)] flex items-center gap-1.5 disabled:opacity-45">
              <Plus className="h-3.5 w-3.5" />
              新建智能体
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--editorial-stroke)]/70 bg-[var(--editorial-bg)]">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={undo} disabled={history.length === 0 || readOnly} className="border border-[var(--editorial-stroke)] p-2 hover:bg-[var(--editorial-unselected)] disabled:opacity-40" title="撤销" aria-label="撤销">
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={redo} disabled={future.length === 0 || readOnly} className="border border-[var(--editorial-stroke)] p-2 hover:bg-[var(--editorial-unselected)] disabled:opacity-40" title="重做" aria-label="重做">
              <Redo2 className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={copySelection} disabled={selectedNodeIds.length === 0} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)] disabled:opacity-40">复制</button>
            <button type="button" onClick={pasteSelection} disabled={readOnly} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)] disabled:opacity-40">粘贴</button>
            <button type="button" onClick={() => fitView({ padding: 0.18, duration: 180 })} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)]">适配视图</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(statusLabels).map(([key, label]) => (
              <span key={key} className="flex items-center gap-1 text-[9px] text-[var(--editorial-text-gray)]">
                <span className={`h-1.5 w-1.5 rounded-full ${nodeStatusDotClass(key)}`} />{label}
              </span>
            ))}
            <button type="button" onClick={createReadOnlyShare} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)] flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              只读分享
            </button>
            <button type="button" onClick={() => setReadOnly((value) => !value)} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)]">
              {readOnly ? '退出只读' : '只读预览'}
            </button>
            <button type="button" onClick={() => setPropertyPanelOpen((value) => !value)} className="border border-[var(--editorial-stroke)] p-2 hover:bg-[var(--editorial-unselected)]" title="展开或收起右侧属性面板" aria-label="展开或收起右侧属性面板">
              {propertyPanelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className={`grid grid-cols-1 ${propertyPanelOpen ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''} min-w-0`}>
          <div className="relative h-[560px] min-w-0 bg-[var(--editorial-bg)]">
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              isValidConnection={isValidConnection}
              onSelectionChange={handleSelectionChange}
              onNodeDragStart={() => {
                if (!readOnly) dragSnapshotRef.current = makeSnapshot('拖拽节点');
              }}
              onNodeDragStop={() => {
                if (dragSnapshotRef.current) {
                  pushSnapshot(dragSnapshotRef.current);
                  dragSnapshotRef.current = null;
                }
              }}
              onNodeClick={(_, node) => {
                if (connectionSource && connectionSource !== node.id) {
                  connectToNode(node.id);
                } else {
                  setSelectedNodeId(node.id);
                }
              }}
              fitView
              fitViewOptions={{ padding: 0.18 }}
              minZoom={0.2}
              maxZoom={1.6}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              elementsSelectable
              selectionOnDrag
              selectNodesOnDrag={false}
              snapToGrid
              snapGrid={[16, 16]}
              deleteKeyCode={['Backspace', 'Delete']}
              multiSelectionKeyCode={['Meta', 'Shift']}
              className="editorial-grid min-w-0"
            >
              <Background color="var(--editorial-dot-color)" gap={16} size={1.2} variant={BackgroundVariant.Dots} />
              <MiniMap pannable zoomable nodeStrokeColor="var(--editorial-stroke)" nodeColor="var(--editorial-paper)" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>

          {propertyPanelOpen && (
          <aside className="border-l border-[var(--editorial-stroke)] p-4 space-y-4 bg-[var(--editorial-paper)] min-w-0 max-h-[560px] overflow-y-auto">
            <div className="flex gap-2">
              <button onClick={() => persistDraft()} disabled={readOnly} className="btn-editorial-secondary px-3 py-2 text-[9px] font-black uppercase flex items-center gap-1.5 disabled:opacity-45" type="button" aria-label="保存工作流草稿">
                <Save className="h-3.5 w-3.5" />
                保存
              </button>
              <button onClick={runWorkflow} disabled={loading || readOnly} className="btn-editorial-primary px-3 py-2 text-[9px] font-black uppercase flex items-center gap-1.5 disabled:opacity-45" type="button" aria-label="运行工作流">
                <PlayIcon className="h-3.5 w-3.5" />
                运行
              </button>
            </div>

            <div className="border border-[var(--editorial-stroke)] p-3">
              <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase mb-2">运行预览</h4>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">节点</span><b>{runPreview.stepCount}</b></div>
                <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">预计耗时</span><b>{runPreview.estimatedMinutes} 分钟</b></div>
                <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">预计成本</span><b>{runPreview.estimatedCost}</b></div>
              </div>
            </div>

            <div className="border border-[var(--editorial-stroke)] p-3">
              <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase mb-3">品牌记忆</h4>
              <div className="space-y-2">
                {(['brand_name', 'audience', 'tone', 'selling_points', 'visual_style', 'campaign_goal'] as const).map((key) => (
                  <input
                    key={key}
                    value={String(brandContext[key] || '')}
                    onChange={(event) => setBrandContext((prev) => ({ ...prev, [key]: event.target.value }))}
                    placeholder={key}
                    className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-[10px] py-1.5 focus:outline-none"
                  />
                ))}
              </div>
            </div>

            <div className="border border-[var(--editorial-stroke)] p-3">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">节点配置</h4>
                <button type="button" onClick={removeSelectedNode} disabled={readOnly} className="text-[9px] font-black hover:text-rose-500 disabled:opacity-40">删除</button>
              </div>
              {selectedNode ? (
                <div className="space-y-3">
                  <input
                    value={selectedNode.label}
                    onChange={(event) => updateNode(selectedNode.id, { label: event.target.value })}
                    className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none font-black"
                  />
                  {renderConfigFields()}
                  <textarea
                    rows={3}
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-2 text-[10px] resize-none focus:outline-none"
                    placeholder="填写修改意见后可重试节点"
                  />
                  <button type="button" onClick={retryNode} disabled={readOnly || !feedback.trim()} className="w-full border border-[var(--editorial-stroke)] py-2 text-[9px] font-black uppercase hover:bg-[var(--editorial-unselected)] flex items-center justify-center gap-1.5 disabled:opacity-40">
                    <RotateCcw className="h-3.5 w-3.5" />
                    节点重试
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-[var(--editorial-text-gray)]">未选择节点</p>
              )}
            </div>

            <div className="border border-[var(--editorial-stroke)] p-3">
              <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase mb-2">输入要求与输出内容</h4>
              {schemaWarnings.length === 0 ? (
                <p className="text-[10px] text-[var(--editorial-text-gray)]">当前连线类型一致。</p>
              ) : (
                <div className="space-y-2">
                  {schemaWarnings.map((warning) => (
                    <p key={warning} className="text-[10px] text-rose-600 leading-relaxed">{warning}</p>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[10px] text-[var(--editorial-text-gray)] leading-relaxed">连接时会检查类型兼容性；调试时再查看底层字段定义。</p>
            </div>

            <div className="border border-[var(--editorial-stroke)] p-3">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">连线管理</h4>
                {connectionSource && (
                  <button type="button" onClick={() => setConnectionSource('')} className="text-[9px] font-black hover:text-rose-500">
                    取消起点
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {edges.length === 0 ? (
                  <p className="text-[10px] text-[var(--editorial-text-gray)]">暂无连线</p>
                ) : (
                  edges.map((edge) => {
                    const source = nodes.find((node) => node.id === edge.source);
                    const target = nodes.find((node) => node.id === edge.target);
                    return (
                      <div key={edge.id} className="flex items-center justify-between gap-2 border border-[var(--editorial-stroke)]/30 px-2 py-1.5 text-[10px]">
                        <span className="truncate">{source?.label || edge.source} → {target?.label || edge.target}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (readOnly) return;
                            markHistory('删除连线');
                            setEdges((prev) => prev.filter((item) => item.id !== edge.id));
                          }}
                          disabled={readOnly}
                          className="text-[9px] font-black hover:text-rose-500 disabled:opacity-40"
                        >
                          删除
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </aside>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial-sm">
          <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-3 mb-4">
            <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase">模板库</h3>
            <button type="button" onClick={shareTemplate} disabled={readOnly} className="border border-[var(--editorial-stroke)] p-1.5 hover:bg-[var(--editorial-unselected)] disabled:opacity-45" title="发布模板">
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 text-[9px]">
            {(['organization', 'public'] as const).map((scope) => (
              <button key={scope} type="button" onClick={() => setTemplateScope(scope)} className={`border border-[var(--editorial-stroke)] px-2 py-1.5 ${templateScope === scope ? 'bg-[var(--editorial-stroke)] text-[var(--editorial-bg)]' : 'hover:bg-[var(--editorial-unselected)]'}`}>
                {scope === 'organization' ? '组织模板' : '公共模板'}
              </button>
            ))}
          </div>
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {templates.length === 0 ? (
              <button type="button" onClick={shareTemplate} disabled={readOnly} className="w-full border border-dashed border-[var(--editorial-stroke)] p-4 text-[10px] text-[var(--editorial-text-gray)] hover:bg-[var(--editorial-unselected)] flex items-center justify-center gap-2 disabled:opacity-45">
                <Plus className="h-3.5 w-3.5" />
                发布当前画布
              </button>
            ) : (
              templates.map((template) => (
                <div key={template.id} className="border border-[var(--editorial-stroke)]/50 p-3">
                  <h4 className="text-xs font-black">{template.title}</h4>
                  <div className="text-[8px] text-[var(--editorial-text-gray)] mt-1">{template.nodes.length} 个节点 / 使用 {template.fork_count} 次</div>
                  <button type="button" onClick={() => forkTemplate(template)} disabled={readOnly} className="mt-3 w-full border border-[var(--editorial-stroke)] py-1.5 text-[9px] font-black uppercase hover:bg-[var(--editorial-unselected)] disabled:opacity-45">
                    复制到当前项目
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial-sm">
          <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase border-b border-[var(--editorial-stroke)] pb-3 mb-4">版本历史</h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {versions.length === 0 ? (
              <p className="text-[10px] text-[var(--editorial-text-gray)]">保存或运行后会生成可回滚版本。</p>
            ) : (
              versions.map((version) => (
                <div key={version.id} className="border border-[var(--editorial-stroke)]/50 p-3 text-[10px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black truncate">{version.label}</span>
                    <span className="text-[8px] text-[var(--editorial-text-gray)]">{new Date(version.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="mt-1 text-[8px] text-[var(--editorial-text-gray)]">{version.nodes.length} 节点 / {version.edges.length} 连线</div>
                  <button type="button" onClick={() => rollbackVersion(version)} disabled={readOnly} className="mt-3 w-full border border-[var(--editorial-stroke)] py-1.5 text-[9px] font-black hover:bg-[var(--editorial-unselected)] disabled:opacity-45">
                    回滚到此版本
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial-sm">
          <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase border-b border-[var(--editorial-stroke)] pb-3 mb-4">运行记录</h3>
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

      {showCustomAgent && (
        <div className="fixed inset-0 z-30 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial p-5">
            <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-3 mb-4">
              <h3 className="text-sm font-black uppercase">自定义智能体</h3>
              <button type="button" onClick={() => setShowCustomAgent(false)} className="text-xs font-black">CLOSE</button>
            </div>
            <div className="space-y-3">
              <input value={customAgent.name} onChange={(event) => setCustomAgent((prev) => ({ ...prev, name: event.target.value }))} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="智能体名称" />
              <input value={customAgent.icon} onChange={(event) => setCustomAgent((prev) => ({ ...prev, icon: event.target.value }))} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="图标名" />
              <textarea value={customAgent.prompt} onChange={(event) => setCustomAgent((prev) => ({ ...prev, prompt: event.target.value }))} rows={5} className="w-full bg-[var(--editorial-bg)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="底层 Prompt" />
              <input type="number" min="0" max="1" step="0.1" value={customAgent.temperature} onChange={(event) => setCustomAgent((prev) => ({ ...prev, temperature: Number(event.target.value) }))} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowCustomAgent(false)} className="btn-editorial-secondary px-3 py-2 text-[10px] font-black uppercase">取消</button>
                <button type="button" onClick={saveCustomAgent} className="btn-editorial-primary px-3 py-2 text-[10px] font-black uppercase">创建</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayIcon(props: React.ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
