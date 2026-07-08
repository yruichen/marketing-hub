import type { ErrorActionId } from '../shared/api/errorActions';
import type { ToastMessage } from '../shared/types/toast';

interface ToastProps {
  message: ToastMessage | null;
  onAction?: (actionId: ErrorActionId) => void;
  onDismiss?: () => void;
}

export default function Toast({ message, onAction, onDismiss }: ToastProps) {
  if (!message) return null;

  const primary = message.actions?.find((action) => action.primary) || message.actions?.[0];
  const secondary = message.actions?.filter((action) => action.id !== primary?.id).slice(0, 1) || [];

  return (
    <div
      className={`fixed top-6 right-6 z-[80] max-w-sm rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-4 py-3 shadow-[var(--shadow-panel)] animate-in slide-in-from-top duration-200 font-mono text-xs toast-${message.type}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold leading-5 text-[var(--editorial-text)]">{message.text}</p>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-[10px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)]"
            aria-label="关闭提示"
          >
            ✕
          </button>
        ) : null}
      </div>

      {primary || secondary.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {primary && onAction ? (
            <button
              type="button"
              onClick={() => onAction(primary.id)}
              className="rounded-lg border border-[var(--editorial-stroke)] bg-[var(--editorial-stroke)] px-3 py-1.5 text-[10px] font-black text-[var(--editorial-bg)] hover:opacity-90"
            >
              {primary.label}
            </button>
          ) : null}
          {secondary.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => onAction?.(action.id)}
              className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-1.5 text-[10px] font-black text-[var(--editorial-text)] hover:bg-[var(--surface-hover)]"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
