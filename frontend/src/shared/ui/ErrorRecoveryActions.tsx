import type { ErrorAction, ErrorActionId } from '../api/errorActions';

interface ErrorRecoveryActionsProps {
  actions: ErrorAction[];
  onAction?: (actionId: ErrorActionId) => void;
  compact?: boolean;
  className?: string;
}

export function ErrorRecoveryActions({
  actions,
  onAction,
  compact = false,
  className = '',
}: ErrorRecoveryActionsProps) {
  if (!actions.length) return null;

  if (!onAction) {
    return (
      <div className={className}>
        <p className="text-[9px] font-black uppercase tracking-[0.14em]">建议处理</p>
        <ul className={`mt-1 space-y-1 leading-4 text-[var(--editorial-text-muted)] ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          {actions.map((action) => (
            <li key={action.id}>- {action.label}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={className}>
      <p className="text-[9px] font-black uppercase tracking-[0.14em]">你可以</p>
      <div className={`mt-2 flex flex-wrap gap-2 ${compact ? '' : ''}`}>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => onAction(action.id)}
            className={
              action.primary
                ? 'rounded-lg border border-[var(--editorial-stroke)] bg-[var(--editorial-stroke)] px-2.5 py-1 text-[9px] font-black text-[var(--editorial-bg)] hover:opacity-90'
                : 'rounded-lg border border-[var(--border-default)] bg-[var(--surface-panel)] px-2.5 py-1 text-[9px] font-black text-[var(--editorial-text)] hover:bg-[var(--surface-hover)]'
            }
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
