import type { ErrorActionId } from '../../shared/api/errorActions';
import { ErrorRecoveryActions } from '../../shared/ui/ErrorRecoveryActions';
import type { GenerationTaskRecord, WorkflowNode, WorkflowEdge, WorkflowRunRecord } from '../../types/workspace';
import { statusLabels } from './constants';
import { nodeStatusDotClass } from './utils';
import { classifyWorkflowFailure, workflowFailureAppActions } from './workflowRecovery';
import { workflowRunProgressLabel } from './workflowRunState';

interface PropertyPanelProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string;
  loadingState: string;
  draftStatus?: string;
  runPreview: { stepCount: number; estimatedCost: string; estimatedMinutes: number };
  lastTasks: GenerationTaskRecord[];
  currentWorkflowRun?: WorkflowRunRecord | null;
  onSelectNode: (id: string) => void;
  onCopyNodeDiagnostics: (id: string) => void;
  onRecoverFromNode: (id: string) => void;
  onErrorAction?: (actionId: ErrorActionId) => void;
}

function executionOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const edge of edges) {
    adj.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }
  const queue = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0).map((n) => n.id);
  const order: WorkflowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeById.get(id);
    if (node) order.push(node);
    for (const next of adj.get(id) || []) {
      const nextDegree = (inDegree.get(next) || 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }
  for (const node of nodes) {
    if (!order.some((item) => item.id === node.id)) order.push(node);
  }
  return order;
}

function pipelineTone(status?: string, active = false) {
  if (active || status === 'running') return {
    border: 'border-blue-500',
    bg: 'bg-blue-50/80',
    text: 'text-blue-700',
    rail: 'bg-blue-500',
  };
  if (status === 'succeeded') return {
    border: 'border-emerald-400',
    bg: 'bg-emerald-50/70',
    text: 'text-emerald-700',
    rail: 'bg-emerald-500',
  };
  if (status === 'failed') return {
    border: 'border-rose-400',
    bg: 'bg-rose-50/70',
    text: 'text-rose-700',
    rail: 'bg-rose-500',
  };
  if (status === 'queued') return {
    border: 'border-amber-300',
    bg: 'bg-amber-50/60',
    text: 'text-amber-700',
    rail: 'bg-amber-400',
  };
  return {
    border: 'border-[var(--editorial-stroke)]/40',
    bg: 'bg-[var(--editorial-paper)]',
    text: 'text-[var(--editorial-text-gray)]',
    rail: 'bg-[var(--editorial-stroke)]/25',
  };
}

export function PropertyPanel({
  nodes,
  edges,
  selectedNodeId,
  loadingState,
  draftStatus,
  runPreview,
  lastTasks,
  currentWorkflowRun,
  onSelectNode,
  onCopyNodeDiagnostics,
  onRecoverFromNode,
  onErrorAction,
}: PropertyPanelProps) {
  const orderedNodes = executionOrder(nodes, edges);
  const succeededCount = nodes.filter((n) => n.status === 'succeeded').length;
  const failedCount = nodes.filter((n) => n.status === 'failed').length;
  const runningCount = nodes.filter((n) => n.status === 'running' || n.status === 'queued').length;
  const isRunning = loadingState === 'running' || loadingState === 'retrying' || draftStatus === 'running';
  const progressPercent = nodes.length > 0
    ? Math.round(((succeededCount + failedCount) / nodes.length) * 100)
    : 0;

  const nodeErrors = nodes
    .filter((n) => n.status === 'failed' && n.error_message)
    .map((n) => ({ id: n.id, nodeId: n.id, label: n.label, message: n.error_message! }));

  const taskErrors = lastTasks
    .filter((t) => t.status === 'failed' && t.error_message)
    .map((t) => ({ id: `task-${t.id}`, nodeId: '', label: `任务 #${t.id} (${t.task_type})`, message: t.error_message }));

  const allErrors = [...nodeErrors, ...taskErrors.filter((t) => !nodeErrors.some((n) => n.message === t.message))];
  const runningNode = orderedNodes.find((n) => n.status === 'running' || n.status === 'queued') || null;
  const runAssetIds = Array.isArray(currentWorkflowRun?.summary?.asset_ids)
    ? currentWorkflowRun.summary.asset_ids.filter((id): id is number => typeof id === 'number')
    : [];
  const isolatedNodes = nodes.filter((node) => !edges.some((edge) => edge.source === node.id || edge.target === node.id));
  const missingConfigNodes = nodes.filter((node) => {
    if (node.type === 'copy') return !node.config?.tone || !node.config?.platform;
    if (node.type === 'image_prompt') return !node.config?.style_skill && !node.config?.prompt;
    if (node.type === 'custom_agent') return !node.config?.prompt;
    return false;
  });
  const summaryText =
    nodes.length === 0
      ? '暂无节点'
      : failedCount > 0
      ? `${succeededCount} 成功 · ${failedCount} 失败`
      : succeededCount === nodes.length && nodes.length > 0
      ? `全部 ${nodes.length} 个节点成功`
      : `${nodes.length} 个节点待运行`;

  return (
    <aside className="border-l border-[var(--editorial-stroke)] p-4 space-y-4 bg-[var(--editorial-paper)] min-w-0 min-h-[400px]">
      <div className="border border-[var(--editorial-stroke)] p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">运行</h4>
          <span className="text-[9px] font-black text-[var(--editorial-text)]">{summaryText}</span>
        </div>
        {currentWorkflowRun ? (
          <div className="mb-3 border border-[var(--editorial-stroke)]/50 bg-[var(--editorial-bg)]/35 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="font-black text-[var(--editorial-text)]">Run #{currentWorkflowRun.id}</span>
              <span className="font-black uppercase text-[var(--editorial-text-gray)]">{currentWorkflowRun.status}</span>
            </div>
            <p className="mt-1 text-[9px] font-semibold text-[var(--editorial-text-gray)]">
              {workflowRunProgressLabel(currentWorkflowRun)}
              {currentWorkflowRun.actual_cost_usd ? ` · $${currentWorkflowRun.actual_cost_usd}` : ''}
            </p>
            {runAssetIds.length > 0 ? (
              <div className="mt-2 border border-emerald-300/60 bg-emerald-50/60 px-2 py-1.5 text-[9px] text-emerald-700">
                <b>{runAssetIds.length}</b> 个产物已进入资产库
                <span className="mt-1 block truncate font-mono">Asset {runAssetIds.slice(0, 6).map((id) => `#${id}`).join(' / ')}</span>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">节点</span><b>{runPreview.stepCount}</b></div>
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">预计耗时</span><b>{runPreview.estimatedMinutes} 分钟</b></div>
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">预计成本</span><b>{runPreview.estimatedCost}</b></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(statusLabels).map(([key, label]) => (
            <span key={key} className="flex items-center gap-1 text-[9px] text-[var(--editorial-text-gray)]">
              <span className={`h-1.5 w-1.5 rounded-full ${nodeStatusDotClass(key)}`} />{label}
            </span>
          ))}
        </div>
      </div>

      <div className="border border-[var(--editorial-stroke)] p-3">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">生成进度</h4>
          {isRunning && (
            <span className="flex items-center gap-1.5 text-[9px] font-bold text-blue-600">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              {loadingState === 'retrying' ? '重试中…' : '执行中…'}
            </span>
          )}
        </div>

        {nodes.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-[9px] text-[var(--editorial-text-gray)] mb-1.5">
              <span>{succeededCount} 成功 · {failedCount} 失败 · {runningCount} 进行中</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="h-2 bg-[var(--editorial-bg)] border border-[var(--editorial-stroke)]/40 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${failedCount > 0 ? 'bg-rose-500' : isRunning ? 'bg-blue-500 workflow-flow-bar' : 'bg-emerald-500'}`}
                style={{
                  width: `${isRunning && progressPercent === 0 ? 10 : progressPercent}%`,
                  backgroundImage: isRunning ? 'linear-gradient(90deg, rgba(255,255,255,.22) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.22) 50%, rgba(255,255,255,.22) 75%, transparent 75%, transparent)' : undefined,
                  backgroundSize: isRunning ? '18px 18px' : undefined,
                }}
              />
            </div>
            {draftStatus && draftStatus !== 'draft' && (
              <p className="mt-2 text-[9px] text-[var(--editorial-text-gray)]">
                工作流状态：<span className="font-black">{draftStatus}</span>
              </p>
            )}
            {runningNode && (
              <button
                type="button"
                onClick={() => onSelectNode(runningNode.id)}
                className="mt-2 w-full border border-blue-300 bg-blue-50/70 px-2.5 py-2 text-left text-[10px] text-blue-700 hover:bg-blue-50"
              >
                正在生成：<span className="font-black">{runningNode.label}</span>
              </button>
            )}
          </div>
        )}

        {allErrors.length > 0 && (
          <div className="mb-3 space-y-2">
            <h5 className="text-[9px] font-black uppercase text-rose-600">生成报错</h5>
            {allErrors.map((item) => (
              <div key={item.id} className="border border-rose-300/60 bg-rose-50/50 dark:bg-rose-950/20 px-2.5 py-2 text-[10px] leading-relaxed">
                {(() => {
                  const recovery = classifyWorkflowFailure(item.message);
                  const appActions = workflowFailureAppActions(recovery.kind);
                  const primaryAppAction = appActions.find((action) => action.primary) || appActions[0];
                  const handlePrimaryAction = () => {
                    if (primaryAppAction && onErrorAction) {
                      onErrorAction(primaryAppAction.id);
                      return;
                    }
                    if (item.nodeId) onSelectNode(item.nodeId);
                  };
                  return (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-black text-rose-700">{item.label}</p>
                          <p className="mt-0.5 font-black text-[var(--editorial-text)]">{recovery.title}</p>
                        </div>
                        <span className="shrink-0 border border-rose-300 px-1.5 py-0.5 text-[8px] font-black uppercase text-rose-700">{recovery.kind}</span>
                      </div>
                      <p className="mt-1 text-rose-700/90">{recovery.explanation}</p>
                      <p className="mt-1 text-rose-600/80 whitespace-pre-wrap break-words line-clamp-3">{item.message}</p>
                      {appActions.length > 0 && (
                        <ErrorRecoveryActions
                          actions={appActions}
                          onAction={onErrorAction}
                          compact
                          className="mt-2"
                        />
                      )}
                      <div className="mt-2 grid grid-cols-1 gap-1.5">
                        <button
                          type="button"
                          className="border border-rose-300 bg-white/50 px-2 py-1 text-left text-[9px] font-black text-rose-700 hover:bg-white disabled:opacity-40"
                          disabled={!primaryAppAction && !item.nodeId}
                          onClick={handlePrimaryAction}
                        >
                          {recovery.primaryAction}
                        </button>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            className="border border-[var(--editorial-stroke)] bg-white/50 px-2 py-1 text-[9px] font-black hover:bg-white disabled:opacity-40"
                            disabled={!item.nodeId}
                            onClick={() => item.nodeId && onCopyNodeDiagnostics(item.nodeId)}
                          >
                            复制输入/上游输出
                          </button>
                          <button
                            type="button"
                            className="border border-[var(--editorial-stroke)] bg-white/50 px-2 py-1 text-[9px] font-black hover:bg-white disabled:opacity-40"
                            disabled={!item.nodeId || isRunning}
                            onClick={() => item.nodeId && onRecoverFromNode(item.nodeId)}
                          >
                            {recovery.secondaryAction}
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
          {orderedNodes.length === 0 ? (
            <p className="text-[10px] text-[var(--editorial-text-gray)]">暂无节点。添加节点后运行工作流，进度将显示在此处。</p>
          ) : (
            orderedNodes.map((node, index) => {
              const status = node.status || 'idle';
              const statusLabel = statusLabels[status] || status;
              const isSelected = node.id === selectedNodeId;
              const isActive = node.id === runningNode?.id;
              const tone = pipelineTone(status, isActive);
              return (
                <button key={node.id} type="button" onClick={() => onSelectNode(node.id)} className="w-full text-left group">
                  <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-2">
                    <div className="relative flex justify-center">
                      {index < orderedNodes.length - 1 && (
                        <span className={`absolute top-5 bottom-[-12px] w-0.5 ${status === 'succeeded' ? 'bg-emerald-500' : 'bg-[var(--editorial-stroke)]/20'}`} />
                      )}
                      <span className={`relative z-10 mt-2 h-4 w-4 rounded-full border border-[var(--editorial-paper)] ${tone.rail} ${isActive ? 'animate-pulse ring-2 ring-blue-200' : ''}`} />
                    </div>
                    <div className={`border px-2.5 py-2 transition-colors ${tone.border} ${tone.bg} ${isSelected ? 'ring-2 ring-[var(--editorial-accent-blue)]' : 'group-hover:bg-[var(--editorial-unselected)]/30'}`}>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-[8px] text-[var(--editorial-text-gray)] w-4 shrink-0">{index + 1}</span>
                        <span className={`h-2 w-2 rounded-full shrink-0 ${nodeStatusDotClass(status)} ${status === 'running' ? 'animate-pulse' : ''}`} />
                        <span className="font-black truncate flex-1">{node.label}</span>
                        <span className={`text-[8px] shrink-0 ${tone.text}`}>{isActive ? '正在处理' : statusLabel}</span>
                      </div>
                      {status === 'queued' && isRunning && (
                        <p className="mt-1.5 ml-6 text-[9px] text-amber-700 leading-snug">等待上游节点完成</p>
                      )}
                      {status === 'succeeded' && (
                        <p className="mt-1.5 ml-6 text-[9px] text-emerald-700 leading-snug">已产出结果</p>
                      )}
                      {status === 'failed' && node.error_message && (
                        <p className="mt-1.5 ml-6 text-[9px] text-rose-600 leading-snug line-clamp-2">{node.error_message}</p>
                      )}
                      {isActive && (
                        <div className="mt-2 ml-6 h-1 overflow-hidden bg-blue-100 border border-blue-200">
                          <div className="h-full w-2/3 bg-blue-500 workflow-flow-sweep" />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="border border-[var(--editorial-stroke)] p-3">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">检查</h4>
        </div>
        <div className="space-y-2 text-[10px]">
          <div className="flex items-center justify-between border border-[var(--editorial-stroke)]/40 px-2.5 py-2">
            <span className="text-[var(--editorial-text-gray)]">连线</span>
            <b>{edges.length}</b>
          </div>
          {isolatedNodes.length > 0 && (
            <div className="border border-amber-300/70 bg-amber-50/60 px-2.5 py-2 text-amber-800">
              {isolatedNodes.length} 个节点未连接
            </div>
          )}
          {missingConfigNodes.length > 0 && (
            <div className="border border-amber-300/70 bg-amber-50/60 px-2.5 py-2 text-amber-800">
              {missingConfigNodes.length} 个节点配置不完整
            </div>
          )}
          {isolatedNodes.length === 0 && missingConfigNodes.length === 0 && nodes.length > 0 && (
            <div className="border border-emerald-300/70 bg-emerald-50/60 px-2.5 py-2 text-emerald-700">
              基础检查通过
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
