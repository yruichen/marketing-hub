import type { ErrorActionId } from '../../shared/api/errorActions';
import { ErrorRecoveryActions } from '../../shared/ui/ErrorRecoveryActions';
import type { GenerationTaskUiState } from './taskStatus';
import { expectedTaskDuration } from './taskStatus';

interface TaskStatusCardProps {
  state: GenerationTaskUiState;
  onRetry?: () => void;
  retryDisabled?: boolean;
  onErrorAction?: (actionId: ErrorActionId) => void;
}

const phaseLabels: Record<GenerationTaskUiState['phase'], string> = {
  idle: '待开始',
  submitting: '提交中',
  queued: '排队中',
  running: '运行中',
  succeeded: '已完成',
  failed: '失败',
  timeout: '超时',
};

function toneClass(phase: GenerationTaskUiState['phase']) {
  if (phase === 'succeeded') return 'border-emerald-500/50 bg-emerald-50/80 text-emerald-900';
  if (phase === 'failed' || phase === 'timeout') return 'border-rose-500/50 bg-rose-50/80 text-rose-900';
  if (phase === 'queued' || phase === 'running' || phase === 'submitting') return 'border-[color-mix(in_srgb,var(--info-accent)_45%,var(--border-default))] bg-[color-mix(in_srgb,var(--info-accent)_10%,var(--surface-panel))] text-[var(--editorial-text)]';
  return 'border-[var(--border-subtle)] bg-[var(--surface-panel)] text-[var(--editorial-text)]';
}

export function TaskStatusCard({ state, onRetry, retryDisabled = false, onErrorAction }: TaskStatusCardProps) {
  if (state.phase === 'idle' && !state.task) return null;

  const task = state.task;
  const isActive = state.phase === 'submitting' || state.phase === 'queued' || state.phase === 'running';
  const canRetry = !!onRetry && (state.phase === 'failed' || state.phase === 'timeout');

  return (
    <section className={`rounded-2xl border px-3 py-3 font-mono text-[10px] shadow-[var(--shadow-panel)] ${toneClass(state.phase)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isActive ? <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--info-accent)]" /> : null}
            <span className="font-black uppercase tracking-[0.14em]">{phaseLabels[state.phase]}</span>
            {task ? <span className="text-[var(--editorial-text-gray)]">#{task.id}</span> : null}
          </div>
          <h4 className="mt-1 text-xs font-black text-[var(--editorial-text)]">{state.title}</h4>
          <p className="mt-1 leading-5 text-[var(--editorial-text-muted)]">{state.message}</p>
          {state.detail ? <p className="mt-1 leading-5 text-[var(--editorial-text-gray)]">{state.detail}</p> : null}
        </div>
        {canRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
            className="shrink-0 rounded-lg border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] px-2 py-1 text-[9px] font-black text-[var(--editorial-text)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            重试
          </button>
        ) : null}
      </div>

      {task && (
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-current/15 pt-2 text-[9px] text-[var(--editorial-text-gray)]">
          <span>预计耗时：{expectedTaskDuration(task.task_type)}</span>
          <span>状态：{task.status}</span>
          {typeof task.token_count === 'number' ? <span>Token：{task.token_count}</span> : null}
          {task.cost_usd ? <span>成本：${task.cost_usd}</span> : null}
        </div>
      )}

      {state.actions?.length ? (
        <ErrorRecoveryActions
          actions={state.actions}
          onAction={onErrorAction}
          className="mt-2 border-t border-current/15 pt-2"
        />
      ) : state.recoveryActions?.length ? (
        <div className="mt-2 border-t border-current/15 pt-2">
          <div className="font-black uppercase tracking-[0.14em] text-[9px]">建议处理</div>
          <ul className="mt-1 space-y-1 leading-5 text-[var(--editorial-text-muted)]">
            {state.recoveryActions.map((action) => (
              <li key={action}>- {action}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
