import { CheckCircle2, LayoutDashboard, Loader2, Lock, Play, Save, XCircle } from 'lucide-react';
import type { WorkflowNode, WorkflowRunRecord } from '../../types/workspace';
import type { SaveStatus, WorkflowLoadingState } from './WorkflowBuilderToolbar';
import { workflowRunProgressLabel } from './workflowRunState';

interface WorkflowFloatingRunBarProps {
  nodes: WorkflowNode[];
  readOnly: boolean;
  saveStatus: SaveStatus;
  loadingState: WorkflowLoadingState;
  canRunWorkflow: boolean;
  currentWorkflowRun?: WorkflowRunRecord | null;
  onRunWorkflow: () => void;
  onLockedFeature: () => void;
  onSave: () => void;
  onTidyLayout: () => void;
}

function saveLabel(status: SaveStatus) {
  if (status === 'saving') return '保存中';
  if (status === 'dirty') return '未保存';
  if (status === 'failed') return '保存失败';
  return '已保存';
}

export function WorkflowFloatingRunBar({
  nodes,
  readOnly,
  saveStatus,
  loadingState,
  canRunWorkflow,
  currentWorkflowRun,
  onRunWorkflow,
  onLockedFeature,
  onSave,
  onTidyLayout,
}: WorkflowFloatingRunBarProps) {
  const total = nodes.length;
  const succeeded = nodes.filter((node) => node.status === 'succeeded').length;
  const failed = nodes.filter((node) => node.status === 'failed').length;
  const active = nodes.filter((node) => node.status === 'running' || node.status === 'queued').length;
  const completed = succeeded + failed;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isRunning = loadingState === 'running' || loadingState === 'retrying' || currentWorkflowRun?.status === 'running' || currentWorkflowRun?.status === 'queued';
  const assetCount = Array.isArray(currentWorkflowRun?.summary?.asset_ids)
    ? currentWorkflowRun.summary.asset_ids.length
    : 0;

  return (
    <div className="workflow-floating-run-bar absolute bottom-4 left-1/2 z-30 w-[min(920px,calc(100%-32px))] -translate-x-1/2 rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface-panel)]/95 p-3 shadow-[var(--shadow-soft)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-[var(--editorial-text)]">
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--editorial-accent-blue)]" /> : <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success-accent)]" />}
              {isRunning ? '工作流执行中' : currentWorkflowRun ? `Run #${currentWorkflowRun.id}` : '准备运行'}
            </span>
            <span className="text-[9px] font-semibold text-[var(--editorial-text-gray)]">
              {currentWorkflowRun ? workflowRunProgressLabel(currentWorkflowRun) : `${total} 个节点`}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)]">
            <div
              className={`h-full transition-all duration-500 ${failed > 0 ? 'bg-rose-500' : isRunning ? 'workflow-flow-bar bg-[var(--editorial-accent-blue)]' : 'bg-[var(--success-accent)]'}`}
              style={{ width: `${isRunning && progress === 0 ? 12 : progress}%` }}
            />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3 text-[9px] font-semibold text-[var(--editorial-text-gray)]">
            <span>{succeeded} 成功</span>
            <span>{active} 进行中</span>
            <span className={failed > 0 ? 'text-rose-600' : ''}>{failed} 失败</span>
            <span>{assetCount} 资产</span>
            <span>{saveLabel(saveStatus)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {failed > 0 ? (
            <span className="hidden items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-700 sm:inline-flex">
              <XCircle className="h-3 w-3" /> 需要处理
            </span>
          ) : null}
          <button
            type="button"
            onClick={onSave}
            disabled={readOnly || saveStatus === 'saving'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-[var(--border-default)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
            title="保存"
          >
            <Save className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onTidyLayout}
            disabled={readOnly || total === 0}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] border border-[var(--border-default)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
            title="整理布局"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={canRunWorkflow ? onRunWorkflow : onLockedFeature}
            disabled={loadingState !== 'idle' || readOnly || total === 0}
            className="inline-flex h-9 items-center gap-2 rounded-[7px] border border-[var(--border-strong)] bg-[var(--editorial-stroke)] px-4 text-[10px] font-black text-[var(--editorial-bg)] disabled:opacity-45"
          >
            {canRunWorkflow ? <Play className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {canRunWorkflow ? (isRunning ? '执行中' : '运行') : 'Pro 运行'}
          </button>
        </div>
      </div>
    </div>
  );
}
