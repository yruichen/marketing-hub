import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clipboard,
  ClipboardPaste,
  Eye,
  LayoutDashboard,
  Lock,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Redo2,
  Save,
  Undo2,
  X,
} from 'lucide-react';
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
  WorkflowEdge, WorkflowNode, WorkspaceDraftRecord,
} from '../types/workspace';
import { presets, ioSchema, defaultNodeConfig, defaultNodes, defaultEdges, type NodeType } from '../features/workflows/constants';
import { normalizeWorkflowNode, type ProjectDetail, type WorkflowBuilderProps } from '../features/workflows/types';
import { schemasCompatible } from '../features/workflows/utils';
import { WorkflowNodeComponent } from '../features/workflows/WorkflowNodeComponent';
import { NodeConfigPopover } from '../features/workflows/NodeConfigPopover';
import { PropertyPanel } from '../features/workflows/PropertyPanel';
import { ContextMenu } from '../features/workflows/ContextMenu';
import { CustomAgentDialog, type CustomAgentForm } from '../features/workflows/CustomAgentDialog';
import { autoLayoutWorkflow, hasLayoutProblems } from '../features/workflows/layout';

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

type SaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'failed';

const toolbarButtonClass = 'h-9 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 text-[9px] font-black inline-flex items-center justify-center gap-1.5 leading-none whitespace-nowrap hover:bg-[var(--editorial-unselected)] disabled:opacity-40 disabled:hover:bg-[var(--editorial-paper)]';
const toolbarIconButtonClass = 'h-9 w-9 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] inline-flex items-center justify-center hover:bg-[var(--editorial-unselected)] disabled:opacity-40 disabled:hover:bg-[var(--editorial-paper)]';
const toolbarPrimaryClass = 'h-9 min-w-[112px] border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-stroke)] text-[var(--editorial-bg)] px-4 text-[10px] font-black uppercase inline-flex items-center justify-center gap-2 leading-none whitespace-nowrap hover:opacity-90 disabled:opacity-45';

function workflowExecutionOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const inDegree = new Map(nodes.map((node) => [node.id, 0]));
  const adj = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    adj.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }
  const queue = nodes.filter((node) => (inDegree.get(node.id) || 0) === 0).map((node) => node.id);
  const order: WorkflowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeById.get(id);
    if (node) order.push(node);
    for (const next of adj.get(id) || []) {
      const degree = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }
  for (const node of nodes) {
    if (!order.some((item) => item.id === node.id)) order.push(node);
  }
  return order;
}

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const labels: Record<SaveStatus, string> = {
    clean: '已保存',
    dirty: '有未保存更改',
    saving: '正在保存...',
    saved: '已保存',
    failed: '保存失败',
  };
  const tone =
    status === 'failed'
      ? 'text-rose-600'
      : status === 'dirty'
      ? 'text-amber-700'
      : status === 'saving'
      ? 'text-blue-600'
      : 'text-emerald-700';

  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === 'failed' ? 'bg-rose-500' : status === 'dirty' ? 'bg-amber-500' : status === 'saving' ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`} />
      {labels[status]}
    </span>
  );
}

function WorkflowHandoffBanner({
  onRun,
  onInspect,
  onClose,
}: {
  onRun: () => void;
  onInspect: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute left-4 right-4 top-4 z-20 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] shadow-editorial-sm px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wide text-[var(--editorial-text)]">
          已根据你的灵感生成工作流草稿
        </p>
        <p className="text-[9px] text-[var(--editorial-text-gray)] mt-0.5">
          可先检查节点配置，也可以直接运行。
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onInspect} className="border border-[var(--editorial-stroke)] px-2.5 py-1.5 text-[9px] font-black hover:bg-[var(--editorial-unselected)]">
          检查第一个节点
        </button>
        <button type="button" onClick={onRun} className="btn-editorial-primary px-3 py-1.5 text-[9px] font-black uppercase">
          运行工作流
        </button>
        <button type="button" onClick={onClose} className="border border-[var(--editorial-stroke)] p-1.5 hover:bg-[var(--editorial-unselected)]" title="关闭" aria-label="关闭提示">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// --- Main Component ---

export function WorkflowBuilder({ project, campaign, username, triggerToast }: WorkflowBuilderProps) {
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
  const [feedback, setFeedback] = useState('');
  const [loadingState, setLoadingState] = useState<'idle' | 'saving' | 'running' | 'retrying' | 'loading'>('idle');
  const [lastTasks, setLastTasks] = useState<GenerationTaskRecord[]>([]);
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(true);
  const [readOnly, setReadOnly] = useState(() => new URLSearchParams(window.location.search).get('share') === 'readonly');
  const [showCustomAgent, setShowCustomAgent] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<{ edgeId: string; x: number; y: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('clean');
  const [showHandoffBanner, setShowHandoffBanner] = useState(false);
  const [highlightedEdgeId, setHighlightedEdgeId] = useState('');

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
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCounterRef = useRef(0);
  const dragSnapshotRef = useRef<WorkflowSnapshot | null>(null);
  const clipboardRef = useRef<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDoneRef = useRef(false);
  const handoffBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const markDirty = useCallback(() => {
    if (!readOnly) setSaveStatus('dirty');
  }, [readOnly]);

  const undo = useCallback(() => {
    const cur = makeSnapshot('重做点');
    setHistory((prev) => {
      const snap = prev[prev.length - 1];
      if (!snap) return prev;
      setFuture((items) => [cur, ...items].slice(0, 25));
      restoreSnapshot(snap);
      setSaveStatus('dirty');
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
      setSaveStatus('dirty');
      return prev.slice(1);
    });
  }, [makeSnapshot, restoreSnapshot]);

  // --- Data Loading ---

  const loadProjectWorkflow = useCallback(async () => {
    if (!project) return;
    setLoadingState('loading');
    try {
      // Check for draft ID from brainstorm navigation
      const params = new URLSearchParams(window.location.search);
      const urlDraftId = params.get('draft');
      const fromBrainstorm = params.get('from') === 'brainstorm';
      if (urlDraftId) {
        const d = await apiGet<WorkspaceDraftRecord>(`/drafts/${urlDraftId}/`);
        const bc = d.brand_context || {};
        const loadedNodes = d.nodes?.length ? d.nodes.map((n) => normalizeWorkflowNode(n, bc)) : defaultNodes(project.name);
        const wfEdges = d.edges?.length ? d.edges : defaultEdges;
        const wfNodes = fromBrainstorm && hasLayoutProblems(loadedNodes, wfEdges)
          ? autoLayoutWorkflow(loadedNodes, wfEdges)
          : loadedNodes;
        setDraft(d);
        setRfNodes(wfNodes.map(wfToRF));
        setRfEdges(wfEdges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
        setBrandContext(bc);
        setSelectedNodeId('');
        setSelectedNodeIds([]);
        const snap: WorkflowSnapshot = { id: `draft-${d.id}`, label: d.name || '灵感风暴工作流', createdAt: new Date().toISOString(), nodes: wfNodes, edges: wfEdges, brandContext: bc, selectedNodeId: '' };
        setHistory([snap]); setFuture([]);
        const taskIds = d.last_run_summary?.task_ids as number[] | undefined;
        if (taskIds?.length) {
          const restored = await Promise.all(taskIds.map((id) => apiGet<GenerationTaskRecord>(`/tasks/${id}/`).catch(() => null)));
          setLastTasks(restored.filter(Boolean) as GenerationTaskRecord[]);
        }
        setSaveStatus(fromBrainstorm && hasLayoutProblems(loadedNodes, wfEdges) ? 'dirty' : 'clean');
        if (fromBrainstorm) {
          setShowHandoffBanner(true);
          if (handoffBannerTimerRef.current) clearTimeout(handoffBannerTimerRef.current);
          handoffBannerTimerRef.current = setTimeout(() => setShowHandoffBanner(false), 5000);
          setTimeout(() => fitView({ padding: 0.22, duration: 420 }), 80);
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
      setSelectedNodeId('');
      setSelectedNodeIds([]);
      const snap: WorkflowSnapshot = { id: `${detail.id}-${d?.id || 'init'}`, label: d ? '加载草稿' : '默认工作流', createdAt: new Date().toISOString(), nodes: wfNodes, edges: wfEdges, brandContext: bc, selectedNodeId: '' };
      setHistory([snap]); setFuture([]);
      setSaveStatus('clean');
      // Restore run history from persisted last_run_summary
      const taskIds = d?.last_run_summary?.task_ids as number[] | undefined;
      if (taskIds?.length) {
        const restored = await Promise.all(taskIds.map((id) => apiGet<GenerationTaskRecord>(`/tasks/${id}/`).catch(() => null)));
        setLastTasks(restored.filter(Boolean) as GenerationTaskRecord[]);
      }
    } catch (err) { triggerToast(`工作流草稿加载失败: ${err instanceof Error ? err.message : '未知错误'}`, 'error'); }
    finally { setLoadingState('idle'); }
  }, [campaign?.id, fitView, project, triggerToast, setRfNodes, setRfEdges]);

  useEffect(() => {
    const t = window.setTimeout(() => { loadProjectWorkflow(); }, 0);
    return () => window.clearTimeout(t);
  }, [loadProjectWorkflow]);

  useEffect(() => () => {
    if (handoffBannerTimerRef.current) clearTimeout(handoffBannerTimerRef.current);
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
  }, []);

  // --- API Actions ---

  const persistDraft = async (nextNodes = nodes, nextEdges = edges, silent = false) => {
    if (!project) throw new Error('Project is required');
    setSaveStatus('saving');
    try {
      const body = { project_id: project.id, campaign_id: campaign?.id, name: draft?.name || 'Default Workflow', brand_context: brandContext, nodes: nextNodes, edges: nextEdges, selected_node_id: selectedNodeId, status: 'draft' };
      const saved = draft ? await apiPatch<WorkspaceDraftRecord>(`/drafts/${draft.id}/`, body) : await apiPost<WorkspaceDraftRecord>('/drafts/', body);
      setDraft(saved);
      const sn = saved.nodes.map((n) => normalizeWorkflowNode(n, saved.brand_context || brandContext));
      setRfNodes(sn.map(wfToRF));
      setRfEdges(saved.edges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
      setBrandContext(saved.brand_context);
      const snap: WorkflowSnapshot = { id: `${saved.id}-${Date.now()}`, label: silent ? '自动保存' : '手动保存', createdAt: new Date().toISOString(), nodes: sn, edges: saved.edges, brandContext: saved.brand_context, selectedNodeId };
      setHistory((prev) => [...prev.slice(-24), snap]);
      setFuture([]);
      setSaveStatus('saved');
      if (!silent) triggerToast('画布草稿已保存', 'success');
      return saved;
    } catch (err) {
      setSaveStatus('failed');
      throw err;
    }
  };

  // Auto-save (must be after persistDraft declaration)
  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      if (nodes.length > 0 || edges.length > 0) initialLoadDoneRef.current = true;
      if (saveStatus !== 'dirty') return;
    }
    if (!draft || readOnly) return;
    if (saveStatus !== 'dirty') return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { persistDraft(nodes, edges, true).catch(() => {}); }, 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [nodes, edges, brandContext, saveStatus]); // eslint-disable-line react-hooks/exhaustive-deps

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
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let runningDraftId: number | null = null;
    try {
      markHistory('运行前保存');
      const saved = await persistDraft(nodes, edges, true);
      runningDraftId = saved.id;
      const orderedNodes = workflowExecutionOrder(nodes, edges);
      const firstRunningId = orderedNodes[0]?.id || '';
      const optimisticNodes = nodes.map((node) => ({
        ...node,
        status: node.id === firstRunningId ? 'running' as const : 'queued' as const,
        error_message: undefined,
      }));
      setDraft({ ...saved, status: 'running', nodes: optimisticNodes });
      setRfNodes(optimisticNodes.map(wfToRF));
      setLastTasks([]);
      pollTimer = setInterval(async () => {
        try {
          const liveDraft = await apiGet<WorkspaceDraftRecord>(`/drafts/${saved.id}/`);
          const liveNodes = liveDraft.nodes.map((n) => normalizeWorkflowNode(n, liveDraft.brand_context || brandContext));
          setDraft(liveDraft);
          setRfNodes(liveNodes.map(wfToRF));
          setRfEdges(liveDraft.edges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
          if (liveDraft.status !== 'running' && pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        } catch {
          // Keep the optimistic local progress; the final run response will reconcile state.
        }
      }, 1400);
      const data = await apiPost<{ draft: WorkspaceDraftRecord; tasks: GenerationTaskRecord[] }>(`/drafts/${saved.id}/run/`, { username });
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      setDraft(data.draft);
      const sn = data.draft.nodes.map((n) => normalizeWorkflowNode(n, data.draft.brand_context || brandContext));
      setRfNodes(sn.map(wfToRF));
      setRfEdges(data.draft.edges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
      setLastTasks(data.tasks);
      const failedNodes = sn.filter((node) => node.status === 'failed');
      if (failedNodes.length > 0) {
        triggerToast(`工作流完成，但 ${failedNodes.length} 个节点失败`, 'error');
      } else {
        triggerToast('画布工作流执行完毕', 'success');
      }
      // 后端 run_now=True 时 run 接口返回前所有 task 已同步执行完，assets 已落库。
      // 通知 ProjectManager 重新拉取项目详情，inspector 的资产列表自动更新。
      window.dispatchEvent(new CustomEvent('mh:assets-updated', { detail: { projectId: project.id } }));
    } catch (err) {
      if (runningDraftId) {
        await apiGet<WorkspaceDraftRecord>(`/drafts/${runningDraftId}/`).then((liveDraft) => {
          const liveNodes = liveDraft.nodes.map((n) => normalizeWorkflowNode(n, liveDraft.brand_context || brandContext));
          setDraft(liveDraft);
          setRfNodes(liveNodes.map(wfToRF));
          setRfEdges(liveDraft.edges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
        }).catch(() => undefined);
      }
      triggerToast(`工作流执行失败: ${err instanceof Error ? err.message : '未知错误'}`, 'error');
    }
    finally {
      if (pollTimer) clearInterval(pollTimer);
      setLoadingState('idle');
    }
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

  // --- UI Event Handlers ---

  const addNode = useCallback((type: NodeType, label: string, extraConfig?: Record<string, unknown>) => {
    if (readOnly) return;
    markHistory('新增节点');
    markDirty();
    idCounterRef.current += 1;
    const id = `${type}-local-${idCounterRef.current}`;
    const preset = presets.find((p) => p.type === type);
    const vp = getViewport();
    const cx = -vp.x / vp.zoom + window.innerWidth / 2 / vp.zoom;
    const cy = -vp.y / vp.zoom + 300 / vp.zoom;
    const ox = ((idCounterRef.current * 37) % 80) - 40;
    const oy = ((idCounterRef.current * 53) % 80) - 40;
    const wfNode: WorkflowNode = { id, type, label, x: cx + ox, y: cy + oy, width: preset?.width || 260, height: preset?.height || 200, status: 'idle', config: { ...defaultNodeConfig(type, brandContext), ...(extraConfig || {}) }, output: {}, input_schema: ioSchema[type].input, output_schema: ioSchema[type].output };
    setRfNodes((prev) => [...prev, wfToRF(wfNode)]);
    setSelectedNodeId(id); setSelectedNodeIds([id]);
  }, [readOnly, brandContext, markHistory, markDirty, getViewport, setRfNodes]);

  const updateNode = useCallback((id: string, patch: Partial<WorkflowNode>) => {
    if (readOnly) return;
    debouncedMarkHistory(`编辑节点 ${id}`);
    markDirty();
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
        errorMessage: patch.error_message ?? old.errorMessage,
        taskId: patch.task_id ?? old.taskId,
        inputSchema: patch.input_schema ?? old.inputSchema,
        outputSchema: patch.output_schema ?? old.outputSchema,
      }};
    }));
  }, [readOnly, debouncedMarkHistory, markDirty, setRfNodes]);

  const selectNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
    setRfNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === id })));
  }, [setRfNodes]);

  const updateSelectedConfig = useCallback((key: string, value: string | number) => {
    if (!selectedNode || readOnly) return;
    updateNode(selectedNode.id, { config: { ...selectedNode.config, [key]: value } });
  }, [selectedNode, readOnly, updateNode]);

  const clearNodeSelection = useCallback(() => {
    setSelectedNodeId('');
    setSelectedNodeIds([]);
    setRfNodes((prev) => prev.map((n) => ({ ...n, selected: false })));
  }, [setRfNodes]);

  const removeSelectedNode = useCallback(() => {
    if (!selectedNode || readOnly) return;
    markHistory('删除节点');
    markDirty();
    setRfNodes((prev) => prev.filter((n) => n.id !== selectedNode.id));
    setRfEdges((prev) => prev.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNodeId(''); setSelectedNodeIds([]);
  }, [selectedNode, readOnly, markHistory, markDirty, setRfNodes, setRfEdges]);

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
      const edgeId = `edge-local-${idCounterRef.current}`;
      setRfEdges((prev) => addEdge({ source: connectionSource, target: targetId, id: edgeId }, prev));
      setHighlightedEdgeId(edgeId);
      setTimeout(() => setHighlightedEdgeId(''), 700);
      markDirty();
    }
    setConnectionSource('');
  }, [readOnly, connectionSource, nodes, edges, triggerToast, markDirty, setRfEdges]);

  // ReactFlow onConnect — uses addEdge directly on edges state
  const handleConnect = useCallback((conn: Connection) => {
    if (readOnly || !conn.source || !conn.target || conn.source === conn.target) return;
    if (rfEdges.some((e) => e.source === conn.source && e.target === conn.target)) return;
    const src = nodes.find((n) => n.id === conn.source);
    const tgt = nodes.find((n) => n.id === conn.target);
    if (src && tgt && !schemasCompatible(src.output_schema, tgt.input_schema)) { triggerToast('类型不兼容', 'error'); return; }
    const edgeId = `edge-${conn.source}-${conn.target}`;
    setRfEdges((eds) => addEdge({ ...conn, id: edgeId }, eds));
    setHighlightedEdgeId(edgeId);
    setTimeout(() => setHighlightedEdgeId(''), 700);
    markDirty();
  }, [readOnly, rfEdges, nodes, triggerToast, markDirty, setRfEdges]);

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
    setSelectedNodeId(ids[0] || '');
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
    markDirty();
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
  }, [readOnly, markHistory, markDirty, getViewport, setRfNodes, setRfEdges, triggerToast]);

  const createReadOnlyShare = useCallback(async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('share', 'readonly');
    await navigator.clipboard?.writeText(url.toString()).catch(() => undefined);
    setReadOnly(true);
    triggerToast('只读分享链接已复制', 'info');
  }, [triggerToast]);

  const tidyLayout = useCallback(() => {
    if (readOnly || nodes.length === 0) return;
    markHistory('整理布局');
    const nextNodes = autoLayoutWorkflow(nodes, edges);
    setRfNodes(nextNodes.map(wfToRF));
    setSelectedNodeId(nextNodes[0]?.id || '');
    setSelectedNodeIds(nextNodes[0]?.id ? [nextNodes[0].id] : []);
    markDirty();
    setTimeout(() => fitView({ padding: 0.22, duration: 320 }), 80);
  }, [readOnly, nodes, edges, markHistory, markDirty, fitView, setRfNodes]);

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
      if (e.key === 'Escape') {
        e.preventDefault();
        if (connectionSource) setConnectionSource('');
        else if (selectedNodeId) clearNodeSelection();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [clearNodeSelection, connectionSource, copySelection, pasteSelection, readOnly, redo, removeSelectedNode, selectedNodeId, undo]);

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
      readOnly,
      isConnectionSource: connectionSource === n.id,
      connectionModeActive: !!connectionSource,
      isCompatibleTarget: !connectionSource || connectionSource === n.id || (() => {
        const src = nodes.find((node) => node.id === connectionSource);
        const tgt = nodes.find((node) => node.id === n.id);
        return !!src && !!tgt && schemasCompatible(src.output_schema, tgt.input_schema);
      })(),
      onStartConnect: (id: string) => setConnectionSourceRef.current(id),
      onOpenContextMenu: (id: string, x: number, y: number) => {
        setSelectedNodeIdRef.current(id);
        setContextMenuRef.current({ nodeId: id, x, y });
      },
    },
  })), [rfNodes, connectionSource, readOnly, nodes]);

  const renderedEdges = useMemo(() => rfEdges.map((edge) => {
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);
    const isFlowing =
      loadingState === 'running' &&
      (source?.status === 'running' ||
        target?.status === 'running' ||
        (source?.status === 'succeeded' && target?.status === 'queued'));
    if (edge.id === highlightedEdgeId) {
      return {
        ...edge,
        animated: true,
        style: { ...(edge.style || {}), stroke: '#2563eb', strokeWidth: 3 },
      };
    }
    if (!isFlowing) return edge;
    return {
      ...edge,
      animated: true,
      style: { ...(edge.style || {}), stroke: '#2563eb', strokeWidth: 2.5 },
    };
  }), [rfEdges, highlightedEdgeId, loadingState, nodes]);

  if (!project) return <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-8 shadow-editorial text-xs font-mono text-[var(--editorial-text-gray)]">请先在项目库选择当前项目。</div>;
  const primaryPresets = presets.filter((item) => ['context', 'copy', 'image_prompt', 'review'].includes(item.type));
  const secondaryPresets = presets.filter((item) => !primaryPresets.some((primary) => primary.type === item.type));

  return (
    <div className="space-y-5 font-mono min-w-0">
      <section className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial overflow-hidden min-w-0">
        {/* Toolbar Row 1: Project + Primary Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[var(--editorial-stroke)]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-black uppercase truncate max-w-[260px]">{projectDetail?.name || project.name}</h3>
              {readOnly && <span className="border border-[var(--editorial-stroke)] px-1.5 py-0.5 text-[8px] flex items-center gap-1"><Lock className="h-3 w-3" />只读</span>}
              <SaveStatusBadge status={saveStatus} />
            </div>
            <span className="text-[9px] text-[var(--editorial-text-gray)]">{campaign?.name || 'Default Campaign'} / {draft?.status || 'draft'} / {selectedNodeIds.length} 个已选</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 max-w-full">
            {primaryPresets.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.type} type="button" disabled={readOnly} onClick={() => addNode(item.type, item.label)} className={toolbarButtonClass}>
                  <Icon className="h-3.5 w-3.5" />{item.label}
                </button>
              );
            })}
            <select
              disabled={readOnly}
              defaultValue=""
              onChange={(e) => {
                const item = presets.find((preset) => preset.type === e.target.value);
                if (item) addNode(item.type, item.label);
                e.currentTarget.value = '';
              }}
              className={`${toolbarButtonClass} appearance-none pr-7`}
              aria-label="添加更多节点"
            >
              <option value="">+ 节点</option>
              {secondaryPresets.map((item) => (
                <option key={item.type} value={item.type}>{item.label}</option>
              ))}
            </select>
            <button type="button" disabled={readOnly} onClick={() => setShowCustomAgent(true)} className={toolbarButtonClass}>
              <Plus className="h-3.5 w-3.5" />新建智能体
            </button>
          </div>
        </div>

        {/* Toolbar Row 2: Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--editorial-stroke)]/70 bg-[var(--editorial-bg)]">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={undo} disabled={history.length === 0 || readOnly} className={toolbarIconButtonClass} title="撤销"><Undo2 className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={redo} disabled={future.length === 0 || readOnly} className={toolbarIconButtonClass} title="重做"><Redo2 className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={copySelection} disabled={selectedNodeIds.length === 0} className={toolbarIconButtonClass} title="复制"><Clipboard className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={pasteSelection} disabled={readOnly} className={toolbarIconButtonClass} title="粘贴"><ClipboardPaste className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => fitView({ padding: 0.18, duration: 180 })} className={toolbarIconButtonClass} title="适配视图"><CheckCircle2 className="h-3.5 w-3.5" /></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => persistDraft(nodes, edges, false).catch((err) => triggerToast(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`, 'error'))} disabled={readOnly || saveStatus === 'saving'} className={toolbarButtonClass}>
              <Save className="h-3.5 w-3.5" /> 保存
            </button>
            <button type="button" onClick={tidyLayout} disabled={readOnly || nodes.length === 0} className={toolbarButtonClass}>
              <LayoutDashboard className="h-3.5 w-3.5" />整理布局
            </button>
            <button type="button" onClick={runWorkflow} disabled={loadingState !== 'idle' || readOnly} className={toolbarPrimaryClass}>
              <Play className="h-4 w-4" />
              {loadingState === 'running' ? '执行中…' : loadingState === 'retrying' ? '重试中…' : '运行工作流'}
            </button>
            <span className="h-9 inline-flex items-center gap-1.5 text-[9px] text-[var(--editorial-text-gray)] border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-2 leading-none">
              <span className={`h-1.5 w-1.5 rounded-full ${draft?.status === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              {draft?.status || 'draft'}
            </span>
            <button type="button" onClick={createReadOnlyShare} className={toolbarButtonClass}><Eye className="h-3.5 w-3.5" />只读分享</button>
            {readOnly && (
              <button type="button" onClick={() => setReadOnly(false)} className={toolbarButtonClass}>
                退出只读
              </button>
            )}
            <button type="button" onClick={() => setPropertyPanelOpen((v) => !v)} className={toolbarIconButtonClass} title="展开或收起右侧属性面板">{propertyPanelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}</button>
          </div>
        </div>

        {/* Canvas + Sidebar */}
        <div className={`grid grid-cols-1 ${propertyPanelOpen ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''} min-w-0`}>
          <div className="relative h-[calc(100vh-260px)] min-h-[400px] min-w-0 bg-[var(--editorial-bg)]">
            {showHandoffBanner && (
              <WorkflowHandoffBanner
                onRun={() => { setShowHandoffBanner(false); runWorkflow(); }}
                onInspect={() => {
                  setShowHandoffBanner(false);
                  const firstId = nodes[0]?.id;
                  if (firstId) selectNode(firstId);
                }}
                onClose={() => setShowHandoffBanner(false)}
              />
            )}
            {connectionSource && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 py-1.5 text-[10px] font-black shadow-editorial-sm">
                点击目标节点完成连接 · ESC 取消
              </div>
            )}
            {loadingState === 'loading' && (
              <div className="absolute inset-0 z-10 bg-[var(--editorial-bg)]/78 backdrop-blur-[1px] p-8">
                <div className="grid grid-cols-3 gap-8 max-w-4xl">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="h-44 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] shadow-editorial-sm opacity-70">
                      <div className="h-8 border-b border-[var(--editorial-stroke)]/40 bg-[var(--editorial-unselected)]" />
                      <div className="m-4 h-3 w-24 bg-[var(--editorial-unselected)]" />
                      <div className="mx-4 mt-3 h-16 border border-dashed border-[var(--editorial-stroke)]/40" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {loadingState !== 'loading' && nodes.length === 0 && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="pointer-events-auto border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] shadow-editorial p-5 max-w-sm">
                  <h4 className="text-xs font-black uppercase">还没有工作流节点</h4>
                  <p className="mt-2 text-[10px] text-[var(--editorial-text-gray)]">从常用节点开始搭建当前项目的内容生产流程。</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button type="button" onClick={() => addNode('copy', '文案节点')} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)]">添加文案节点</button>
                    <button type="button" onClick={() => addNode('image_prompt', '图片提示词')} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)]">添加图像节点</button>
                  </div>
                </div>
              </div>
            )}
            <ReactFlow
              nodes={rfNodesWithMeta}
              edges={renderedEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              isValidConnection={isValidConnection}
              onSelectionChange={handleSelectionChange}
              onNodeClick={(_, node) => { setContextMenu(null); if (connectionSource && connectionSource !== node.id) connectToNode(node.id); else selectNode(node.id); }}
              onPaneClick={() => { setContextMenu(null); setEdgeContextMenu(null); clearNodeSelection(); }}
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
              <NodeConfigPopover
                node={selectedNode}
                readOnly={readOnly}
                feedback={feedback}
                loadingState={loadingState}
                onUpdateNode={updateNode}
                onUpdateConfig={updateSelectedConfig}
                onSetFeedback={setFeedback}
                onRetryNode={retryNode}
                onRemoveNode={removeSelectedNode}
                onClose={clearNodeSelection}
              />
            </ReactFlow>
          </div>
          {propertyPanelOpen && (
            <PropertyPanel
              nodes={nodes}
              edges={edges}
              selectedNodeId={selectedNodeId}
              loadingState={loadingState}
              draftStatus={draft?.status}
              runPreview={runPreview}
              lastTasks={lastTasks}
              onTidyLayout={tidyLayout}
              onSelectNode={selectNode}
            />
          )}
        </div>
      </section>

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
            markDirty();
            const nn: WorkflowNode = { ...src, id: newId, label: `${src.label} (副本)`, x: src.x + 40, y: src.y + 40, config: { ...src.config }, output: {}, status: 'idle' };
            setRfNodes((prev) => [...prev, wfToRF(nn)]);
            setSelectedNodeId(newId);
          }}
          onConfigure={(id) => { selectNode(id); setPropertyPanelOpen(true); }}
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
                markDirty();
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
