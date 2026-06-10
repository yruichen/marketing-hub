import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Lock, PanelRightClose, PanelRightOpen, Play, Plus, Redo2, Save, Undo2 } from 'lucide-react';
import {
  Background, BackgroundVariant, Controls, MarkerType, MiniMap,
  ReactFlow, useReactFlow, addEdge,
  useNodesState, useEdgesState,
  type Connection, type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { apiGet, apiPatch, apiPost } from '../hooks/useApi';
import type {
  BrandContext, GenerationTaskRecord,
  WorkflowEdge, WorkflowNode, WorkflowTemplateRecord, WorkspaceDraftRecord,
} from '../types/workspace';
import { presets, ioSchema, defaultNodeConfig, defaultNodes, defaultEdges, statusLabels, type NodeType } from '../features/workflows/constants';
import { normalizeWorkflowNode, type ProjectDetail, type WorkflowBuilderProps } from '../features/workflows/types';
import { nodeStatusDotClass, schemasCompatible } from '../features/workflows/utils';
import { WorkflowNodeComponent } from '../features/workflows/WorkflowNodeComponent';
import { PropertyPanel } from '../features/workflows/PropertyPanel';
import { BottomPanels } from '../features/workflows/BottomPanels';
import { ContextMenu } from '../features/workflows/ContextMenu';
import { CustomAgentDialog, type CustomAgentForm } from '../features/workflows/CustomAgentDialog';

import { wfToRF, rfToWF } from '../features/workflows/conversions';
import type { FlowNode } from '../features/workflows/WorkflowNodeComponent';

type RFNode = FlowNode;

type WorkflowSnapshot = {
  id: string;
  label: string;
  createdAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  brandContext: BrandContext;
  selectedNodeId: string;
};

const nodeTypes = { workflowNode: WorkflowNodeComponent };

const defaultEdgeOpts = {
  type: 'smoothstep' as const,
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  style: { stroke: '#64748b', strokeWidth: 2 },
};

// --- Main Component ---

export function WorkflowBuilder({ organization, project, campaign, username, triggerToast }: WorkflowBuilderProps) {
  const { fitView, getViewport } = useReactFlow();

  // ReactFlow native state — THE CORE FIX
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // UI state
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [draft, setDraft] = useState<WorkspaceDraftRecord | null>(null);
  const [brandContext, setBrandContext] = useState<BrandContext>({});
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [connectionSource, setConnectionSource] = useState('');
  const [templates, setTemplates] = useState<WorkflowTemplateRecord[]>([]);
  const [feedback, setFeedback] = useState('');
  const [loadingState, setLoadingState] = useState<'idle' | 'saving' | 'running' | 'retrying' | 'loading'>('idle');
  const [lastTasks, setLastTasks] = useState<GenerationTaskRecord[]>([]);
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(true);
  const [readOnly, setReadOnly] = useState(() => new URLSearchParams(window.location.search).get('share') === 'readonly');
  const [templateScope, setTemplateScope] = useState<'organization' | 'public'>('organization');
  const [showCustomAgent, setShowCustomAgent] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<{ edgeId: string; x: number; y: number } | null>(null);

  // Derived: RF nodes → WorkflowNode for UI
  const nodes: WorkflowNode[] = useMemo(() => rfNodes.map(rfToWF), [rfNodes]);
  const edges: WorkflowEdge[] = useMemo(() => rfEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })), [rfEdges]);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const runPreview = useMemo(() => ({
    stepCount: nodes.length, estimatedCost: `$${(nodes.length * 0.03).toFixed(2)}`,
    estimatedMinutes: Math.max(1, Math.round(nodes.length * 0.8)),
  }), [nodes.length]);

  // Refs for snapshot closures
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const brandCtxRef = useRef(brandContext);
  const selIdRef = useRef(selectedNodeId);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);
  useEffect(() => { brandCtxRef.current = brandContext; }, [brandContext]);
  useEffect(() => { selIdRef.current = selectedNodeId; }, [selectedNodeId]);

  // History
  const [history, setHistory] = useState<WorkflowSnapshot[]>([]);
  const [future, setFuture] = useState<WorkflowSnapshot[]>([]);
  const [versions, setVersions] = useState<WorkflowSnapshot[]>([]);
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCounterRef = useRef(0);
  const dragSnapshotRef = useRef<WorkflowSnapshot | null>(null);
  const clipboardRef = useRef<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDoneRef = useRef(false);

  const makeSnapshot = useCallback((label: string): WorkflowSnapshot => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, label, createdAt: new Date().toISOString(),
    nodes: nodesRef.current.map((n) => ({ ...n, config: { ...n.config }, output: { ...(n.output || {}) } })),
    edges: edgesRef.current.map((e) => ({ ...e })),
    brandContext: { ...brandCtxRef.current }, selectedNodeId: selIdRef.current,
  }), []);

  const restoreSnapshot = useCallback((snap: WorkflowSnapshot) => {
    setRfNodes(snap.nodes.map(wfToRF));
    setRfEdges(snap.edges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
    setBrandContext({ ...snap.brandContext });
    setSelectedNodeId(snap.selectedNodeId);
    setSelectedNodeIds(snap.selectedNodeId ? [snap.selectedNodeId] : []);
  }, [setRfNodes, setRfEdges]);

  const pushSnapshot = useCallback((snap: WorkflowSnapshot) => {
    setHistory((prev) => [...prev.slice(-24), snap]); setFuture([]);
  }, []);

  const markHistory = useCallback((label: string) => pushSnapshot(makeSnapshot(label)), [makeSnapshot, pushSnapshot]);

  const debouncedMarkHistory = useCallback((label: string) => {
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => pushSnapshot(makeSnapshot(label)), 800);
  }, [makeSnapshot, pushSnapshot]);

  const undo = useCallback(() => {
    const cur = makeSnapshot('重做点');
    setHistory((prev) => {
      const snap = prev[prev.length - 1];
      if (!snap) return prev;
      setFuture((items) => [cur, ...items].slice(0, 25));
      restoreSnapshot(snap);
      return prev.slice(0, -1);
    });
  }, [makeSnapshot, restoreSnapshot]);

  const redo = useCallback(() => {
    const cur = makeSnapshot('撤销点');
    setFuture((prev) => {
      const snap = prev[0];
      if (!snap) return prev;
      setHistory((items) => [...items.slice(-24), cur]);
      restoreSnapshot(snap);
      return prev.slice(1);
    });
  }, [makeSnapshot, restoreSnapshot]);

  // --- Data Loading ---

  const loadTemplates = useCallback(async () => {
    try {
      const suffix = organization?.slug ? `?organization=${encodeURIComponent(organization.slug)}` : '';
      setTemplates(await apiGet<WorkflowTemplateRecord[]>(`/templates/${suffix}`));
    } catch { triggerToast('模板加载失败', 'error'); }
  }, [organization, triggerToast]);

  const loadProjectWorkflow = useCallback(async () => {
    if (!project) return;
    setLoadingState('loading');
    try {
      // Check for draft ID from brainstorm navigation
      const urlDraftId = new URLSearchParams(window.location.search).get('draft');
      if (urlDraftId) {
        const d = await apiGet<WorkspaceDraftRecord>(`/drafts/${urlDraftId}/`);
        const bc = d.brand_context || {};
        const wfNodes = d.nodes?.length ? d.nodes.map((n) => normalizeWorkflowNode(n, bc)) : defaultNodes(project.name);
        const wfEdges = d.edges?.length ? d.edges : defaultEdges;
        setDraft(d);
        setRfNodes(wfNodes.map(wfToRF));
        setRfEdges(wfEdges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
        setBrandContext(bc);
        setSelectedNodeId(wfNodes[0]?.id || '');
        setSelectedNodeIds(wfNodes[0]?.id ? [wfNodes[0].id] : []);
        const snap: WorkflowSnapshot = { id: `draft-${d.id}`, label: d.name || '灵感风暴工作流', createdAt: new Date().toISOString(), nodes: wfNodes, edges: wfEdges, brandContext: bc, selectedNodeId: wfNodes[0]?.id || '' };
        setHistory([snap]); setFuture([]); setVersions([snap]);
        const taskIds = d.last_run_summary?.task_ids as number[] | undefined;
        if (taskIds?.length) {
          const restored = await Promise.all(taskIds.map((id) => apiGet<GenerationTaskRecord>(`/tasks/${id}/`).catch(() => null)));
          setLastTasks(restored.filter(Boolean) as GenerationTaskRecord[]);
        }
        window.history.replaceState({}, '', window.location.pathname);
        setLoadingState('idle');
        return;
      }

      const detail = await apiGet<ProjectDetail>(`/projects/${project.id}/`);
      setProjectDetail(detail);
      const d = detail.drafts.find((item) => item.campaign_id === campaign?.id) || detail.drafts[0] || null;
      const bc = d?.brand_context || detail.brand_context || {};
      const wfNodes = d?.nodes?.length ? d.nodes.map((n) => normalizeWorkflowNode(n, bc)) : defaultNodes(detail.name);
      const wfEdges = d?.edges?.length ? d.edges : defaultEdges;
      setDraft(d);
      setRfNodes(wfNodes.map(wfToRF));
      setRfEdges(wfEdges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
      setBrandContext(bc);
      setSelectedNodeId(wfNodes[0]?.id || '');
      setSelectedNodeIds(wfNodes[0]?.id ? [wfNodes[0].id] : []);
      const snap: WorkflowSnapshot = { id: `${detail.id}-${d?.id || 'init'}`, label: d ? '加载草稿' : '默认工作流', createdAt: new Date().toISOString(), nodes: wfNodes, edges: wfEdges, brandContext: bc, selectedNodeId: wfNodes[0]?.id || '' };
      setHistory([snap]); setFuture([]); setVersions([snap]);
      // Restore run history from persisted last_run_summary
      const taskIds = d?.last_run_summary?.task_ids as number[] | undefined;
      if (taskIds?.length) {
        const restored = await Promise.all(taskIds.map((id) => apiGet<GenerationTaskRecord>(`/tasks/${id}/`).catch(() => null)));
        setLastTasks(restored.filter(Boolean) as GenerationTaskRecord[]);
      }
    } catch (err) { triggerToast(`工作流草稿加载失败: ${err instanceof Error ? err.message : '未知错误'}`, 'error'); }
    finally { setLoadingState('idle'); }
  }, [campaign?.id, project, triggerToast, setRfNodes, setRfEdges]);

  useEffect(() => {
    const t = window.setTimeout(() => { loadProjectWorkflow(); loadTemplates(); }, 0);
    return () => window.clearTimeout(t);
  }, [loadProjectWorkflow, loadTemplates]);

  // --- API Actions ---

  const persistDraft = async (nextNodes = nodes, nextEdges = edges, silent = false) => {
    if (!project) throw new Error('Project is required');
    const body = { project_id: project.id, campaign_id: campaign?.id, name: draft?.name || 'Default Workflow', brand_context: brandContext, nodes: nextNodes, edges: nextEdges, selected_node_id: selectedNodeId, status: 'draft' };
    const saved = draft ? await apiPatch<WorkspaceDraftRecord>(`/drafts/${draft.id}/`, body) : await apiPost<WorkspaceDraftRecord>('/drafts/', body);
    setDraft(saved);
    const sn = saved.nodes.map((n) => normalizeWorkflowNode(n, saved.brand_context || brandContext));
    setRfNodes(sn.map(wfToRF));
    setRfEdges(saved.edges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
    setBrandContext(saved.brand_context);
    const snap: WorkflowSnapshot = { id: `${saved.id}-${Date.now()}`, label: silent ? '自动保存' : '手动保存', createdAt: new Date().toISOString(), nodes: sn, edges: saved.edges, brandContext: saved.brand_context, selectedNodeId };
    setHistory((prev) => [...prev.slice(-24), snap]);
    setVersions((prev) => [snap, ...prev].slice(0, 12));
    setFuture([]);
    if (!silent) triggerToast('画布草稿已保存', 'success');
    return saved;
  };

  // Auto-save (must be after persistDraft declaration)
  useEffect(() => {
    if (!initialLoadDoneRef.current) { if (nodes.length > 0 || edges.length > 0) initialLoadDoneRef.current = true; return; }
    if (!draft || readOnly) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { persistDraft(nodes, edges, true).catch(() => {}); }, 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [nodes, edges, brandContext]); // eslint-disable-line react-hooks/exhaustive-deps

  const runWorkflow = async () => {
    if (!project) { triggerToast('请先选择项目', 'error'); return; }
    if (readOnly) { triggerToast('只读模式下无法运行', 'error'); return; }
    if (nodes.length === 0) { triggerToast('请先添加节点', 'error'); return; }
    const adj = new Map(nodes.map((n) => [n.id, [] as string[]]));
    for (const e of edges) adj.get(e.source)?.push(e.target);
    const visited = new Set<string>(), inStack = new Set<string>();
    let cycle = false;
    const dfs = (id: string) => { if (inStack.has(id)) { cycle = true; return; } if (visited.has(id)) return; visited.add(id); inStack.add(id); for (const nx of adj.get(id) || []) dfs(nx); inStack.delete(id); };
    for (const n of nodes) { dfs(n.id); if (cycle) break; }
    if (cycle) { triggerToast('工作流存在循环依赖', 'error'); return; }
    setLoadingState('running');
    try {
      markHistory('运行前保存');
      const saved = await persistDraft(nodes, edges, true);
      const data = await apiPost<{ draft: WorkspaceDraftRecord; tasks: GenerationTaskRecord[] }>(`/drafts/${saved.id}/run/`, { username });
      setDraft(data.draft);
      const sn = data.draft.nodes.map((n) => normalizeWorkflowNode(n, data.draft.brand_context || brandContext));
      setRfNodes(sn.map(wfToRF));
      setRfEdges(data.draft.edges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
      setLastTasks(data.tasks);
      setVersions((prev) => [{ id: `${data.draft.id}-${Date.now()}`, label: '运行版本', createdAt: new Date().toISOString(), nodes: sn, edges: data.draft.edges, brandContext: data.draft.brand_context, selectedNodeId: data.draft.selected_node_id }, ...prev].slice(0, 12));
      triggerToast('画布工作流执行完毕', 'success');
    } catch (err) { triggerToast(`工作流执行失败: ${err instanceof Error ? err.message : '未知错误'}`, 'error'); }
    finally { setLoadingState('idle'); }
  };

  const retryNode = async () => {
    if (!selectedNode || !feedback.trim()) { if (!feedback.trim()) triggerToast('请输入修改意见', 'info'); return; }
    if (readOnly) { triggerToast('只读模式下无法重试', 'error'); return; }
    setLoadingState('retrying');
    try {
      markHistory(`节点重试 ${selectedNode.id}`);
      const saved = await persistDraft(nodes, edges, true);
      const data = await apiPost<{ draft: WorkspaceDraftRecord; task: GenerationTaskRecord | null }>(`/drafts/${saved.id}/nodes/${selectedNode.id}/retry/`, { username, feedback });
      setDraft(data.draft);
      const sn = data.draft.nodes.map((n) => normalizeWorkflowNode(n, data.draft.brand_context || brandContext));
      setRfNodes(sn.map(wfToRF));
      setRfEdges(data.draft.edges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
      setLastTasks(data.task ? [data.task] : []); setFeedback('');
      triggerToast('节点已按修改意见重试', 'success');
    } catch (err) { triggerToast(`节点重试失败: ${err instanceof Error ? err.message : '未知错误'}`, 'error'); }
    finally { setLoadingState('idle'); }
  };

  const shareTemplate = async () => {
    if (!project || readOnly) return;
    try {
      const saved = await persistDraft(nodes, edges, true);
      const tpl = await apiPost<WorkflowTemplateRecord>('/templates/', { project_id: project.id, campaign_id: campaign?.id, title: `${project.name} Workflow`, description: `${saved.nodes.length} nodes`, username, brand_context: brandContext, nodes: saved.nodes, edges: saved.edges, tags: ['workflow', project.slug], is_public: templateScope === 'public' });
      setTemplates((prev) => [tpl, ...prev]); triggerToast('工作流模板已发布', 'success');
    } catch { triggerToast('模板发布失败', 'error'); }
  };

  const forkTemplate = async (template: WorkflowTemplateRecord) => {
    if (!project || readOnly) return;
    try {
      const data = await apiPost<{ draft: WorkspaceDraftRecord; template: WorkflowTemplateRecord }>(`/templates/${template.id}/fork/`, { project_id: project.id, campaign_id: campaign?.id, name: `${template.title} Fork` });
      setDraft(data.draft);
      const sn = data.draft.nodes.map((n) => normalizeWorkflowNode(n, data.draft.brand_context || brandContext));
      setRfNodes(sn.map(wfToRF));
      setRfEdges(data.draft.edges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
      setBrandContext(data.draft.brand_context);
      setTemplates((prev) => prev.map((t) => (t.id === data.template.id ? data.template : t)));
      triggerToast('模板已复制到当前项目', 'success');
    } catch { triggerToast('模板复制失败', 'error'); }
  };

  // --- UI Event Handlers ---

  const addNode = useCallback((type: NodeType, label: string, extraConfig?: Record<string, unknown>) => {
    if (readOnly) return;
    markHistory('新增节点');
    idCounterRef.current += 1;
    const id = `${type}-local-${idCounterRef.current}`;
    const preset = presets.find((p) => p.type === type);
    const vp = getViewport();
    const cx = -vp.x / vp.zoom + window.innerWidth / 2 / vp.zoom;
    const cy = -vp.y / vp.zoom + 300 / vp.zoom;
    const ox = ((idCounterRef.current * 37) % 80) - 40;
    const oy = ((idCounterRef.current * 53) % 80) - 40;
    const wfNode: WorkflowNode = { id, type, label, x: cx + ox, y: cy + oy, width: preset?.width || 260, height: preset?.height || 166, status: 'idle', config: { ...defaultNodeConfig(type, brandContext), ...(extraConfig || {}) }, output: {}, input_schema: ioSchema[type].input, output_schema: ioSchema[type].output };
    setRfNodes((prev) => [...prev, wfToRF(wfNode)]);
    setSelectedNodeId(id); setSelectedNodeIds([id]);
  }, [readOnly, brandContext, markHistory, getViewport, setRfNodes]);

  const updateNode = useCallback((id: string, patch: Partial<WorkflowNode>) => {
    if (readOnly) return;
    debouncedMarkHistory(`编辑节点 ${id}`);
    setRfNodes((prev) => prev.map((n) => {
      if (n.id !== id) return n;
      const old = n.data;
      return { ...n, data: {
        ...old,
        label: patch.label ?? old.label,
        nodeType: (patch.type ?? old.nodeType) as NodeType,
        config: patch.config ? { ...old.config, ...patch.config } : old.config,
        output: patch.output ? { ...old.output, ...(patch.output as Record<string, unknown>) } : old.output,
        status: patch.status ?? old.status,
        inputSchema: patch.input_schema ?? old.inputSchema,
        outputSchema: patch.output_schema ?? old.outputSchema,
      }};
    }));
  }, [readOnly, debouncedMarkHistory, setRfNodes]);

  const updateSelectedConfig = useCallback((key: string, value: string | number) => {
    if (!selectedNode || readOnly) return;
    updateNode(selectedNode.id, { config: { ...selectedNode.config, [key]: value } });
  }, [selectedNode, readOnly, updateNode]);

  const removeSelectedNode = useCallback(() => {
    if (!selectedNode || readOnly) return;
    markHistory('删除节点');
    setRfNodes((prev) => prev.filter((n) => n.id !== selectedNode.id));
    setRfEdges((prev) => prev.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNodeId(''); setSelectedNodeIds([]);
  }, [selectedNode, readOnly, markHistory, setRfNodes, setRfEdges]);

  const connectToNode = useCallback((targetId: string) => {
    if (readOnly || !connectionSource || connectionSource === targetId) return;
    const src = nodes.find((n) => n.id === connectionSource);
    const tgt = nodes.find((n) => n.id === targetId);
    if (src && tgt && !schemasCompatible(src.output_schema, tgt.input_schema)) {
      triggerToast('这两个节点的输入输出类型不兼容', 'error');
      setConnectionSource(''); return;
    }
    if (!edges.some((e) => e.source === connectionSource && e.target === targetId)) {
      idCounterRef.current += 1;
      setRfEdges((prev) => addEdge({ source: connectionSource, target: targetId, id: `edge-local-${idCounterRef.current}` }, prev));
    }
    setConnectionSource('');
  }, [readOnly, connectionSource, nodes, edges, triggerToast, setRfEdges]);

  // ReactFlow onConnect — uses addEdge directly on edges state
  const handleConnect = useCallback((conn: Connection) => {
    if (readOnly || !conn.source || !conn.target || conn.source === conn.target) return;
    if (rfEdges.some((e) => e.source === conn.source && e.target === conn.target)) return;
    const src = nodes.find((n) => n.id === conn.source);
    const tgt = nodes.find((n) => n.id === conn.target);
    if (src && tgt && !schemasCompatible(src.output_schema, tgt.input_schema)) { triggerToast('类型不兼容', 'error'); return; }
    setRfEdges((eds) => addEdge({ ...conn, id: `edge-${conn.source}-${conn.target}` }, eds));
  }, [readOnly, rfEdges, nodes, triggerToast, setRfEdges]);

  const isValidConnection = useCallback((conn: Connection | Edge) => {
    if (readOnly || !conn.source || !conn.target || conn.source === conn.target) return false;
    const src = nodes.find((n) => n.id === conn.source);
    const tgt = nodes.find((n) => n.id === conn.target);
    if (!src || !tgt) return false;
    return schemasCompatible(src.output_schema, tgt.input_schema);
  }, [readOnly, nodes]);

  const handleSelectionChange = useCallback(({ nodes: sel }: { nodes: RFNode[] }) => {
    const ids = sel.map((n) => n.id);
    setSelectedNodeIds(ids);
    if (ids[0]) setSelectedNodeId(ids[0]);
  }, []);

  const copySelection = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const sel = nodes.filter((n) => selectedNodeIds.includes(n.id));
    const selSet = new Set(sel.map((n) => n.id));
    clipboardRef.current = { nodes: sel.map((n) => ({ ...n, config: { ...n.config }, output: { ...(n.output || {}) } })), edges: edges.filter((e) => selSet.has(e.source) && selSet.has(e.target)).map((e) => ({ ...e })) };
    triggerToast('已复制选中节点', 'info');
  }, [nodes, edges, selectedNodeIds, triggerToast]);

  const pasteSelection = useCallback(() => {
    if (readOnly || !clipboardRef.current) return;
    markHistory('粘贴节点');
    const idMap = new Map<string, string>();
    const vp = getViewport();
    const newNodes = clipboardRef.current.nodes.map((n) => {
      idCounterRef.current += 1;
      const id = `${n.type}-copy-${idCounterRef.current}`;
      idMap.set(n.id, id);
      return { ...n, id, label: `${n.label} 副本`, x: n.x + 48 / vp.zoom, y: n.y + 48 / vp.zoom, status: 'idle' as const };
    });
    const newEdges = clipboardRef.current.edges.map((e) => {
      const s = idMap.get(e.source), t = idMap.get(e.target);
      if (!s || !t) return null;
      idCounterRef.current += 1;
      return { id: `edge-copy-${idCounterRef.current}`, source: s, target: t };
    }).filter(Boolean) as WorkflowEdge[];
    setRfNodes((prev) => [...prev, ...newNodes.map(wfToRF)]);
    setRfEdges((prev) => [...prev, ...newEdges.map((e) => ({ id: e.id, source: e.source, target: e.target }))]);
    setSelectedNodeIds(newNodes.map((n) => n.id));
    setSelectedNodeId(newNodes[0]?.id || '');
    triggerToast('已粘贴节点', 'success');
  }, [readOnly, markHistory, getViewport, setRfNodes, setRfEdges, triggerToast]);

  const rollbackVersion = useCallback((snap: WorkflowSnapshot) => {
    if (readOnly) return;
    markHistory('版本回滚前');
    restoreSnapshot(snap);
    triggerToast('已回滚到选中版本', 'success');
  }, [readOnly, markHistory, restoreSnapshot, triggerToast]);

  const createReadOnlyShare = useCallback(async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('share', 'readonly');
    await navigator.clipboard?.writeText(url.toString()).catch(() => undefined);
    setReadOnly(true);
    triggerToast('只读分享链接已复制', 'info');
  }, [triggerToast]);

  const saveCustomAgent = useCallback((form: CustomAgentForm) => {
    const { name, ...rest } = form;
    addNode('custom_agent', name.trim(), {
      icon: rest.icon,
      prompt: rest.prompt,
      input_fields: rest.input_fields,
      output_schema_text: rest.output_schema_text,
      model: rest.model,
      temperature: rest.temperature,
      failure_strategy: rest.failure_strategy,
    });
    setShowCustomAgent(false);
  }, [addNode]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const edit = el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable;
      if (edit && !(e.metaKey || e.ctrlKey)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteSelection(); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); redo(); }
      if (e.key === 'Delete' && selectedNodeId && !readOnly) { e.preventDefault(); removeSelectedNode(); }
      if (e.key === 'Escape' && connectionSource) { e.preventDefault(); setConnectionSource(''); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [connectionSource, copySelection, pasteSelection, readOnly, redo, removeSelectedNode, selectedNodeId, undo]);

  // Inject callbacks into RF node data
  const setConnectionSourceRef = useRef(setConnectionSource);
  const setContextMenuRef = useRef(setContextMenu);
  const setSelectedNodeIdRef = useRef(setSelectedNodeId);
  useEffect(() => { setConnectionSourceRef.current = setConnectionSource; }, [setConnectionSource]);
  useEffect(() => { setContextMenuRef.current = setContextMenu; }, [setContextMenu]);
  useEffect(() => { setSelectedNodeIdRef.current = setSelectedNodeId; }, [setSelectedNodeId]);

  const rfNodesWithMeta = useMemo(() => rfNodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      isConnectionSource: connectionSource === n.id,
      onStartConnect: (id: string) => setConnectionSourceRef.current(id),
      onOpenContextMenu: (id: string, x: number, y: number) => {
        setSelectedNodeIdRef.current(id);
        setContextMenuRef.current({ nodeId: id, x, y });
      },
    },
  })), [rfNodes, connectionSource]);

  if (!project) return <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-8 shadow-editorial text-xs font-mono text-[var(--editorial-text-gray)]">请先在项目库选择当前项目。</div>;

  return (
    <div className="space-y-5 font-mono min-w-0">
      <section className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial overflow-hidden min-w-0">
        {/* Toolbar Row 1: Project + Node Presets */}
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
                <button key={item.type} type="button" disabled={readOnly} onClick={() => addNode(item.type, item.label)} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)] flex items-center gap-1.5 disabled:opacity-45">
                  <Icon className="h-3.5 w-3.5" />{item.label}
                </button>
              );
            })}
            <button type="button" disabled={readOnly} onClick={() => setShowCustomAgent(true)} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)] flex items-center gap-1.5 disabled:opacity-45">
              <Plus className="h-3.5 w-3.5" />新建智能体
            </button>
          </div>
        </div>

        {/* Toolbar Row 2: Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--editorial-stroke)]/70 bg-[var(--editorial-bg)]">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={undo} disabled={history.length === 0 || readOnly} className="border border-[var(--editorial-stroke)] p-2 hover:bg-[var(--editorial-unselected)] disabled:opacity-40" title="撤销"><Undo2 className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={redo} disabled={future.length === 0 || readOnly} className="border border-[var(--editorial-stroke)] p-2 hover:bg-[var(--editorial-unselected)] disabled:opacity-40" title="重做"><Redo2 className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={copySelection} disabled={selectedNodeIds.length === 0} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)] disabled:opacity-40">复制</button>
            <button type="button" onClick={pasteSelection} disabled={readOnly} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)] disabled:opacity-40">粘贴</button>
            <button type="button" onClick={() => fitView({ padding: 0.18, duration: 180 })} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)]">适配视图</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => persistDraft(nodes, edges, true)} disabled={readOnly} className="btn-editorial-secondary px-3 py-2 text-[9px] font-black uppercase flex items-center gap-1.5 disabled:opacity-45">
              <Save className="h-3.5 w-3.5" /> 保存
            </button>
            <button type="button" onClick={runWorkflow} disabled={loadingState !== 'idle' || readOnly} className="btn-editorial-primary px-4 py-2 text-[10px] font-black uppercase flex items-center gap-2 disabled:opacity-45">
              <Play className="h-4 w-4" />
              {loadingState === 'running' ? '执行中…' : loadingState === 'retrying' ? '重试中…' : '运行工作流'}
            </button>
            <span className="flex items-center gap-1.5 text-[9px] text-[var(--editorial-text-gray)] border border-[var(--editorial-stroke)] px-2 py-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${draft?.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {draft?.status || 'draft'}
            </span>
            {Object.entries(statusLabels).map(([key, label]) => (
              <span key={key} className="flex items-center gap-1 text-[9px] text-[var(--editorial-text-gray)]"><span className={`h-1.5 w-1.5 rounded-full ${nodeStatusDotClass(key)}`} />{label}</span>
            ))}
            <button type="button" onClick={createReadOnlyShare} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)] flex items-center gap-1.5"><Eye className="h-3.5 w-3.5" />只读分享</button>
            <button type="button" onClick={() => setReadOnly((v) => !v)} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)]">{readOnly ? '退出只读' : '只读预览'}</button>
            <button type="button" onClick={() => setPropertyPanelOpen((v) => !v)} className="border border-[var(--editorial-stroke)] p-2 hover:bg-[var(--editorial-unselected)]" title="展开或收起右侧属性面板">{propertyPanelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}</button>
          </div>
        </div>

        {/* Canvas + Sidebar */}
        <div className={`grid grid-cols-1 ${propertyPanelOpen ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''} min-w-0`}>
          <div className="relative h-[calc(100vh-260px)] min-h-[400px] min-w-0 bg-[var(--editorial-bg)]">
            {connectionSource && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 bg-blue-600 text-white px-3 py-1.5 rounded-full text-[10px] font-bold shadow-lg animate-pulse">
                点击目标节点完成连接 · ESC 取消
              </div>
            )}
            <ReactFlow
              nodes={rfNodesWithMeta}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              isValidConnection={isValidConnection}
              onSelectionChange={handleSelectionChange}
              onNodeClick={(_, node) => { setContextMenu(null); if (connectionSource && connectionSource !== node.id) connectToNode(node.id); else setSelectedNodeId(node.id); }}
              onPaneClick={() => { setContextMenu(null); setEdgeContextMenu(null); }}
              onEdgeContextMenu={(_, edge) => {
                _.preventDefault();
                setEdgeContextMenu({ edgeId: edge.id, x: _.clientX, y: _.clientY });
              }}
              onNodeDragStart={() => { if (!readOnly) dragSnapshotRef.current = makeSnapshot('拖拽节点'); }}
              onNodeDragStop={() => { if (dragSnapshotRef.current) { pushSnapshot(dragSnapshotRef.current); dragSnapshotRef.current = null; } }}
              defaultEdgeOptions={defaultEdgeOpts}
              connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2 }}
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
            <PropertyPanel
              nodes={nodes} edges={edges} selectedNode={selectedNode} brandContext={brandContext}
              feedback={feedback} loadingState={loadingState} connectionSource={connectionSource}
              readOnly={readOnly} runPreview={runPreview}
              onUpdateNode={updateNode} onUpdateConfig={updateSelectedConfig}
              onSetBrandContext={setBrandContext} onSetFeedback={setFeedback}
              onRemoveNode={removeSelectedNode} onRetryNode={retryNode}
              onDeleteEdge={(id) => { markHistory('删除连线'); setRfEdges((prev) => prev.filter((e) => e.id !== id)); }}
              onCancelConnection={() => setConnectionSource('')}
              markHistory={markHistory}
            />
          )}
        </div>
      </section>

      <BottomPanels
        templates={templates} versions={versions} lastTasks={lastTasks}
        templateScope={templateScope} readOnly={readOnly}
        onSetTemplateScope={setTemplateScope} onShareTemplate={shareTemplate}
        onForkTemplate={forkTemplate} onRollbackVersion={rollbackVersion}
      />

      {contextMenu && (
        <ContextMenu
          nodeId={contextMenu.nodeId} x={contextMenu.x} y={contextMenu.y}
          nodes={nodes} edges={edges} readOnly={readOnly}
          onStartConnect={(id) => { setConnectionSource(id); setContextMenu(null); }}
          onDuplicate={(id) => {
            const src = nodes.find((n) => n.id === id);
            if (!src) return;
            idCounterRef.current += 1;
            const newId = `${src.type}-copy-${idCounterRef.current}`;
            markHistory('复制节点');
            const nn: WorkflowNode = { ...src, id: newId, label: `${src.label} (副本)`, x: src.x + 40, y: src.y + 40, config: { ...src.config }, output: {}, status: 'idle' };
            setRfNodes((prev) => [...prev, wfToRF(nn)]);
            setSelectedNodeId(newId);
          }}
          onConfigure={(id) => { setSelectedNodeId(id); setPropertyPanelOpen(true); }}
          onDelete={(id) => {
            if (readOnly) return;
            markHistory('删除节点');
            setRfNodes((prev) => prev.filter((n) => n.id !== id));
            setRfEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
            if (selectedNodeId === id) { setSelectedNodeId(''); setSelectedNodeIds([]); }
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Edge context menu */}
      {edgeContextMenu && (
        <div
          className="fixed z-50 bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] shadow-editorial-sm py-1 min-w-[140px]"
          style={{ left: edgeContextMenu.x, top: edgeContextMenu.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-[10px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"
            onClick={() => {
              if (!readOnly) {
                markHistory('删除连线');
                setRfEdges((prev) => prev.filter((e) => e.id !== edgeContextMenu.edgeId));
              }
              setEdgeContextMenu(null);
            }}
          >
            删除连线
          </button>
        </div>
      )}

      {showCustomAgent && (
        <CustomAgentDialog
          onSave={saveCustomAgent}
          onClose={() => setShowCustomAgent(false)}
        />
      )}
    </div>
  );
}

