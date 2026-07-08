import { AlertTriangle, CheckCircle2, Clock3, Loader2, RotateCcw } from 'lucide-react';
import type { GenerationTaskRecord } from '../../types/workspace';
import type { ErrorActionId } from '../../shared/api/errorActions';
import { ErrorRecoveryActions } from '../../shared/ui/ErrorRecoveryActions';
import { explainGenerationError, taskProgressMessage } from './taskStatus';
import { taskTypeLabels } from './types';

interface TaskCenterProps {
  tasks: GenerationTaskRecord[];
  compact?: boolean;
  limit?: number;
  retryingTaskId?: number | null;
  onRetryTask?: (task: GenerationTaskRecord) => void | Promise<void>;
  onOpenTasks?: () => void;
  onErrorAction?: (actionId: ErrorActionId) => void;
  emptyAction?: () => void;
}

const statusLabels: Record<GenerationTaskRecord['status'], string> = {
  queued: '排队中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
};

function statusClass(status: GenerationTaskRecord['status']) {
  if (status === 'succeeded') return 'border-emerald-500/40 bg-emerald-50/80 text-emerald-900';
  if (status === 'failed') return 'border-rose-500/40 bg-rose-50/80 text-rose-900';
  if (status === 'running') return 'border-[color-mix(in_srgb,var(--info-accent)_45%,var(--border-default))] bg-[color-mix(in_srgb,var(--info-accent)_10%,var(--surface-panel))] text-[var(--editorial-text)]';
  return 'border-[color-mix(in_srgb,var(--warning-accent)_45%,var(--border-default))] bg-[color-mix(in_srgb,var(--warning-accent)_10%,var(--surface-panel))] text-[var(--editorial-text)]';
}

function StatusIcon({ status }: { status: GenerationTaskRecord['status'] }) {
  if (status === 'succeeded') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />;
  if (status === 'failed') return <AlertTriangle className="h-3.5 w-3.5 text-rose-700" />;
  if (status === 'running') return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--info-accent)]" />;
  return <Clock3 className="h-3.5 w-3.5 text-[var(--warning-accent)]" />;
}

function relativeTime(value?: string | null) {
  if (!value) return '刚刚';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '刚刚';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s 前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m 前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h 前`;
  return `${Math.floor(hours / 24)}d 前`;
}

function uniqueTasks(tasks: GenerationTaskRecord[]) {
  const seen = new Set<number>();
  return tasks.filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
}

export function TaskCenter({
  tasks,
  compact = false,
  limit = compact ? 4 : 8,
  retryingTaskId = null,
  onRetryTask,
  onOpenTasks,
  onErrorAction,
  emptyAction,
}: TaskCenterProps) {
  const visibleTasks = uniqueTasks(tasks).slice(0, limit);

  if (!visibleTasks.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]/55 px-3 py-4 text-center">
        <Clock3 className="mx-auto h-5 w-5 text-[var(--editorial-text-gray)]" />
        <p className="mt-2 text-xs font-black text-[var(--editorial-text)]">暂无可恢复任务</p>
        <p className="mt-1 text-[10px] leading-4 text-[var(--editorial-text-gray)]">生成内容后，排队、运行、失败和完成记录会在这里显示。</p>
        {emptyAction ? (
          <button type="button" onClick={emptyAction} className="mt-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-1.5 text-[10px] font-black hover:bg-[var(--surface-hover)]">
            创建第一个任务
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {visibleTasks.map((task) => {
        const progress = taskProgressMessage(task);
        const errorInfo = task.status === 'failed' ? explainGenerationError(task.error_message || '任务失败') : null;
        const canRetry = task.status === 'failed' && !!onRetryTask;
        const isRetrying = retryingTaskId === task.id;
        return (
          <article key={task.id} className={`rounded-2xl border px-3 py-3 font-mono shadow-[var(--shadow-panel)] ${statusClass(task.status)}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em]">
                  <StatusIcon status={task.status} />
                  <span>{statusLabels[task.status]}</span>
                  <span className="text-[var(--editorial-text-gray)]">#{task.id}</span>
                  <span className="text-[var(--editorial-text-gray)]">{relativeTime(task.completed_at || task.updated_at || task.created_at)}</span>
                </div>
                <h4 className="mt-1 truncate text-xs font-black text-[var(--editorial-text)]">
                  {taskTypeLabels[task.task_type] ?? task.task_type}
                </h4>
                <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[var(--editorial-text-muted)]">
                  {task.status === 'failed' ? errorInfo?.message : progress.message}
                </p>
                {!compact && (
                  <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[var(--editorial-text-gray)]">
                    {task.status === 'failed' ? errorInfo?.detail : progress.detail}
                  </p>
                )}
              </div>
              {canRetry ? (
                <button
                  type="button"
                  onClick={() => void onRetryTask?.(task)}
                  disabled={isRetrying}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] px-2 py-1 text-[9px] font-black text-[var(--editorial-text)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRetrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  重试
                </button>
              ) : null}
            </div>

            {!compact && errorInfo && (errorInfo.actions?.length || errorInfo.recoveryActions?.length) ? (
              errorInfo.actions?.length ? (
                <ErrorRecoveryActions
                  actions={errorInfo.actions}
                  onAction={onErrorAction}
                  compact
                  className="mt-2 border-t border-current/15 pt-2"
                />
              ) : (
                <div className="mt-2 border-t border-current/15 pt-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.14em]">建议处理</p>
                  <ul className="mt-1 space-y-1 text-[10px] leading-4 text-[var(--editorial-text-muted)]">
                    {errorInfo.recoveryActions?.map((action) => (
                      <li key={action}>- {action}</li>
                    ))}
                  </ul>
                </div>
              )
            ) : null}

            {!compact ? (
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-current/15 pt-2 text-[9px] text-[var(--editorial-text-gray)]">
                <span>Token：{task.token_count ?? 0}</span>
                <span>成本：${task.cost_usd ?? '0.0000'}</span>
              </div>
            ) : null}
          </article>
        );
      })}

      {onOpenTasks ? (
        <button type="button" onClick={onOpenTasks} className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-2 text-[10px] font-black hover:bg-[var(--surface-hover)]">
          查看完整任务记录
        </button>
      ) : null}
    </div>
  );
}
