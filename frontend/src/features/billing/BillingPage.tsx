import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  CreditCard,
  Database,
  KeyRound,
  Layers,
  LineChart,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { BillingPlanRecord, BillingPlanResponse } from '../../types/workspace';

type PlanKey = 'free' | 'pro' | 'enterprise';

interface BillingPageProps {
  billingPlans: BillingPlanResponse | null;
  onSelectPlan: (plan: PlanKey) => Promise<void>;
}

const PLAN_ORDER: PlanKey[] = ['free', 'pro', 'enterprise'];

const PLAN_COPY: Record<PlanKey, { label: string; price: string; audience: string; features: string[] }> = {
  free: {
    label: '试用',
    price: '¥0',
    audience: '验证流程、个人试用',
    features: ['基础项目额度', 'Mock / 平台模型体验', '适合 demo 和早期探索'],
  },
  pro: {
    label: '推荐',
    price: '¥299',
    audience: '小团队持续生产',
    features: ['30 个活跃项目', '高级智能体', 'BYOK 成本抵扣 70%'],
  },
  enterprise: {
    label: '企业',
    price: '定制',
    audience: '多团队、合规和私有部署',
    features: ['近似不限项目', '500GB 存储', 'BYOK 成本完全抵扣'],
  },
};

function formatCurrency(value: string | number | undefined) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(4)}`;
}

function formatNumber(value: number | undefined) {
  return new Intl.NumberFormat('zh-CN').format(value || 0);
}

function usagePercent(current: number, limit: number) {
  if (limit >= 9999) return 8;
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((current / limit) * 100));
}

function PlanCard({
  planKey,
  plan,
  active,
  disabled,
  onSelect,
}: {
  planKey: PlanKey;
  plan: BillingPlanRecord;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const copy = PLAN_COPY[planKey];
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`text-left border-1.5 bg-[var(--editorial-paper)] p-4 shadow-editorial-sm transition-colors disabled:opacity-60 ${
        active ? 'border-[var(--editorial-stroke)]' : 'border-[var(--editorial-stroke)]/35 hover:border-[var(--editorial-stroke)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">{copy.label}</span>
          <h3 className="mt-1 text-lg font-black">{plan.name}</h3>
        </div>
        {active ? (
          <span className="inline-flex items-center gap-1 border border-emerald-500 px-2 py-1 text-[9px] font-black text-emerald-700">
            <Check className="h-3 w-3" />当前
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex items-end gap-2">
        <span className="text-2xl font-black">{copy.price}</span>
        {planKey !== 'enterprise' && <span className="pb-1 text-[10px] text-[var(--editorial-text-gray)]">/ 月</span>}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--editorial-text-gray)]">{copy.audience}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
        <span className="border border-[var(--editorial-stroke)]/30 px-2 py-1.5">
          {plan.project_limit >= 9999 ? '不限项目' : `${plan.project_limit} 个项目`}
        </span>
        <span className="border border-[var(--editorial-stroke)]/30 px-2 py-1.5">{plan.storage_gb}GB 存储</span>
      </div>
      <ul className="mt-4 space-y-2 text-[10px] text-[var(--editorial-text)]">
        {copy.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <span className={`mt-4 inline-flex w-full items-center justify-center border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black ${
        active ? 'bg-[var(--editorial-unselected)]' : 'bg-[var(--editorial-stroke)] text-[var(--editorial-bg)]'
      }`}>
        {active ? '正在使用' : '切换到此方案'}
      </span>
    </button>
  );
}

function MetricCard({ icon: Icon, label, value, hint }: { icon: typeof CreditCard; label: string; value: string; hint: string }) {
  return (
    <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-3">
      <div className="flex items-center gap-2 text-[9px] font-black uppercase text-[var(--editorial-text-gray)]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-xl font-black">{value}</div>
      <p className="mt-1 text-[10px] text-[var(--editorial-text-gray)]">{hint}</p>
    </div>
  );
}

export function BillingPage({ billingPlans, onSelectPlan }: BillingPageProps) {
  const [pendingPlan, setPendingPlan] = useState<PlanKey | null>(null);

  const currentLimit = billingPlans?.current_limits;
  const usage = billingPlans?.usage_summary;
  const projectPercent = billingPlans && currentLimit ? usagePercent(billingPlans.project_count, currentLimit.project_limit) : 0;
  const nearingProjectLimit = !!billingPlans && !!currentLimit && currentLimit.project_limit < 9999 && billingPlans.project_count >= currentLimit.project_limit * 0.8;

  const providerMaxCost = useMemo(() => {
    const costs = billingPlans?.usage_by_provider?.map((item) => Number(item.cost_usd || 0)) || [];
    return Math.max(0.0001, ...costs);
  }, [billingPlans?.usage_by_provider]);

  if (!billingPlans || !currentLimit) {
    return (
      <div className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-6 shadow-editorial text-sm text-[var(--editorial-text-gray)]">
        计费信息加载中…
      </div>
    );
  }

  const selectPlan = async (plan: PlanKey) => {
    if (plan === billingPlans.current_plan || pendingPlan) return;
    setPendingPlan(plan);
    try {
      await onSelectPlan(plan);
    } finally {
      setPendingPlan(null);
    }
  };

  return (
    <div className="min-h-0 space-y-4 font-mono">
      <section className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] shadow-editorial overflow-hidden">
        <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.8fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-[var(--editorial-stroke)] px-2 py-1 text-[9px] font-black uppercase">Billing Control</span>
              <span className="text-[10px] text-[var(--editorial-text-gray)]">组织订阅、额度、成本与 BYOK 抵扣</span>
            </div>
            <h2 className="serif-header mt-4 text-3xl font-black">订阅与用量</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--editorial-text-gray)]">
              当前方案为 <b className="text-[var(--editorial-text)]">{currentLimit.name}</b>。这里展示的是本地 SaaS 账本和模型调用成本估算，不包含真实支付扣款。
            </p>
          </div>
          <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)] p-4">
            <div className="flex items-center justify-between text-[10px] font-black uppercase">
              <span>项目额度</span>
              <span>{billingPlans.project_count} / {currentLimit.project_limit >= 9999 ? '不限' : currentLimit.project_limit}</span>
            </div>
            <div className="mt-3 h-2 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)]">
              <div className={`h-full ${nearingProjectLimit ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${projectPercent}%` }} />
            </div>
            {nearingProjectLimit ? (
              <div className="mt-3 flex gap-2 text-[10px] text-amber-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>项目数量接近当前方案上限。归档旧项目或升级可避免创建失败。</span>
              </div>
            ) : (
              <div className="mt-3 flex gap-2 text-[10px] text-emerald-700">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>当前项目额度健康。</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.8fr)]">
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {PLAN_ORDER.map((planKey) => (
              <PlanCard
                key={planKey}
                planKey={planKey}
                plan={billingPlans.plans[planKey]}
                active={billingPlans.current_plan === planKey}
                disabled={!!pendingPlan}
                onSelect={() => void selectPlan(planKey)}
              />
            ))}
          </div>

          <div className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-editorial-sm">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              <h3 className="text-xs font-black uppercase">BYOK 成本策略</h3>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              {PLAN_ORDER.map((planKey) => {
                const plan = billingPlans.plans[planKey];
                return (
                  <div key={planKey} className="border border-[var(--editorial-stroke)]/40 p-3">
                    <span className="text-[10px] font-black">{plan.name}</span>
                    <p className="mt-2 text-[20px] font-black">{plan.byok_discount}</p>
                    <p className="mt-1 text-[10px] text-[var(--editorial-text-gray)]">使用自己的模型密钥可抵扣的平台成本比例</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard icon={CreditCard} label="30 天成本" value={formatCurrency(usage?.last_30d_cost_usd)} hint="最近 30 天模型成本" />
            <MetricCard icon={Zap} label="30 天 Tokens" value={formatNumber(usage?.last_30d_tokens)} hint="Prompt + completion" />
            <MetricCard icon={LineChart} label="累计成本" value={formatCurrency(usage?.total_cost_usd)} hint="组织历史账本" />
            <MetricCard icon={Sparkles} label="任务成功率" value={`${usage?.task_count ? Math.round(((usage.successful_tasks || 0) / usage.task_count) * 100) : 0}%`} hint={`${usage?.successful_tasks || 0} 成功 / ${usage?.failed_tasks || 0} 失败`} />
          </div>

          <div className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-editorial-sm">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <h3 className="text-xs font-black uppercase">方案权益</h3>
            </div>
            <div className="mt-4 space-y-3 text-[10px]">
              <div className="flex items-center justify-between border-b border-dashed border-[var(--editorial-stroke)]/30 pb-2">
                <span>活跃项目</span>
                <b>{currentLimit.project_limit >= 9999 ? '不限' : currentLimit.project_limit}</b>
              </div>
              <div className="flex items-center justify-between border-b border-dashed border-[var(--editorial-stroke)]/30 pb-2">
                <span>存储空间</span>
                <b>{currentLimit.storage_gb}GB</b>
              </div>
              <div className="flex items-center justify-between border-b border-dashed border-[var(--editorial-stroke)]/30 pb-2">
                <span>高级智能体</span>
                <b>{currentLimit.advanced_agents ? '已开放' : '未开放'}</b>
              </div>
              <div className="flex items-center justify-between">
                <span>BYOK 抵扣</span>
                <b>{currentLimit.byok_discount}</b>
              </div>
            </div>
          </div>

          <div className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-editorial-sm">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <h3 className="text-xs font-black uppercase">Provider 成本分布</h3>
            </div>
            <div className="mt-4 space-y-3">
              {(billingPlans.usage_by_provider || []).length === 0 ? (
                <p className="text-[10px] text-[var(--editorial-text-gray)]">暂无用量记录。</p>
              ) : (
                billingPlans.usage_by_provider?.map((item) => {
                  const cost = Number(item.cost_usd || 0);
                  return (
                    <div key={item.provider}>
                      <div className="mb-1 flex items-center justify-between text-[10px]">
                        <span className="font-black">{item.provider}</span>
                        <span className="text-[var(--editorial-text-gray)]">{formatCurrency(cost)} / {formatNumber(item.total_tokens)} tokens</span>
                      </div>
                      <div className="h-1.5 border border-[var(--editorial-stroke)]/30 bg-[var(--editorial-bg)]">
                        <div className="h-full bg-[var(--editorial-stroke)]" style={{ width: `${Math.max(3, Math.round((cost / providerMaxCost) * 100))}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-editorial-sm">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              <h3 className="text-xs font-black uppercase">最近用量</h3>
            </div>
            <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto pr-1">
              {(billingPlans.recent_usage || []).length === 0 ? (
                <p className="text-[10px] text-[var(--editorial-text-gray)]">暂无最近调用。</p>
              ) : (
                billingPlans.recent_usage?.map((item, index) => (
                  <div key={`${item.created_at}-${index}`} className="border border-[var(--editorial-stroke)]/35 px-2.5 py-2 text-[10px]">
                    <div className="flex items-center justify-between gap-2">
                      <b>{item.provider}{item.model_name ? ` / ${item.model_name}` : ''}</b>
                      <span>{formatCurrency(item.cost_usd)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[9px] text-[var(--editorial-text-gray)]">
                      <span>{formatNumber(item.total_tokens)} tokens</span>
                      <span>{new Date(item.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
