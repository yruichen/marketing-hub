import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  useReactFlow, addEdge,
  useNodesState, useEdgesState,
  type Connection, type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { apiFetch, apiGet, apiPatch, apiPost, buildErrorToast, parseApiErrorResponse, useCopyClipboard } from '../hooks/useApi';
import type {
  BrandContext, GenerationTaskRecord,
  WorkflowEdge, WorkflowNode, WorkflowRunRecord, WorkspaceDraftRecord,
  WorkflowAiEditResponse,
} from '../types/workspace';
import { presets, ioSchema, defaultNodeConfig, defaultNodes, defaultEdges, type NodeType } from '../features/workflows/constants';
import { normalizeWorkflowNode, type ProjectDetail, type WorkflowBuilderProps, type WorkflowSnapshot } from '../features/workflows/types';
import { schemasCompatible, workflowExecutionOrder } from '../features/workflows/utils';
import { PropertyPanel } from '../features/workflows/PropertyPanel';
import { CustomAgentDialog, type CustomAgentForm } from '../features/workflows/CustomAgentDialog';
import { autoLayoutWorkflow, hasLayoutProblems } from '../features/workflows/layout';
import { WorkflowBuilderCanvas } from '../features/workflows/WorkflowBuilderCanvas';
import { WorkflowBuilderContextMenus } from '../features/workflows/WorkflowBuilderContextMenus';
import {
  WorkflowBuilderToolbar,
  type SaveStatus,
  type WorkflowLoadingState,
} from '../features/workflows/WorkflowBuilderToolbar';
import {
  WorkflowConnectionHint,
  WorkflowEmptyState,
  WorkflowHandoffBanner,
  WorkflowLoadingOverlay,
} from '../features/workflows/WorkflowBuilderOverlays';
import { buildWorkflowReadiness } from '../features/workflows/workflowReadiness';
import { classifyWorkflowFailure, formatNodeDiagnosticSnapshot } from '../features/workflows/workflowRecovery';
import { mergeWorkflowRunIntoNodes, workflowRunIsActive } from '../features/workflows/workflowRunState';
import { WorkflowNodeDetailDialog } from '../features/workflows/WorkflowNodeDetailDialog';
import {
  WorkflowAssetPanel,
  WORKFLOW_ASSET_DRAG_TYPE,
  type WorkflowAssetDragPayload,
} from '../features/workflows/WorkflowAssetPanel';

import { wfToRF, rfToWF } from '../features/workflows/conversions';
import type { FlowNode } from '../features/workflows/WorkflowNodeComponent';

type RFNode = FlowNode;

// --- Main Component ---

export function WorkflowBuilder({
  project,
  campaign,
  organizationSlug,
  username,
  triggerToast,
  featureEntitlements,
  onOpenBilling,
  onErrorAction,
}: WorkflowBuilderProps) {
  const { fitView, getViewport, screenToFlowPosition } = useReactFlow();

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
  const [loadingState, setLoadingState] = useState<WorkflowLoadingState>('idle');
  const [lastTasks, setLastTasks] = useState<GenerationTaskRecord[]>([]);
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(true);
  const [readOnly, setReadOnly] = useState(() => new URLSearchParams(window.location.search).get('share') === 'readonly');
  const [showCustomAgent, setShowCustomAgent] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<{ edgeId: string; x: number; y: number } | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('clean');
  const [showHandoffBanner, setShowHandoffBanner] = useState(false);
  const [highlightedEdgeId, setHighlightedEdgeId] = useState('');
  const [currentWorkflowRun, setCurrentWorkflowRun] = useState<WorkflowRunRecord | null>(null);
  const [detailNodeId, setDetailNodeId] = useState('');
  const [detailMode, setDetailMode] = useState<'edit' | 'ai'>('edit');
  const [workflowDockOpen, setWorkflowDockOpen] = useState(true);
  const [workflowDockTab, setWorkflowDockTab] = useState<'assets' | 'ai' | 'nodes'>('assets');
  const [globalAiInstruction, setGlobalAiInstruction] = useState('');
  const [aiEditLoading, setAiEditLoading] = useState(false);

  // Derived: RF nodes → WorkflowNode for UI
  const nodes: WorkflowNode[] = useMemo(() => rfNodes.map(rfToWF), [rfNodes]);
  const edges: WorkflowEdge[] = useMemo(() => rfEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })), [rfEdges]);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const detailNode = useMemo(() => nodes.find((n) => n.id === detailNodeId) || null, [detailNodeId, nodes]);
  const runPreview = useMemo(() => ({
    stepCount: nodes.length, estimatedCost: `$${(nodes.length * 0.03).toFixed(2)}`,
    estimatedMinutes: Math.max(1, Math.round(nodes.length * 0.8)),
  }), [nodes.length]);
  const workflowReadiness = useMemo(() => buildWorkflowReadiness(nodes, edges, brandContext), [nodes, edges, brandContext]);
  const copyClipboard = useCopyClipboard(triggerToast);
  const canRunWorkflow = featureEntitlements?.workflow_run ?? true;
  const canCreateCustomAgent = featureEntitlements?.custom_agent ?? true;
  const canUseAdvancedNodes = featureEntitlements?.advanced_nodes ?? true;
  const canUseVideoNode = featureEntitlements?.video_render ?? true;
  const openWorkflowProGate = useCallback(() => {
    triggerToast('工作流运行、高级节点和自定义智能体需要 Pro。免费用户可以编辑和保存草稿。', 'info');
    onOpenBilling?.();
  }, [onOpenBilling, triggerToast]);
  const isNodeLocked = useCallback((type: NodeType) => {
    if (type === 'custom_agent') return !canCreateCustomAgent;
    if (type === 'retrieval' || type === 'review') return !canUseAdvancedNodes;
    if (type === 'video_generation') return !canUseVideoNode;
    return false;
  }, [canCreateCustomAgent, canUseAdvancedNodes, canUseVideoNode]);

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
        const workflowRunId = d.last_run_summary?.workflow_run_id as number | undefined;
        if (workflowRunId) {
          apiGet<WorkflowRunRecord>(`/workflow-runs/${workflowRunId}/`)
            .then(setCurrentWorkflowRun)
            .catch(() => setCurrentWorkflowRun(null));
        } else {
          setCurrentWorkflowRun(null);
        }
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
      const workflowRunId = d?.last_run_summary?.workflow_run_id as number | undefined;
      if (workflowRunId) {
        apiGet<WorkflowRunRecord>(`/workflow-runs/${workflowRunId}/`)
          .then(setCurrentWorkflowRun)
          .catch(() => setCurrentWorkflowRun(null));
      } else {
        setCurrentWorkflowRun(null);
      }
      const taskIds = d?.last_run_summary?.task_ids as number[] | undefined;
      if (taskIds?.length) {
        const restored = await Promise.all(taskIds.map((id) => apiGet<GenerationTaskRecord>(`/tasks/${id}/`).catch(() => null)));
        setLastTasks(restored.filter(Boolean) as GenerationTaskRecord[]);
      }
    } catch (err) { triggerToast(buildErrorToast(err, '工作流草稿加载失败')); }
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

  const persistDraft = useCallback(async (nextNodes = nodes, nextEdges = edges, silent = false) => {
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
  }, [brandContext, campaign, draft, edges, nodes, project, selectedNodeId, setBrandContext, setDraft, setFuture, setHistory, setRfEdges, setRfNodes, setSaveStatus, triggerToast]);

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

  const executeWorkflow = useCallback(async () => {
    if (!project) { triggerToast('请先选择项目', 'error'); return; }
    if (readOnly) { triggerToast('只读模式下无法运行', 'error'); return; }
    if (!canRunWorkflow) { openWorkflowProGate(); return; }
    if (!workflowReadiness.canRun) {
      triggerToast('运行前仍有阻断项需要修复', 'error');
      return;
    }
    setLoadingState('running');
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let runningDraftId: number | null = null;
    let workflowRunId: number | null = null;
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
      const startResponse = await apiPost<{ workflow_run: WorkflowRunRecord; draft: WorkspaceDraftRecord; tasks: GenerationTaskRecord[] }>(
        `/drafts/${saved.id}/run/`,
        { username, async: true },
      );
      workflowRunId = startResponse.workflow_run.id;
      setCurrentWorkflowRun(startResponse.workflow_run);

      const pollWorkflowRun = async () => {
        if (!workflowRunId) return null;
        try {
          const liveRun = await apiGet<WorkflowRunRecord>(`/workflow-runs/${workflowRunId}/`);
          setCurrentWorkflowRun(liveRun);
          setRfNodes(mergeWorkflowRunIntoNodes(nodesRef.current, liveRun).map(wfToRF));
          if (!workflowRunIsActive(liveRun) && pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
          return liveRun;
        } catch {
          return null;
        }
      };

      pollTimer = setInterval(() => { void pollWorkflowRun(); }, 1200);
      let finalRun: WorkflowRunRecord | null = startResponse.workflow_run;
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        finalRun = await pollWorkflowRun() || finalRun;
        if (finalRun && !workflowRunIsActive(finalRun)) break;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (!finalRun || workflowRunIsActive(finalRun)) {
        triggerToast('工作流已提交，长任务会继续在任务中心运行', 'info');
        return;
      }
      const liveDraft = await apiGet<WorkspaceDraftRecord>(`/drafts/${saved.id}/`);
      const taskIds = (finalRun.summary?.task_ids || liveDraft.last_run_summary?.task_ids || []) as number[];
      const tasks = taskIds.length
        ? (await Promise.all(taskIds.map((id) => apiGet<GenerationTaskRecord>(`/tasks/${id}/`).catch(() => null)))).filter(Boolean) as GenerationTaskRecord[]
        : [];
      const data = { draft: liveDraft, tasks };
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
      window.dispatchEvent(new CustomEvent('mh:assets-updated', {
        detail: {
          projectId: project.id,
          workflowRunId: finalRun.id,
          assetIds: Array.isArray(finalRun.summary?.asset_ids) ? finalRun.summary.asset_ids : [],
        },
      }));
    } catch (err) {
      if (runningDraftId) {
        await apiGet<WorkspaceDraftRecord>(`/drafts/${runningDraftId}/`).then((liveDraft) => {
          const liveNodes = liveDraft.nodes.map((n) => normalizeWorkflowNode(n, liveDraft.brand_context || brandContext));
          setDraft(liveDraft);
          setRfNodes(liveNodes.map(wfToRF));
          setRfEdges(liveDraft.edges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
        }).catch(() => undefined);
      }
      triggerToast(buildErrorToast(err, '工作流执行失败'));
    }
    finally {
      if (pollTimer) clearInterval(pollTimer);
      setLoadingState('idle');
    }
  }, [brandContext, canRunWorkflow, edges, markHistory, nodes, nodesRef, openWorkflowProGate, persistDraft, project, readOnly, setCurrentWorkflowRun, setDraft, setLastTasks, setLoadingState, setRfEdges, setRfNodes, triggerToast, username, workflowReadiness]);

  const runWorkflow = useCallback(() => {
    if (!project) { triggerToast('请先选择项目', 'error'); return; }
    if (readOnly) { triggerToast('只读模式下无法运行', 'error'); return; }
    if (!canRunWorkflow) { openWorkflowProGate(); return; }
    void executeWorkflow();
  }, [canRunWorkflow, executeWorkflow, openWorkflowProGate, project, readOnly, triggerToast]);

  const copyNodeDiagnostics = useCallback((nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
      triggerToast('未找到节点，无法复制诊断信息', 'error');
      return;
    }
    void copyClipboard(formatNodeDiagnosticSnapshot(node, nodes, edges));
  }, [copyClipboard, edges, nodes, triggerToast]);

  const recoverFromNode = async (nodeId: string, recoveryFeedback?: string) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) {
      triggerToast('未找到节点，无法恢复', 'error');
      return;
    }
    if (!project) {
      triggerToast('请先选择项目', 'error');
      return;
    }
    if (readOnly) { triggerToast('只读模式下无法重试', 'error'); return; }
    if (!canRunWorkflow) { openWorkflowProGate(); return; }
    setLoadingState('retrying');
    try {
      const recovery = classifyWorkflowFailure(node.error_message || '');
      const feedbackText = recoveryFeedback?.trim()
        || `${recovery.title}：${recovery.primaryAction}；从该节点向后恢复运行。`;
      markHistory(`节点恢复 ${node.id}`);
      const saved = await persistDraft(nodes, edges, true);
      const idempotencyKey = `workflow-retry-${saved.id}-${node.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const response = await apiFetch(`/drafts/${saved.id}/nodes/${node.id}/retry/`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ username, feedback: feedbackText }),
      });
      if (!response.ok) {
        throw await parseApiErrorResponse(response, `/drafts/${saved.id}/nodes/${node.id}/retry/`);
      }
      const data = await response.json() as {
        draft: WorkspaceDraftRecord;
        task: GenerationTaskRecord | null;
        workflow_run?: WorkflowRunRecord;
      };
      setDraft(data.draft);
      const sn = data.draft.nodes.map((n) => normalizeWorkflowNode(n, data.draft.brand_context || brandContext));
      setRfNodes(sn.map(wfToRF));
      setRfEdges(data.draft.edges.map((e) => ({ id: e.id || `edge-${e.source}-${e.target}`, source: e.source, target: e.target })));
      setLastTasks(data.task ? [data.task] : []);
      setCurrentWorkflowRun(data.workflow_run || null);
      window.dispatchEvent(new CustomEvent('mh:assets-updated', {
        detail: {
          projectId: project.id,
          workflowRunId: data.workflow_run?.id,
          assetIds: Array.isArray(data.workflow_run?.summary?.asset_ids) ? data.workflow_run.summary.asset_ids : [],
        },
      }));
      triggerToast(node.status === 'failed' ? '失败节点已恢复并向后重跑' : '已从该节点向后重跑', 'success');
    } catch (err) { triggerToast(buildErrorToast(err, '节点恢复失败')); }
    finally { setLoadingState('idle'); }
  };

  const applyAiEdit = async (mode: 'node' | 'workflow', nodeId: string, instruction: string, runAfter = false) => {
    if (!project) { triggerToast('请先选择项目', 'error'); return; }
    if (readOnly) { triggerToast('只读模式下无法使用 AI 修改', 'error'); return; }
    if (!canUseAdvancedNodes) { openWorkflowProGate(); return; }
    const trimmed = instruction.trim();
    if (!trimmed) { triggerToast('请输入 AI 修改意见', 'error'); return; }
    setAiEditLoading(true);
    if (runAfter) setLoadingState('retrying');
    try {
      const baseDraft = draft || await persistDraft(nodes, edges, true);
      const result = await apiPost<WorkflowAiEditResponse>(`/drafts/${baseDraft.id}/ai-edit/`, {
        mode,
        instruction: trimmed,
        node_id: nodeId,
        nodes,
        edges,
        brand_context: brandContext,
      });
      const nextNodes = result.nodes.map((node) => normalizeWorkflowNode(node, brandContext));
      const nextEdges = result.edges;
      markHistory(mode === 'node' ? 'AI 修改节点' : 'AI 微调工作流');
      setRfNodes(nextNodes.map(wfToRF));
      setRfEdges(nextEdges.map((edge) => ({ id: edge.id || `edge-${edge.source}-${edge.target}`, source: edge.source, target: edge.target })));
      markDirty();
      triggerToast(result.summary || 'AI 修改已应用', 'success');
      if (mode === 'workflow') setGlobalAiInstruction('');
      if (!runAfter || !nodeId) return;

      const saved = await persistDraft(nextNodes, nextEdges, true);
      const retryResponse = await apiFetch(`/drafts/${saved.id}/nodes/${nodeId}/retry/`, {
        method: 'POST',
        headers: { 'Idempotency-Key': `workflow-ai-edit-retry-${saved.id}-${nodeId}-${Date.now()}` },
        body: JSON.stringify({ username, feedback: trimmed }),
      });
      if (!retryResponse.ok) {
        throw await parseApiErrorResponse(retryResponse, `/drafts/${saved.id}/nodes/${nodeId}/retry/`);
      }
      const data = await retryResponse.json() as {
        draft: WorkspaceDraftRecord;
        task: GenerationTaskRecord | null;
        workflow_run?: WorkflowRunRecord;
      };
      setDraft(data.draft);
      const sn = data.draft.nodes.map((node) => normalizeWorkflowNode(node, data.draft.brand_context || brandContext));
      setRfNodes(sn.map(wfToRF));
      setRfEdges(data.draft.edges.map((edge) => ({ id: edge.id || `edge-${edge.source}-${edge.target}`, source: edge.source, target: edge.target })));
      setLastTasks(data.task ? [data.task] : []);
      setCurrentWorkflowRun(data.workflow_run || null);
      window.dispatchEvent(new CustomEvent('mh:assets-updated', {
        detail: {
          projectId: project.id,
          workflowRunId: data.workflow_run?.id,
          assetIds: Array.isArray(data.workflow_run?.summary?.asset_ids) ? data.workflow_run.summary.asset_ids : [],
        },
      }));
      triggerToast('AI 修改已应用，并已从该节点向后重跑', 'success');
    } catch (err) {
      triggerToast(buildErrorToast(err, 'AI 修改失败'));
    } finally {
      setAiEditLoading(false);
      if (runAfter) setLoadingState('idle');
    }
  };

  // --- UI Event Handlers ---

  const addNode = useCallback((type: NodeType, label: string, extraConfig?: Record<string, unknown>) => {
    if (readOnly) return;
    if (isNodeLocked(type)) {
      openWorkflowProGate();
      return;
    }
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
    const wfNode: WorkflowNode = { id, type, label, x: cx + ox, y: cy + oy, width: preset?.width || 320, height: preset?.height || 360, status: 'idle', config: { ...defaultNodeConfig(type, brandContext), ...(extraConfig || {}) }, output: {}, input_schema: ioSchema[type].input, output_schema: ioSchema[type].output };
    setRfNodes((prev) => [...prev, wfToRF(wfNode)]);
    setSelectedNodeId(id); setSelectedNodeIds([id]);
  }, [readOnly, isNodeLocked, openWorkflowProGate, brandContext, markHistory, markDirty, getViewport, setRfNodes]);

  const createAssetGroupNode = useCallback((payload?: WorkflowAssetDragPayload, position?: { x: number; y: number }) => {
    if (readOnly) return;
    if (isNodeLocked('retrieval')) {
      openWorkflowProGate();
      return;
    }
    markHistory('新增素材组');
    markDirty();
    idCounterRef.current += 1;
    const id = `retrieval-asset-${idCounterRef.current}`;
    const vp = getViewport();
    const x = position?.x ?? (-vp.x / vp.zoom + window.innerWidth / 2 / vp.zoom);
    const y = position?.y ?? (-vp.y / vp.zoom + 260 / vp.zoom);
    const referenceUrls = payload?.source_url ? [payload.source_url] : [];
    const assetIds = payload?.asset_id ? [payload.asset_id] : [];
    const label = payload ? `素材组 · ${payload.title}` : '素材组';
    const wfNode: WorkflowNode = {
      id,
      type: 'retrieval',
      label,
      x,
      y,
      width: 320,
      height: 360,
      status: 'idle',
      config: {
        ...defaultNodeConfig('retrieval', brandContext),
        query: payload?.title || brandContext.campaign_goal || '',
        asset_ids: assetIds,
        reference_urls: referenceUrls,
      },
      output: {},
      input_schema: ioSchema.retrieval.input,
      output_schema: ioSchema.retrieval.output,
    };
    setRfNodes((prev) => [...prev, wfToRF(wfNode)]);
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
    setDetailNodeId(id);
    setDetailMode('edit');
  }, [brandContext, getViewport, isNodeLocked, markDirty, markHistory, openWorkflowProGate, readOnly, setRfNodes]);

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

  const appendAssetToNode = useCallback((nodeId: string, payload: WorkflowAssetDragPayload) => {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || readOnly) return;
    const currentAssetIds = Array.isArray(node.config.asset_ids) ? node.config.asset_ids.filter((id): id is number => typeof id === 'number') : [];
    const currentReferenceUrls = Array.isArray(node.config.reference_urls) ? node.config.reference_urls.filter((url): url is string => typeof url === 'string') : [];
    const asset_ids = payload.asset_id && !currentAssetIds.includes(payload.asset_id)
      ? [...currentAssetIds, payload.asset_id]
      : currentAssetIds;
    const reference_urls = payload.source_url && !currentReferenceUrls.includes(payload.source_url)
      ? [...currentReferenceUrls, payload.source_url]
      : currentReferenceUrls;
    updateNode(nodeId, {
      config: {
        ...node.config,
        asset_ids,
        reference_urls,
        query: node.config.query || payload.title,
      },
    });
    triggerToast(`已把「${payload.title}」添加到 ${node.label}`, 'success');
  }, [nodes, readOnly, triggerToast, updateNode]);

  const selectNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    setSelectedNodeIds([id]);
    setRfNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === id })));
  }, [setRfNodes]);

  const openNodeDetail = useCallback((id: string, mode: 'edit' | 'ai' = 'edit') => {
    selectNode(id);
    setDetailNodeId(id);
    setDetailMode(mode);
  }, [selectNode]);

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
    if (detailNodeId === selectedNode.id) setDetailNodeId('');
  }, [selectedNode, readOnly, markHistory, markDirty, setRfNodes, setRfEdges, detailNodeId]);

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

  const parseAssetDrop = useCallback((event: DragEvent): WorkflowAssetDragPayload | null => {
    const raw = event.dataTransfer.getData(WORKFLOW_ASSET_DRAG_TYPE);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as WorkflowAssetDragPayload;
      if (!parsed.asset_id || !parsed.title) return null;
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const handleWorkflowDragOver = useCallback((event: DragEvent) => {
    if (event.dataTransfer.types.includes(WORKFLOW_ASSET_DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleWorkflowDrop = useCallback((event: DragEvent) => {
    const payload = parseAssetDrop(event);
    if (!payload || readOnly) return;
    event.preventDefault();
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-workflow-node-id]') : null;
    const targetNodeId = target?.getAttribute('data-workflow-node-id') || '';
    if (targetNodeId) {
      appendAssetToNode(targetNodeId, payload);
      return;
    }
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    createAssetGroupNode(payload, position);
    triggerToast(`已创建素材组：${payload.title}`, 'success');
  }, [appendAssetToNode, createAssetGroupNode, parseAssetDrop, readOnly, screenToFlowPosition, triggerToast]);

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
  const openNodeDetailRef = useRef(openNodeDetail);
  useEffect(() => { setConnectionSourceRef.current = setConnectionSource; }, [setConnectionSource]);
  useEffect(() => { setContextMenuRef.current = setContextMenu; }, [setContextMenu]);
  useEffect(() => { setSelectedNodeIdRef.current = setSelectedNodeId; }, [setSelectedNodeId]);
  useEffect(() => { openNodeDetailRef.current = openNodeDetail; }, [openNodeDetail]);

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
      onOpenDetails: (id: string, mode?: 'edit' | 'ai') => openNodeDetailRef.current(id, mode || 'edit'),
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
        style: { ...(edge.style || {}), stroke: 'var(--editorial-accent-blue)', strokeWidth: 3.2 },
      };
    }
    if (!isFlowing) return edge;
    return {
      ...edge,
      animated: true,
      style: { ...(edge.style || {}), stroke: 'var(--editorial-accent-blue)', strokeWidth: 2.8 },
    };
  }), [rfEdges, highlightedEdgeId, loadingState, nodes]);

  if (!project) return <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-8 shadow-editorial text-xs font-mono text-[var(--editorial-text-gray)]">请先在项目库选择当前项目。</div>;
  const primaryPresets = presets.filter((item) => ['retrieval', 'copy', 'image_prompt', 'image_generation'].includes(item.type));
  const secondaryPresets = presets.filter((item) => !primaryPresets.some((primary) => primary.type === item.type));

  return (
    <div className="font-mono min-w-0">
      <div className="workflow-module-layout min-w-0">
        <WorkflowAssetPanel
          organizationSlug={organizationSlug}
          open={workflowDockOpen}
          activeTab={workflowDockTab}
          globalAiInstruction={globalAiInstruction}
          globalAiLoading={aiEditLoading}
          onToggleOpen={() => setWorkflowDockOpen((value) => !value)}
          onTabChange={setWorkflowDockTab}
          onGlobalAiInstructionChange={setGlobalAiInstruction}
          onApplyGlobalAi={() => { void applyAiEdit('workflow', '', globalAiInstruction, false); }}
          onAddAssetGroup={() => createAssetGroupNode()}
        />
      <section className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial min-w-0 flex flex-col">
        <WorkflowBuilderToolbar
          projectName={projectDetail?.name || project.name}
          campaignName={campaign?.name || 'Default Campaign'}
          draftStatus={draft?.status || 'draft'}
          selectedCount={selectedNodeIds.length}
          readOnly={readOnly}
          saveStatus={saveStatus}
          loadingState={loadingState}
          propertyPanelOpen={propertyPanelOpen}
          historyLength={history.length}
          futureLength={future.length}
          primaryPresets={primaryPresets}
          secondaryPresets={secondaryPresets}
          canRunWorkflow={canRunWorkflow}
          canCreateCustomAgent={canCreateCustomAgent}
          isNodeLocked={isNodeLocked}
          onLockedFeature={openWorkflowProGate}
          onAddNode={addNode}
          onCreateCustomAgent={() => setShowCustomAgent(true)}
          onUndo={undo}
          onRedo={redo}
          onCopySelection={copySelection}
          onPasteSelection={pasteSelection}
          onFitView={() => fitView({ padding: 0.18, duration: 180 })}
          onSave={() => persistDraft(nodes, edges, false).catch((err) => triggerToast(buildErrorToast(err, '保存失败')))}
          onTidyLayout={tidyLayout}
          onRunWorkflow={runWorkflow}
          onCreateReadOnlyShare={createReadOnlyShare}
          onExitReadOnly={() => setReadOnly(false)}
          onTogglePropertyPanel={() => setPropertyPanelOpen((value) => !value)}
        />

        {/* Canvas + Sidebar */}
        <div className={`workflow-workbench grid grid-cols-1 grid-rows-[1fr] ${propertyPanelOpen ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''} min-w-0 flex-1`}>
          <div
            className="relative min-w-0 bg-[var(--editorial-bg)] h-full min-h-[400px]"
            onDragOver={handleWorkflowDragOver}
            onDrop={handleWorkflowDrop}
          >
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
            {connectionSource && <WorkflowConnectionHint />}
            {loadingState === 'loading' && <WorkflowLoadingOverlay />}
            {loadingState !== 'loading' && nodes.length === 0 && (
              <WorkflowEmptyState
                onAddCopy={() => addNode('copy', '写渠道文案')}
                onAddImagePrompt={() => addNode('image_prompt', '生成图片说明')}
              />
            )}
            <WorkflowBuilderCanvas
              nodes={rfNodesWithMeta}
              edges={renderedEdges}
              readOnly={readOnly}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              isValidConnection={isValidConnection}
              onSelectionChange={handleSelectionChange}
              onNodeClick={(nodeId) => { setContextMenu(null); if (connectionSource && connectionSource !== nodeId) connectToNode(nodeId); else openNodeDetail(nodeId, 'ai'); }}
              onPaneClick={() => { setContextMenu(null); setEdgeContextMenu(null); clearNodeSelection(); }}
              onEdgeContextMenu={(edgeId, x, y) => setEdgeContextMenu({ edgeId, x, y })}
              onNodeDragStart={() => { if (!readOnly) dragSnapshotRef.current = makeSnapshot('拖拽节点'); }}
              onNodeDragStop={() => { if (dragSnapshotRef.current) { pushSnapshot(dragSnapshotRef.current); dragSnapshotRef.current = null; } }}
            />
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
              currentWorkflowRun={currentWorkflowRun}
              onSelectNode={selectNode}
              onCopyNodeDiagnostics={copyNodeDiagnostics}
              onRecoverFromNode={(id) => { void recoverFromNode(id); }}
              onErrorAction={onErrorAction}
            />
          )}
        </div>
      </section>
      </div>

      <WorkflowBuilderContextMenus
        contextMenu={contextMenu}
        edgeContextMenu={edgeContextMenu}
        nodes={nodes}
        edges={edges}
        readOnly={readOnly}
        onStartConnect={(id) => { setConnectionSource(id); setContextMenu(null); }}
        onDuplicateNode={(id) => {
            const src = nodes.find((n) => n.id === id);
            if (!src) return;
            idCounterRef.current += 1;
            const newId = `${src.type}-copy-${idCounterRef.current}`;
            markHistory('复制节点');
            markDirty();
            const nn: WorkflowNode = { ...src, id: newId, label: `${src.label} (副本)`, x: src.x + 40, y: src.y + 40, config: { ...src.config }, output: {}, status: 'idle' };
            setRfNodes((prev) => [...prev, wfToRF(nn)]);
            setSelectedNodeId(newId);
            setDetailNodeId(newId);
        }}
        onConfigureNode={(id) => { openNodeDetail(id, 'edit'); }}
        onCopyNodeDiagnostics={copyNodeDiagnostics}
        onRecoverFromNode={(id) => { void recoverFromNode(id); }}
        onDeleteNode={(id) => {
            if (readOnly) return;
            markHistory('删除节点');
            setRfNodes((prev) => prev.filter((n) => n.id !== id));
            setRfEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
            if (selectedNodeId === id) { setSelectedNodeId(''); setSelectedNodeIds([]); }
            if (detailNodeId === id) setDetailNodeId('');
        }}
        onDeleteEdge={(edgeId) => {
          if (!readOnly) {
            markHistory('删除连线');
            markDirty();
            setRfEdges((prev) => prev.filter((e) => e.id !== edgeId));
          }
        }}
        onCloseContextMenu={() => setContextMenu(null)}
        onCloseEdgeContextMenu={() => setEdgeContextMenu(null)}
      />

      <WorkflowNodeDetailDialog
        key={`${detailNodeId}-${detailMode}`}
        node={detailNode}
        mode={detailMode}
        readOnly={readOnly}
        loadingState={loadingState}
        onClose={() => setDetailNodeId('')}
        onUpdateNode={updateNode}
        onCopyNodeDiagnostics={copyNodeDiagnostics}
        onApplyAiEdit={(id, instruction, runAfter) => { void applyAiEdit('node', id, instruction, runAfter); }}
        onRemoveNode={removeSelectedNode}
      />

      {showCustomAgent && (
        <CustomAgentDialog
          onSave={saveCustomAgent}
          onClose={() => setShowCustomAgent(false)}
        />
      )}
    </div>
  );
}
