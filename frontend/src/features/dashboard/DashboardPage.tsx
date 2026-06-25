import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  DollarSign,
  FolderKanban,
  Image,
  LayoutDashboard,
  Mic,
  RefreshCw,
  Sparkles,
  Video,
  Workflow,
  Zap,
} from 'lucide-react';
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

const numberFormatter = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const plainNumberFormatter = new Intl.NumberFormat('zh-CN');

const statusLabels: Record<string, string> = {
  queued: '排队中',
  running: '运行中',
  succeeded: '已成功',
  failed: '失败',
};

const assetLabels: Record<string, string> = {
  image: '图片',
  audio: '音频',
  video: '视频',
  document: '文档',
};

const assetIcons: Record<string, typeof Database> = {
  image: Image,
  audio: Mic,
  video: Video,
  document: Database,
};

const taskTypeOrder = ['copy', 'image', 'image_prompt', 'storyboard', 'audio', 'video', 'review', 'rag_search', 'custom_agent', 'brainstorm'];
const statusOrder = ['succeeded', 'running', 'queued', 'failed'];
const assetOrder = ['image', 'video', 'audio', 'document'];

const formatNumber = (value?: number | null) => numberFormatter.format(value ?? 0);
const formatFullNumber = (value?: number | null) => plainNumberFormatter.format(value ?? 0);

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function statusClass(status: string) {
  if (status === 'succeeded') return 'bg-emerald-100 text-emerald-800 border-emerald-900/30';
  if (status === 'running') return 'bg-blue-100 text-blue-800 border-blue-900/30';
  if (status === 'queued') return 'bg-yellow-100 text-yellow-800 border-yellow-900/30';
  return 'bg-red-100 text-red-800 border-red-900/30';
}

function EmptyPanel({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="border border-dashed border-[var(--editorial-stroke)]/45 bg-[var(--editorial-unselected)]/35 p-4">
      <p className="text-sm font-black text-[var(--editorial-text)]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--editorial-text-gray)]">{description}</p>
      <button type="button" onClick={onAction} className="mt-3 inline-flex h-8 items-center gap-2 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 text-xs font-black hover:bg-[var(--editorial-accent-yellow)]">
        {action}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Sparkline({ trend }: { trend: NonNullable<DashboardSnapshot['usage_trend']> }) {
  const values = trend.map((item) => item.total_tokens);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const spread = Math.max(maxValue - minValue, 1);
  const points = values
    .map((value, index) => {
      const x = trend.length === 1 ? 0 : (index / (trend.length - 1)) * 100;
      const y = 36 - ((value - minValue) / spread) * 28;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="h-28">
      <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="h-full w-full overflow-visible text-[var(--editorial-stroke)]">
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <polygon points={`0,42 ${points} 100,42`} className="fill-blue-500/10" />
      </svg>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  tone: string;
}) {
  return (
    <div className="min-w-0 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-editorial-sm">
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center border border-[var(--editorial-stroke)] ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-right text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">{label}</span>
      </div>
      <div className="mt-4 min-w-0">
        <p className="truncate text-2xl font-black text-[var(--editorial-text)] serif-header" title={String(value)}>{value}</p>
        <p className="mt-1 truncate text-xs text-[var(--editorial-text-gray)]" title={detail}>{detail}</p>
      </div>
    </div>
  );
}

export function DashboardPage({
  snapshot,
  latestTask,
  setActiveTab,
  triggerToast,
  onRefresh,
}: DashboardPageProps) {
  const metrics = snapshot?.metrics;
  const taskTotal = metrics?.task_count ?? 0;
  const activeTasks = metrics?.active_task_count ?? ((metrics?.queued_tasks ?? 0) + (metrics?.running_tasks ?? 0));
  const successRate = metrics?.success_rate ?? percent(metrics?.successful_tasks ?? 0, taskTotal);
  const failureRate = metrics?.failure_rate ?? percent(metrics?.failed_tasks ?? 0, taskTotal);
  const tasksByStatus = snapshot?.tasks_by_status ?? {
    queued: metrics?.queued_tasks ?? 0,
    running: metrics?.running_tasks ?? 0,
    succeeded: metrics?.successful_tasks ?? 0,
    failed: metrics?.failed_tasks ?? 0,
  };
  const taskTypeEntries = taskTypeOrder
    .map((type) => [type, snapshot?.tasks_by_type[type] ?? 0] as const)
    .filter(([, count]) => count > 0);
  const maxTaskTypeCount = Math.max(...taskTypeEntries.map(([, count]) => count), 1);
  const assetEntries = assetOrder.map((type) => [type, snapshot?.asset_type_counts?.[type] ?? 0] as const);
  const assetTotal = assetEntries.reduce((sum, [, count]) => sum + count, 0) || metrics?.asset_count || 0;
  const usageTrend = snapshot?.usage_trend ?? [];
  const trendHasData = usageTrend.some((item) => item.total_tokens > 0 || Number(item.cost_usd) > 0 || item.event_count > 0);
  const providerRows = snapshot?.usage_by_provider ?? [];
  const maxProviderCost = Math.max(...providerRows.map((item) => Number(item.cost_usd)), 0.0001);
  const recentTasks = snapshot?.recent_tasks?.length ? snapshot.recent_tasks : latestTask ? [latestTask] : [];
  const health = snapshot?.workspace_health;

  const quickActions: Array<{ tab: AppSection; label: string; desc: string; icon: typeof Activity }> = [
    { tab: 'brainstorm', label: '灵感风暴', desc: '从想法生成工作流', icon: Sparkles },
    { tab: 'builder', label: '工作流', desc: '编排与运行节点', icon: Workflow },
    { tab: 'projects', label: '我的项目', desc: '整理项目与资料', icon: FolderKanban },
    { tab: 'assets', label: '资产库', desc: '查看生成沉淀', icon: Boxes },
    { tab: 'content', label: '内容包', desc: '批量生成初稿', icon: Zap },
    { tab: 'config', label: 'AI 设置', desc: '模型与 API Key', icon: LayoutDashboard },
  ];

  return (
    <div className="space-y-5">
      <section className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-5 shadow-editorial paper-sheet-1">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black text-[var(--editorial-text-gray)]">
              <span className="inline-flex h-7 items-center gap-2 border border-[var(--editorial-stroke)] bg-[var(--editorial-accent-yellow)] px-2 text-[var(--editorial-text)]">
                <Activity className="h-3.5 w-3.5" />
                实时首页
              </span>
              <span>{snapshot?.scope.organization.name ?? 'Marketing Hub'}</span>
              <span>/</span>
              <span className="truncate">{snapshot?.scope.project.name ?? '未选择项目'}</span>
            </div>
            <h2 className="mt-3 text-2xl font-black text-[var(--editorial-text)] serif-header md:text-4xl">
              运营态势与生产数据
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--editorial-text-muted)]">
              {snapshot?.scope.campaign.objective || snapshot?.scope.project.brief || '集中查看任务、成本、资产和工作区健康度，并从异常状态直接进入处理。'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('builder')}
              className="btn-editorial-primary inline-flex h-10 items-center gap-2 px-4 text-sm font-black"
            >
              <Workflow className="h-4 w-4" />
              打开工作流
            </button>
            <button
              type="button"
              onClick={() => {
                onRefresh();
                triggerToast('首页数据已刷新', 'info');
              }}
              className="btn-editorial-secondary inline-flex h-10 items-center gap-2 px-4 text-sm font-black"
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="任务总量" value={formatNumber(taskTotal)} detail={`${activeTasks} 个正在等待或运行`} icon={Activity} tone="bg-blue-100 text-blue-800" />
        <MetricCard label="成功率" value={`${successRate.toFixed(1)}%`} detail={`${metrics?.successful_tasks ?? 0} 成功 / ${metrics?.failed_tasks ?? 0} 失败`} icon={CheckCircle2} tone="bg-emerald-100 text-emerald-800" />
        <MetricCard label="Token 审计" value={formatNumber(metrics?.total_tokens ?? 0)} detail={`${providerRows.length || 1} 个 provider 产生用量`} icon={Database} tone="bg-purple-100 text-purple-800" />
        <MetricCard label="成本估算" value={`$${formatUsd(metrics?.total_cost_usd)}`} detail={`${failureRate.toFixed(1)}% 失败任务占比`} icon={DollarSign} tone="bg-yellow-100 text-yellow-900" />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-5 shadow-editorial-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-[var(--editorial-stroke)]/35 pb-3">
            <div>
              <h3 className="text-sm font-black text-[var(--editorial-text)]">近 7 天用量趋势</h3>
              <p className="text-xs text-[var(--editorial-text-gray)]">按 UsageEvent 聚合 token、成本与调用次数</p>
            </div>
            <span className="inline-flex h-7 items-center gap-2 border border-[var(--editorial-stroke)] px-2 text-xs font-black">
              <BarChart3 className="h-3.5 w-3.5" />
              {formatFullNumber(usageTrend.reduce((sum, item) => sum + item.total_tokens, 0))} tokens
            </span>
          </div>
          {trendHasData ? (
            <div className="mt-4">
              <Sparkline trend={usageTrend} />
              <div className="mt-3 grid grid-cols-7 gap-2">
                {usageTrend.map((item) => (
                  <div key={item.date} className="min-w-0 border border-[var(--editorial-stroke)]/25 p-2 text-center">
                    <span className="block truncate text-[10px] font-black text-[var(--editorial-text-gray)]">{formatDateLabel(item.date)}</span>
                    <span className="mt-1 block truncate text-xs font-black">{formatNumber(item.total_tokens)}</span>
                    <span className="block truncate text-[10px] text-[var(--editorial-text-gray)]">${formatUsd(item.cost_usd)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <EmptyPanel title="还没有可视化用量" description="运行一次内容生成或工作流后，这里会显示每日 token、成本和调用次数。" action="去生成内容" onAction={() => setActiveTab('content')} />
            </div>
          )}
        </div>

        <div className="xl:col-span-4 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-5 shadow-editorial-sm">
          <div className="flex items-center justify-between border-b border-dashed border-[var(--editorial-stroke)]/35 pb-3">
            <div>
              <h3 className="text-sm font-black">任务状态</h3>
              <p className="text-xs text-[var(--editorial-text-gray)]">运行队列与失败风险</p>
            </div>
            {metrics?.failed_tasks ? <AlertTriangle className="h-5 w-5 text-red-700" /> : <CheckCircle2 className="h-5 w-5 text-emerald-700" />}
          </div>
          <div className="mt-4 space-y-3">
            {statusOrder.map((status) => {
              const count = tasksByStatus[status] ?? 0;
              return (
                <div key={status}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="font-black">{statusLabels[status]}</span>
                    <span className="font-mono text-[var(--editorial-text-gray)]">{count}</span>
                  </div>
                  <div className="h-3 border border-[var(--editorial-stroke)] bg-[var(--editorial-unselected)]">
                    <div className="h-full bg-[var(--editorial-stroke)]" style={{ width: `${percent(count, Math.max(taskTotal, 1))}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {(metrics?.failed_tasks ?? 0) > 0 && (
            <button type="button" onClick={() => setActiveTab('builder')} className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 border border-[var(--editorial-stroke)] bg-red-100 px-3 text-xs font-black hover:bg-red-200">
              查看失败工作流
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-4 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-5 shadow-editorial-sm">
          <h3 className="text-sm font-black">任务类型分布</h3>
          <p className="mt-1 text-xs text-[var(--editorial-text-gray)]">看清生产重心集中在哪些能力</p>
          {taskTypeEntries.length ? (
            <div className="mt-4 space-y-3">
              {taskTypeEntries.map(([type, count]) => (
                <div key={type}>
                  <div className="mb-1 flex justify-between gap-3 text-xs">
                    <span className="truncate font-black">{taskTypeLabels[type] ?? type}</span>
                    <span className="font-mono text-[var(--editorial-text-gray)]">{count}</span>
                  </div>
                  <div className="h-3 border border-[var(--editorial-stroke)] bg-[var(--editorial-unselected)]">
                    <div className="h-full bg-blue-600" style={{ width: `${percent(count, maxTaskTypeCount)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyPanel title="暂无任务类型数据" description="完成文案、图片、分镜或工作流任务后，这里会自动形成类型排行。" action="启动灵感风暴" onAction={() => setActiveTab('brainstorm')} />
            </div>
          )}
        </div>

        <div className="xl:col-span-4 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-5 shadow-editorial-sm">
          <h3 className="text-sm font-black">资产构成</h3>
          <p className="mt-1 text-xs text-[var(--editorial-text-gray)]">沉淀内容按类型拆分</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {assetEntries.map(([type, count]) => {
              const Icon = assetIcons[type] ?? Database;
              return (
                <button key={type} type="button" onClick={() => setActiveTab('assets')} className="min-w-0 border border-[var(--editorial-stroke)] p-3 text-left hover:bg-[var(--editorial-unselected)]">
                  <div className="flex items-center justify-between gap-2">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-mono text-[var(--editorial-text-gray)]">{assetTotal ? percent(count, assetTotal).toFixed(0) : 0}%</span>
                  </div>
                  <span className="mt-3 block text-lg font-black">{count}</span>
                  <span className="block truncate text-xs text-[var(--editorial-text-gray)]">{assetLabels[type] ?? type}</span>
                </button>
              );
            })}
          </div>
          {!assetTotal && (
            <p className="mt-3 border border-dashed border-[var(--editorial-stroke)]/35 p-2 text-xs text-[var(--editorial-text-gray)]">暂无资产沉淀，生成结果保存后会在这里出现。</p>
          )}
        </div>

        <div className="xl:col-span-4 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-5 shadow-editorial-sm">
          <h3 className="text-sm font-black">Provider 成本</h3>
          <p className="mt-1 text-xs text-[var(--editorial-text-gray)]">快速判断成本集中来源</p>
          {providerRows.length ? (
            <div className="mt-4 space-y-3">
              {providerRows.slice(0, 5).map((item) => (
                <div key={item.provider}>
                  <div className="mb-1 flex justify-between gap-3 text-xs">
                    <span className="truncate font-black">{item.provider || 'mock'}</span>
                    <span className="font-mono text-[var(--editorial-text-gray)]">${formatUsd(item.cost_usd)}</span>
                  </div>
                  <div className="h-3 border border-[var(--editorial-stroke)] bg-[var(--editorial-unselected)]">
                    <div className="h-full bg-emerald-600" style={{ width: `${percent(Number(item.cost_usd), maxProviderCost)}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--editorial-text-gray)]">{formatNumber(item.total_tokens)} tokens / {item.event_count} 次</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyPanel title="暂无 provider 成本" description="接入真实模型或运行 mock 任务后，这里会按 provider 汇总成本。" action="检查 AI 设置" onAction={() => setActiveTab('config')} />
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-5 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-5 shadow-editorial-sm">
          <h3 className="text-sm font-black">工作区健康度</h3>
          <p className="mt-1 text-xs text-[var(--editorial-text-gray)]">项目、活动、工作流是否形成可持续生产结构</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ['项目', health?.projects ?? metrics?.project_count ?? 0],
              ['活动', health?.campaigns ?? metrics?.campaign_count ?? 0],
              ['工作流草稿', health?.drafts ?? metrics?.draft_count ?? 0],
              ['已完成工作流', health?.completed_drafts ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="border border-[var(--editorial-stroke)] p-3">
                <span className="block text-[10px] font-black text-[var(--editorial-text-gray)]">{label}</span>
                <span className="mt-2 block text-xl font-black serif-header">{value}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 border border-[var(--editorial-stroke)] p-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-black">生产稳定性</span>
              <span className="font-mono text-[var(--editorial-text-gray)]">{successRate.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-3 border border-[var(--editorial-stroke)] bg-[var(--editorial-unselected)]">
              <div className="h-full bg-emerald-600" style={{ width: `${successRate}%` }} />
            </div>
          </div>
        </div>

        <div className="xl:col-span-7 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-5 shadow-editorial-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black">最近任务流水</h3>
              <p className="text-xs text-[var(--editorial-text-gray)]">最新生成、工作流节点与失败任务</p>
            </div>
            <Clock3 className="h-5 w-5 text-[var(--editorial-text-gray)]" />
          </div>
          {recentTasks.length ? (
            <div className="mt-4 divide-y divide-dashed divide-[var(--editorial-stroke)]/25 border-y border-[var(--editorial-stroke)]/25">
              {recentTasks.slice(0, 6).map((task) => (
                <div key={task.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">#{task.id} / {taskTypeLabels[task.task_type] ?? task.task_type}</p>
                    <p className="mt-1 truncate text-xs text-[var(--editorial-text-gray)]">{task.error_message || `${formatNumber(task.token_count ?? 0)} tokens / $${formatUsd(task.cost_usd)}`}</p>
                  </div>
                  <span className={`inline-flex h-7 items-center border px-2 text-[10px] font-black ${statusClass(task.status)}`}>
                    {statusLabels[task.status] ?? task.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyPanel title="还没有任务流水" description="开始生成内容后，任务状态、错误原因和成本会在这里形成可追踪记录。" action="创建第一个任务" onAction={() => setActiveTab('brainstorm')} />
            </div>
          )}
        </div>
      </section>

      <section className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-5 shadow-editorial-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black">快捷行动</h3>
            <p className="text-xs text-[var(--editorial-text-gray)]">把首页从数据展板变成生产入口</p>
          </div>
          <ArrowRight className="h-4 w-4 text-[var(--editorial-text-gray)]" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {quickActions.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.tab} type="button" onClick={() => setActiveTab(item.tab)} className="min-w-0 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-3 text-left hover:bg-[var(--editorial-accent-yellow)]">
                <Icon className="h-4 w-4" />
                <span className="mt-3 block truncate text-sm font-black">{item.label}</span>
                <span className="mt-1 block truncate text-xs text-[var(--editorial-text-gray)]">{item.desc}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
