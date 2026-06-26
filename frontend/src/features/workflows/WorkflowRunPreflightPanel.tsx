import { AlertTriangle, CheckCircle2, Info, Play, ShieldAlert, X } from 'lucide-react';
import { BrandMemorySummary } from '../brand-memory';
import type { BrandContext } from '../../types/workspace';
import type { WorkflowReadinessAction, WorkflowReadinessIssue, WorkflowReadinessResult } from './workflowReadiness';

interface WorkflowRunPreflightPanelProps {
  open: boolean;
  projectName: string;
  brandContext: BrandContext;
  readiness: WorkflowReadinessResult;
  estimatedCost: string;
  estimatedMinutes: number;
  onClose: () => void;
  onConfirmRun: () => void;
  onIssueAction: (issue: WorkflowReadinessIssue) => void;
}

const toneBySeverity = {
  blocker: {
    icon: ShieldAlert,
    label: '必须修复',
    className: 'border-rose-300 bg-rose-50/80 text-rose-800',
  },
  warning: {
    icon: AlertTriangle,
    label: '建议修复',
    className: 'border-amber-300 bg-amber-50/80 text-amber-900',
  },
  info: {
    icon: Info,
    label: '运行信息',
    className: 'border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] text-[var(--editorial-text-gray)]',
  },
};

function canHandleAction(action?: WorkflowReadinessAction) {
  return !!action;
}

function IssueRow({
  issue,
  onIssueAction,
}: {
  issue: WorkflowReadinessIssue;
  onIssueAction: (issue: WorkflowReadinessIssue) => void;
}) {
  const tone = toneBySeverity[issue.severity];
  const Icon = tone.icon;
  return (
    <div className={`border px-3 py-2.5 ${tone.className}`}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[8px] font-black uppercase tracking-wider">{tone.label}</span>
            <h4 className="text-[11px] font-black text-[var(--editorial-text)]">{issue.title}</h4>
          </div>
          <p className="mt-1 text-[10px] font-semibold leading-4">{issue.detail}</p>
        </div>
        {canHandleAction(issue.action) ? (
          <button
            type="button"
            onClick={() => onIssueAction(issue)}
            className="shrink-0 border border-current px-2 py-1 text-[9px] font-black hover:bg-white/50"
          >
            {issue.actionLabel || '修复'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function WorkflowRunPreflightPanel({
  open,
  projectName,
  brandContext,
  readiness,
  estimatedCost,
  estimatedMinutes,
  onClose,
  onConfirmRun,
  onIssueAction,
}: WorkflowRunPreflightPanelProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[6500] flex items-center justify-center bg-black/35 p-4">
      <section className="flex max-h-[min(720px,calc(100vh-32px))] w-[min(760px,calc(100vw-24px))] flex-col overflow-hidden border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] shadow-editorial">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--editorial-stroke)] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)]">Preflight Check</p>
            <h3 className="mt-1 text-base font-black text-[var(--editorial-text)]">
              {readiness.canRun ? '可以运行工作流' : '运行前需要修复'}
            </h3>
            <p className="mt-1 text-[10px] font-semibold leading-4 text-[var(--editorial-text-gray)]">
              {readiness.canRun
                ? '已通过阻断项检查。建议确认提醒项后再运行。'
                : `${readiness.blockers.length} 个阻断项会导致工作流失败或结果不可控。`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border border-[var(--editorial-stroke)] p-1.5 hover:bg-[var(--editorial-unselected)]"
            title="关闭"
            aria-label="关闭运行前检查"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="space-y-2">
              {readiness.orderedIssues.map((issue) => (
                <IssueRow key={issue.id} issue={issue} onIssueAction={onIssueAction} />
              ))}
              {readiness.orderedIssues.length === 0 ? (
                <div className="border border-emerald-300 bg-emerald-50/80 px-3 py-3 text-emerald-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-[11px] font-black">检查通过</span>
                  </div>
                </div>
              ) : null}
            </div>

            <aside className="space-y-3">
              <BrandMemorySummary projectName={projectName} context={brandContext} compact />
              <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/35 p-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)]">Run Estimate</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                  <div className="border border-[var(--editorial-stroke)]/40 bg-[var(--editorial-paper)] px-2 py-2">
                    <span className="block text-[var(--editorial-text-gray)]">预计耗时</span>
                    <b>{estimatedMinutes} 分钟</b>
                  </div>
                  <div className="border border-[var(--editorial-stroke)]/40 bg-[var(--editorial-paper)] px-2 py-2">
                    <span className="block text-[var(--editorial-text-gray)]">预计成本</span>
                    <b>{estimatedCost}</b>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--editorial-stroke)] px-4 py-3">
          <span className="text-[9px] font-bold text-[var(--editorial-text-gray)]">
            {readiness.blockers.length > 0 ? '修复所有阻断项后才能运行。' : '运行后可在任务中心继续查看进度。'}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">
              继续编辑
            </button>
            <button
              type="button"
              onClick={onConfirmRun}
              disabled={!readiness.canRun}
              className="btn-editorial-primary inline-flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Play className="h-3.5 w-3.5" />
              确认运行
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
