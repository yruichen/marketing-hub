import { BarChart3, ChevronRight, ClipboardList, FolderKanban, PackageCheck, X } from 'lucide-react';
import { TaskCenter } from '../generation';
import type { ContentPackage } from '../generation/types';
import type { WorkspaceScope } from '../dashboard/types';
import type { GenerationTaskRecord } from '../../types/workspace';
import type { DashboardSnapshot } from '../dashboard/types';
import type { AppSection } from '../../shared/stores/uiStore';
import type { ErrorActionId } from '../../shared/api/errorActions';

interface ContextPanelProps {
  workspaceScope: WorkspaceScope | null;
  latestTask: GenerationTaskRecord | null;
  dashboardSnapshot: DashboardSnapshot | null;
  contentPackage: ContentPackage;
  setActiveTab: (tab: AppSection) => void;
  onClose: () => void;
  onRetryTask: (task: GenerationTaskRecord) => void | Promise<void>;
  onErrorAction?: (actionId: ErrorActionId) => void;
  retryingTaskId?: number | null;
}

export function ContextPanel({
  workspaceScope,
  latestTask,
  dashboardSnapshot,
  contentPackage,
  setActiveTab,
  onClose,
  onRetryTask,
  onErrorAction,
  retryingTaskId = null,
}: ContextPanelProps) {
  const taskList = [
    ...(latestTask ? [latestTask] : []),
    ...(dashboardSnapshot?.recent_tasks ?? []),
  ];

  return (
    <aside className="context-panel">
      <div className="context-panel__header">
        <div>
          <p className="context-panel__eyebrow">Context</p>
          <h3 className="context-panel__title">上下文面板</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="context-panel__icon-btn"
          aria-label="隐藏上下文面板"
          title="隐藏上下文面板"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <section className="context-panel__section">
        <div className="context-panel__section-head">
          <FolderKanban className="h-3.5 w-3.5" />
          <span>当前项目</span>
        </div>
        <h4 className="context-panel__name">{workspaceScope?.project.name || '未选择项目'}</h4>
        <p className="context-panel__body">
          {workspaceScope?.project.brief || '先创建或选择项目，再开始生成内容包。'}
        </p>
        <button
          type="button"
          onClick={() => setActiveTab('projects')}
          className="context-panel__action"
        >
          管理项目 <ChevronRight className="h-3 w-3" />
        </button>
      </section>

      <section className="context-panel__section">
        <div className="context-panel__section-head">
          <ClipboardList className="h-3.5 w-3.5" />
          <span>任务队列</span>
        </div>
        <TaskCenter
          tasks={taskList}
          compact
          retryingTaskId={retryingTaskId}
          onRetryTask={onRetryTask}
          onErrorAction={onErrorAction}
          onOpenTasks={() => setActiveTab('dashboard')}
          emptyAction={() => setActiveTab('content')}
        />
      </section>

      <section className="context-panel__section">
        <div className="context-panel__section-head">
          <BarChart3 className="h-3.5 w-3.5" />
          <span>用量摘要</span>
        </div>
        <div className="context-panel__metrics">
          <div><span>任务</span><b>{dashboardSnapshot?.metrics.task_count ?? 0}</b></div>
          <div><span>资产</span><b>{dashboardSnapshot?.metrics.asset_count ?? 0}</b></div>
          <div><span>成功</span><b>{dashboardSnapshot?.metrics.successful_tasks ?? 0}</b></div>
          <div><span>失败</span><b>{dashboardSnapshot?.metrics.failed_tasks ?? 0}</b></div>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('billing')}
          className="context-panel__action"
        >
          查看计费详情
        </button>
      </section>

      <section className="context-panel__section">
        <div className="context-panel__section-head">
          <PackageCheck className="h-3.5 w-3.5" />
          <span>当前内容包</span>
        </div>
        <p className="context-panel__package-title">{contentPackage.title}</p>
        <p className="context-panel__body">{contentPackage.platform} / {contentPackage.version}</p>
        <button
          type="button"
          onClick={() => setActiveTab('content')}
          className="context-panel__action"
        >
          继续编辑
        </button>
      </section>
    </aside>
  );
}
