import type { AppSection } from '../../shared/stores/uiStore';
import { taskTypeLabels } from '../generation/types';
import type { DashboardSnapshot } from './types';
import { formatUsd } from './types';
import type { GenerationTaskRecord } from '../../types/workspace';

interface DashboardPageProps {
  snapshot: DashboardSnapshot | null;
  latestTask: GenerationTaskRecord | null;
  setActiveTab: (tab: AppSection) => void;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  onRefresh: () => void;
}

export function DashboardPage({
  snapshot,
  latestTask,
  setActiveTab,
  triggerToast,
  onRefresh,
}: DashboardPageProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
      <div className="xl:col-span-4 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial paper-sheet-1">
        <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono mb-5">// WORKSPACE SCOPE</h3>
        <div className="space-y-4 font-mono">
          <div className="border-b border-dashed border-[var(--editorial-stroke)]/40 pb-3">
            <span className="block text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">Organization</span>
            <span className="text-sm font-bold">{snapshot?.scope.organization.name || 'Marketing Hub'}</span>
          </div>
          <div className="border-b border-dashed border-[var(--editorial-stroke)]/40 pb-3">
            <span className="block text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">Project</span>
            <span className="text-sm font-bold">{snapshot?.scope.project.name || 'Core Launch'}</span>
          </div>
          <div>
            <span className="block text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">Campaign</span>
            <span className="text-sm font-bold">{snapshot?.scope.campaign.name || 'Product Launch'}</span>
          </div>
        </div>
        <button
          onClick={() => {
            onRefresh();
            triggerToast('工作区与成本看板已刷新', 'info');
          }}
          className="w-full btn-editorial-secondary py-2.5 rounded-none font-bold text-[10px] uppercase tracking-wider mt-6"
        >
          刷新工作区状态
        </button>

        <div className="mt-6 pt-5 border-t border-dashed border-[var(--editorial-stroke)]/40">
          <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase mb-3">常用功能</h3>
          <div className="grid grid-cols-1 gap-2">
            {[
              { tab: 'content' as AppSection, label: '一键内容包', desc: 'brief → 全套初稿' },
              { tab: 'copy' as AppSection, label: '写文案', desc: '标题正文标签' },
              { tab: 'image' as AppSection, label: '做配图', desc: 'AI 生成图片' },
              { tab: 'config' as AppSection, label: 'AI 设置', desc: '配置 API Key' },
            ].map((item) => (
              <button
                key={item.tab}
                type="button"
                onClick={() => setActiveTab(item.tab)}
                className="text-left border border-[var(--editorial-stroke)] px-3 py-2 hover:bg-[var(--editorial-unselected)]"
              >
                <span className="block text-xs font-black">{item.label}</span>
                <span className="block text-[9px] text-[var(--editorial-text-gray)] mt-0.5">{item.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="xl:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-5">
        {[
          ['任务总量', snapshot?.metrics.task_count ?? 0],
          ['成功任务', snapshot?.metrics.successful_tasks ?? 0],
          ['社区作品', snapshot?.metrics.community_count ?? 0],
          ['资产记录', snapshot?.metrics.asset_count ?? 0],
          ['Token 审计', snapshot?.metrics.total_tokens ?? 0],
          ['账单估算 USD', formatUsd(snapshot?.metrics.total_cost_usd)],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
            <span className="block text-[9px] text-[var(--editorial-text-gray)] font-black uppercase tracking-wider font-mono">{label}</span>
            <span className="block mt-2 text-xl md:text-2xl font-black serif-header text-[var(--editorial-text)] truncate" title={String(value)}>{value}</span>
          </div>
        ))}

        <div className="md:col-span-2 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial paper-sheet-2">
          <div className="flex justify-between border-b border-[var(--editorial-stroke)] pb-3 mb-4">
            <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono">// TASK TYPE DISTRIBUTION</h3>
            <span className="text-[9px] font-mono text-[var(--editorial-text-gray)]">LIVE DB RECORDS</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
            {['copy', 'image', 'storyboard', 'audio'].map((taskType) => (
              <div key={taskType} className="min-w-0 border border-[var(--editorial-stroke)] p-3">
                <span className="block text-[9px] text-[var(--editorial-text-gray)] font-black truncate">{taskTypeLabels[taskType]}</span>
                <span className="block mt-1 font-black text-lg">{snapshot?.tasks_by_type[taskType] ?? 0}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-dashed border-[var(--editorial-stroke)]/40 pt-4">
            {latestTask && (
              <div className="mb-4 border border-[var(--editorial-stroke)] p-3 font-mono">
                <span className="block text-[9px] text-[var(--editorial-text-gray)] uppercase font-black">Latest Queued Task</span>
                <div className="mt-2 flex flex-wrap justify-between gap-3 text-[10px]">
                  <span>#{latestTask.id} / {taskTypeLabels[latestTask.task_type] || latestTask.task_type}</span>
                  <span>{latestTask.status}</span>
                  <span>{latestTask.celery_task_id ? 'CELERY LINKED' : 'LOCAL LEDGER'}</span>
                </div>
              </div>
            )}
            <h4 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono mb-3">// RECENT USAGE EVENTS</h4>
            {(snapshot?.recent_usage.length ?? 0) === 0 ? (
              <p className="text-xs text-[var(--editorial-text-gray)] font-mono">暂无成本审计事件。运行任意生成任务后会写入 UsageEvent。</p>
            ) : (
              <div className="space-y-2">
                {snapshot?.recent_usage.slice(0, 5).map((event, idx) => (
                  <div key={`${event.created_at}-${idx}`} className="flex justify-between gap-3 text-[10px] font-mono border-b border-dashed border-[var(--editorial-stroke)]/20 pb-2">
                    <span>{event.provider || 'mock'} / {event.model_name || 'default'}</span>
                    <span>{event.total_tokens} tokens / ${formatUsd(event.cost_usd)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}