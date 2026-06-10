import type { GenerationTaskRecord, WorkflowNode, WorkflowEdge } from '../../types/workspace';
import { statusLabels } from './constants';
import { nodeStatusDotClass } from './utils';

interface PropertyPanelProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string;
  loadingState: string;
  draftStatus?: string;
  runPreview: { stepCount: number; estimatedCost: string; estimatedMinutes: number };
  lastTasks: GenerationTaskRecord[];
  onSelectNode: (id: string) => void;
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

export function PropertyPanel({
  nodes,
  edges,
  selectedNodeId,
  loadingState,
  draftStatus,
  runPreview,
  lastTasks,
  onSelectNode,
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
    .map((n) => ({ id: n.id, label: n.label, message: n.error_message! }));

  const taskErrors = lastTasks
    .filter((t) => t.status === 'failed' && t.error_message)
    .map((t) => ({ id: `task-${t.id}`, label: `任务 #${t.id} (${t.task_type})`, message: t.error_message }));

  const allErrors = [...nodeErrors, ...taskErrors.filter((t) => !nodeErrors.some((n) => n.message === t.message))];

  return (
    <aside className="border-l border-[var(--editorial-stroke)] p-4 space-y-4 bg-[var(--editorial-paper)] min-w-0 max-h-[calc(100vh-260px)] min-h-[400px] overflow-y-auto">
      <div className="border border-[var(--editorial-stroke)] p-3">
        <h4 className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase mb-2">运行预览</h4>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">节点</span><b>{runPreview.stepCount}</b></div>
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">预计耗时</span><b>{runPreview.estimatedMinutes} 分钟</b></div>
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">预计成本</span><b>{runPreview.estimatedCost}</b></div>
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
              <span>{isRunning && progressPercent < 100 ? '…' : `${progressPercent}%`}</span>
            </div>
            <div className="h-1.5 bg-[var(--editorial-bg)] border border-[var(--editorial-stroke)]/40 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${failedCount > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                style={{ width: `${isRunning && progressPercent === 0 ? 8 : progressPercent}%` }}
              />
            </div>
            {draftStatus && draftStatus !== 'draft' && (
              <p className="mt-2 text-[9px] text-[var(--editorial-text-gray)]">
                工作流状态：<span className="font-black">{draftStatus}</span>
              </p>
            )}
          </div>
        )}

        {allErrors.length > 0 && (
          <div className="mb-3 space-y-2">
            <h5 className="text-[9px] font-black uppercase text-rose-600">生成报错</h5>
            {allErrors.map((item) => (
              <div key={item.id} className="border border-rose-300/60 bg-rose-50/50 dark:bg-rose-950/20 px-2.5 py-2 text-[10px] leading-relaxed">
                <p className="font-black text-rose-700">{item.label}</p>
                <p className="mt-1 text-rose-600/90 whitespace-pre-wrap break-words">{item.message}</p>
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
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onSelectNode(node.id)}
                  className={`w-full text-left border px-2.5 py-2 transition-colors ${
                    isSelected
                      ? 'border-[var(--editorial-accent-blue)] bg-[var(--editorial-unselected)]/50'
                      : 'border-[var(--editorial-stroke)]/40 hover:bg-[var(--editorial-unselected)]/30'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-[8px] text-[var(--editorial-text-gray)] w-4 shrink-0">{index + 1}</span>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${nodeStatusDotClass(status)} ${status === 'running' ? 'animate-pulse' : ''}`} />
                    <span className="font-black truncate flex-1">{node.label}</span>
                    <span className="text-[8px] text-[var(--editorial-text-gray)] shrink-0">{statusLabel}</span>
                  </div>
                  {status === 'failed' && node.error_message && (
                    <p className="mt-1.5 ml-6 text-[9px] text-rose-600 leading-snug line-clamp-2">{node.error_message}</p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
