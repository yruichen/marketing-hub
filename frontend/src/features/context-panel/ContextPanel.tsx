import { ChevronRight } from 'lucide-react';
import type { ContentPackage } from '../generation/types';
import type { WorkspaceScope } from '../dashboard/types';
import type { GenerationTaskRecord } from '../../types/workspace';
import type { DashboardSnapshot } from '../dashboard/types';
import type { AppSection } from '../../shared/stores/uiStore';

interface ContextPanelProps {
  workspaceScope: WorkspaceScope | null;
  latestTask: GenerationTaskRecord | null;
  dashboardSnapshot: DashboardSnapshot | null;
  contentPackage: ContentPackage;
  setActiveTab: (tab: AppSection) => void;
  onClose: () => void;
}

export function ContextPanel({
  workspaceScope,
  latestTask,
  dashboardSnapshot,
  contentPackage,
  setActiveTab,
  onClose,
}: ContextPanelProps) {
  return (
    <aside className="h-full min-h-0 overflow-y-auto bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial-sm p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-3">
        <h3 className="text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">上下文面板</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-[9px] font-black hover:text-rose-500"
          aria-label="隐藏上下文面板"
        >
          隐藏
        </button>
      </div>

      <section className="border border-[var(--editorial-stroke)] p-3">
        <div className="text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">当前项目</div>
        <h4 className="text-sm font-black">{workspaceScope?.project.name || '未选择项目'}</h4>
        <p className="text-[10px] text-[var(--editorial-text-gray)] leading-5 mt-2">
          {workspaceScope?.project.brief || '先创建或选择项目，再开始生成内容包。'}
        </p>
        <button
          type="button"
          onClick={() => setActiveTab('projects')}
          className="mt-3 w-full border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)] flex items-center justify-center gap-1.5"
        >
          管理项目 <ChevronRight className="h-3 w-3" />
        </button>
      </section>

      <section className="border border-[var(--editorial-stroke)] p-3">
        <div className="text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">任务队列</div>
        {latestTask ? (
          <div className="space-y-2 text-[10px]">
            <div className="flex justify-between"><span>生成任务 #{latestTask.id}</span><span>{latestTask.status}</span></div>
            <p className="text-[var(--editorial-text-gray)] leading-5">
              {latestTask.status === 'queued' && '正在排队处理，本次任务预计需要约 8 秒。'}
              {latestTask.status === 'running' && '正在根据品牌记忆生成内容。'}
              {latestTask.status === 'succeeded' && '任务已完成，可保存到资产库或加入审阅。'}
              {latestTask.status === 'failed' && (latestTask.error_message || '生成失败，可重试、换模型或减少输入长度。')}
            </p>
          </div>
        ) : (
          <p className="text-[10px] text-[var(--editorial-text-gray)] leading-5">暂无生成任务。生成内容包后会在这里显示排队、生成和失败原因。</p>
        )}
      </section>

      <section className="border border-[var(--editorial-stroke)] p-3">
        <div className="text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">用量摘要</div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">任务</span><b>{dashboardSnapshot?.metrics.task_count ?? 0}</b></div>
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">资产</span><b>{dashboardSnapshot?.metrics.asset_count ?? 0}</b></div>
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">成功</span><b>{dashboardSnapshot?.metrics.successful_tasks ?? 0}</b></div>
          <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">失败</span><b>{dashboardSnapshot?.metrics.failed_tasks ?? 0}</b></div>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('billing')}
          className="mt-3 w-full border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]"
        >
          查看计费详情
        </button>
      </section>

      <section className="border border-[var(--editorial-stroke)] p-3">
        <div className="text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">当前内容包</div>
        <p className="text-[10px] font-black leading-5">{contentPackage.title}</p>
        <p className="text-[10px] text-[var(--editorial-text-gray)] leading-5 mt-1">{contentPackage.platform} / {contentPackage.version}</p>
        <button
          type="button"
          onClick={() => setActiveTab('content')}
          className="mt-3 w-full border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]"
        >
          继续编辑
        </button>
      </section>
    </aside>
  );
}