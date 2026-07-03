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
  Mail,
  ShieldCheck,
  Sparkles,
  Ticket,
  Zap,
} from 'lucide-react';
import type { BillingPlanRecord, BillingPlanResponse } from '../../types/workspace';

type PlanKey = 'free' | 'pro' | 'enterprise';

interface EnterpriseRequestPayload {
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  team_size: string;
  requirements: string;
}

interface BillingPageProps {
  billingPlans: BillingPlanResponse | null;
  onRedeemProInvite: (code: string) => Promise<void>;
  onSubmitEnterpriseRequest: (payload: EnterpriseRequestPayload) => Promise<void>;
}

const PLAN_ORDER: PlanKey[] = ['free', 'pro', 'enterprise'];

const PLAN_COPY: Record<PlanKey, { label: string; price: string; audience: string; features: string[] }> = {
  free: {
    label: '当前开放',
    price: '¥0',
    audience: '免费使用 Agnes API，适合个人试用和轻量项目。',
    features: ['免费 Agnes API', '基础项目额度', '基础存储空间'],
  },
  pro: {
    label: '邀请码解锁',
    price: '邀请码',
    audience: '面向种子用户和深度创作者，解锁完整功能。',
    features: ['全部功能开放', '更高项目和存储空间', '未来优先接入高性能 AI API'],
  },
  enterprise: {
    label: '企业定制',
    price: '联系定制',
    audience: '面向团队协作、合规、私有部署和更高 SLA。',
    features: ['企业工作区权益', '近似不限项目', '定制模型和部署方案'],
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

function PlanCard({ planKey, plan, active }: { planKey: PlanKey; plan: BillingPlanRecord; active: boolean }) {
  const copy = PLAN_COPY[planKey];
  return (
    <div className={`border-1.5 bg-[var(--editorial-paper)] p-4 shadow-editorial-sm ${
      active ? 'border-[var(--editorial-stroke)]' : 'border-[var(--editorial-stroke)]/35'
    }`}>
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
      <div className="mt-4 text-2xl font-black">{copy.price}</div>
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
    </div>
  );
}

export function BillingPage({ billingPlans, onRedeemProInvite, onSubmitEnterpriseRequest }: BillingPageProps) {
  const [inviteCode, setInviteCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [submittingEnterprise, setSubmittingEnterprise] = useState(false);
  const [enterpriseForm, setEnterpriseForm] = useState<EnterpriseRequestPayload>({
    company_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    team_size: '',
    requirements: '',
  });

  const currentLimit = billingPlans?.effective_limits || billingPlans?.current_limits;
  const usage = billingPlans?.usage_summary;
  const effectivePlan = billingPlans?.effective_plan || billingPlans?.current_plan;
  const personalPlan = billingPlans?.personal_plan || (effectivePlan === 'pro' ? 'pro' : 'free');
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

  const redeemProInvite = async () => {
    if (!inviteCode.trim() || redeeming) return;
    setRedeeming(true);
    try {
      await onRedeemProInvite(inviteCode.trim());
      setInviteCode('');
    } finally {
      setRedeeming(false);
    }
  };

  const submitEnterpriseRequest = async () => {
    if (!enterpriseForm.company_name.trim() || !enterpriseForm.contact_name.trim() || !enterpriseForm.contact_email.trim() || submittingEnterprise) return;
    setSubmittingEnterprise(true);
    try {
      await onSubmitEnterpriseRequest(enterpriseForm);
      setEnterpriseForm({
        company_name: '',
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        team_size: '',
        requirements: '',
      });
    } finally {
      setSubmittingEnterprise(false);
    }
  };

  return (
    <div className="min-h-0 space-y-4 font-mono">
      <section className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] shadow-editorial overflow-hidden">
        <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.8fr)]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-[var(--editorial-stroke)] px-2 py-1 text-[9px] font-black uppercase">Billing Control</span>
              <span className="text-[10px] text-[var(--editorial-text-gray)]">个人 Pro 邀请码、企业定制、用量和权益</span>
            </div>
            <h2 className="serif-header mt-4 text-3xl font-black">订阅与用量</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--editorial-text-gray)]">
              当前有效权益为 <b className="text-[var(--editorial-text)]">{currentLimit.name}</b>。免费用户可以正常使用 Agnes API；Pro 通过邀请码解锁完整功能，企业版需要提交定制需求。
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
                <span>项目数量接近当前方案上限。兑换 Pro 或联系企业定制可获得更高额度。</span>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {PLAN_ORDER.map((planKey) => (
          <PlanCard
            key={planKey}
            planKey={planKey}
            plan={billingPlans.plans[planKey]}
            active={effectivePlan === planKey || (planKey === 'free' && effectivePlan === 'free')}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,.85fr)]">
        <section className="space-y-4">
          <div className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-editorial-sm">
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              <h3 className="text-xs font-black uppercase">Pro 邀请码兑换</h3>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--editorial-text-gray)]">
              Pro 邀请码分配到个人账号。兑换后当前账号在个人工作区中解锁完整功能和更高项目/存储额度。
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]">
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                disabled={personalPlan === 'pro'}
                className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 py-2 text-xs font-black outline-none disabled:opacity-60"
                placeholder={personalPlan === 'pro' ? '当前账号已是 Pro' : '输入 Pro 邀请码'}
              />
              <button
                type="button"
                onClick={() => void redeemProInvite()}
                disabled={personalPlan === 'pro' || !inviteCode.trim() || redeeming}
                className="btn-editorial-primary px-4 py-2 text-xs font-black uppercase disabled:opacity-60"
              >
                {redeeming ? '兑换中...' : personalPlan === 'pro' ? '已解锁' : '兑换 Pro'}
              </button>
            </div>
          </div>

          <div className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-editorial-sm">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <h3 className="text-xs font-black uppercase">企业定制联系</h3>
            </div>
            {billingPlans.enterprise_request_status ? (
              <div className="mt-3 border border-emerald-500 bg-emerald-50 px-3 py-2 text-[10px] font-black text-emerald-700">
                已提交企业定制需求，当前状态：{billingPlans.enterprise_request_status}
              </div>
            ) : null}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <input value={enterpriseForm.company_name} onChange={(event) => setEnterpriseForm({ ...enterpriseForm, company_name: event.target.value })} className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 py-2 text-xs outline-none" placeholder="公司名称" />
              <input value={enterpriseForm.team_size} onChange={(event) => setEnterpriseForm({ ...enterpriseForm, team_size: event.target.value })} className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 py-2 text-xs outline-none" placeholder="团队规模" />
              <input value={enterpriseForm.contact_name} onChange={(event) => setEnterpriseForm({ ...enterpriseForm, contact_name: event.target.value })} className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 py-2 text-xs outline-none" placeholder="联系人" />
              <input value={enterpriseForm.contact_email} onChange={(event) => setEnterpriseForm({ ...enterpriseForm, contact_email: event.target.value })} className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 py-2 text-xs outline-none" placeholder="邮箱" />
              <input value={enterpriseForm.contact_phone} onChange={(event) => setEnterpriseForm({ ...enterpriseForm, contact_phone: event.target.value })} className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 py-2 text-xs outline-none md:col-span-2" placeholder="电话 / 微信，可选" />
              <textarea value={enterpriseForm.requirements} onChange={(event) => setEnterpriseForm({ ...enterpriseForm, requirements: event.target.value })} rows={3} className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 py-2 text-xs outline-none md:col-span-2" placeholder="企业需求：人数、模型、部署、合规、发票等" />
            </div>
            <button
              type="button"
              onClick={() => void submitEnterpriseRequest()}
              disabled={!enterpriseForm.company_name.trim() || !enterpriseForm.contact_name.trim() || !enterpriseForm.contact_email.trim() || submittingEnterprise}
              className="mt-3 btn-editorial-primary px-4 py-2 text-xs font-black uppercase disabled:opacity-60"
            >
              {submittingEnterprise ? '提交中...' : '提交企业需求'}
            </button>
          </div>

          <div className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-editorial-sm">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              <h3 className="text-xs font-black uppercase">当前权益</h3>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-[10px]">
              <div className="border border-[var(--editorial-stroke)]/40 p-3"><b>个人订阅</b><p className="mt-1 text-[var(--editorial-text-gray)]">{personalPlan.toUpperCase()}</p></div>
              <div className="border border-[var(--editorial-stroke)]/40 p-3"><b>组织方案</b><p className="mt-1 text-[var(--editorial-text-gray)]">{billingPlans.organization_plan || 'free'}</p></div>
              <div className="border border-[var(--editorial-stroke)]/40 p-3"><b>高级功能</b><p className="mt-1 text-[var(--editorial-text-gray)]">{currentLimit.advanced_agents ? '已开放' : '未开放'}</p></div>
              <div className="border border-[var(--editorial-stroke)]/40 p-3"><b>存储空间</b><p className="mt-1 text-[var(--editorial-text-gray)]">{currentLimit.storage_gb}GB</p></div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard icon={CreditCard} label="30 天成本" value={formatCurrency(usage?.last_30d_cost_usd)} hint="内部模型成本估算" />
            <MetricCard icon={Zap} label="30 天 Tokens" value={formatNumber(usage?.last_30d_tokens)} hint="Prompt + completion" />
            <MetricCard icon={LineChart} label="累计成本" value={formatCurrency(usage?.total_cost_usd)} hint="组织历史账本" />
            <MetricCard icon={Sparkles} label="任务成功率" value={`${usage?.task_count ? Math.round(((usage.successful_tasks || 0) / usage.task_count) * 100) : 0}%`} hint={`${usage?.successful_tasks || 0} 成功 / ${usage?.failed_tasks || 0} 失败`} />
          </div>

          <div className="border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4 shadow-editorial-sm">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <h3 className="text-xs font-black uppercase">方案说明</h3>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-[var(--editorial-text-gray)]">
              Agnes API 当前对用户免费开放。这里的成本和 Tokens 是平台内部观测数据，用来评估模型消耗，不作为用户余额扣减。
            </p>
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
