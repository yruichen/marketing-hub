import type { ToastMessage } from '../hooks/useApi';

interface ToastProps {
  feedbackMsg: ToastMessage | null;
}

export default function Toast({ feedbackMsg }: ToastProps) {
  if (!feedbackMsg) return null;

  return (
    <div className={`fixed top-6 right-6 z-50 px-5 py-4 border-1.5 border-[var(--editorial-stroke)] shadow-editorial bg-[var(--editorial-paper)] animate-in slide-in-from-top duration-200 font-mono text-xs font-semibold toast-${feedbackMsg.type}`}>
      <span>{feedbackMsg.text}</span>
    </div>
  );
}
