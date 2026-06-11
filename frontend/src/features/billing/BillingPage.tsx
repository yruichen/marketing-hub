import type { BillingPlanResponse } from '../../types/workspace';

interface BillingPageProps {
  billingPlans: BillingPlanResponse | null;
  onSelectPlan: (plan: 'free' | 'pro' | 'enterprise') => Promise<void>;
}

export function BillingPage({ billingPlans, onSelectPlan }: BillingPageProps) {
  if (!billingPlans) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {(['free', 'pro', 'enterprise'] as const).map((planKey) => {
        const plan = billingPlans.plans[planKey];
        const active = billingPlans.current_plan === planKey;
        return (
          <button
            key={planKey}
            type="button"
            onClick={() => onSelectPlan(planKey)}
            className={`text-left bg-[var(--editorial-paper)] border-1.5 p-5 shadow-editorial-sm ${
              active ? 'border-[var(--editorial-stroke)]' : 'border-[var(--editorial-stroke)]/40'
            }`}
          >
            <span className="block text-sm font-black">{plan.name}</span>
            <span className="block mt-3 text-xs text-[var(--editorial-text-gray)]">
              {plan.project_limit >= 9999 ? '不限项目' : `${plan.project_limit} 个项目`} / {plan.storage_gb}GB 存储
            </span>
            <span className="block mt-2 text-xs text-[var(--editorial-text-gray)]">
              使用自己的模型密钥抵扣 {plan.byok_discount}
            </span>
          </button>
        );
      })}
    </div>
  );
}