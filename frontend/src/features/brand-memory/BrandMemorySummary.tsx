import { AlertCircle, CheckCircle2, Database, PencilLine } from 'lucide-react';
import type { BrandContext } from '../../types/workspace';
import {
  buildBrandMemoryHighlights,
  calculateBrandMemoryScore,
  describeBrandMemoryReadiness,
} from './brandMemory';

interface BrandMemorySummaryProps {
  projectName?: string;
  context?: BrandContext;
  compact?: boolean;
  onEdit?: () => void;
}

export function BrandMemorySummary({
  projectName,
  context = {},
  compact = false,
  onEdit,
}: BrandMemorySummaryProps) {
  const score = calculateBrandMemoryScore(context);
  const highlights = buildBrandMemoryHighlights(context, compact ? 4 : 6);
  const ready = score.score >= 50;
  const StatusIcon = ready ? CheckCircle2 : AlertCircle;

  return (
    <section className="border border-[var(--editorial-stroke)]/50 bg-[var(--editorial-bg)]/25 p-3 font-mono">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)]">
            <Database className="h-3.5 w-3.5" />
            Brand Memory
          </p>
          <h4 className="mt-1 truncate text-xs font-black text-[var(--editorial-text)]">
            {projectName ? `当前项目：${projectName}` : '未选择项目'}
          </h4>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-2 py-1 text-[9px] font-black">
            <StatusIcon className={`h-3 w-3 ${ready ? 'text-emerald-600' : 'text-amber-600'}`} />
            {score.score}%
          </span>
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-7 w-7 items-center justify-center border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] hover:bg-[var(--editorial-unselected)]"
              title="编辑品牌记忆"
              aria-label="编辑品牌记忆"
            >
              <PencilLine className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <p className="mt-2 text-[10px] font-semibold leading-4 text-[var(--editorial-text-gray)]">
        {describeBrandMemoryReadiness(score.score)}
        {score.missingRequired.length ? `：缺少 ${score.missingRequired.slice(0, 3).join('、')}` : ''}
      </p>

      {highlights.length ? (
        <div className={`mt-3 grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {highlights.map((item) => (
            <div key={item.key} className="min-w-0 border-l border-[var(--editorial-stroke)]/50 pl-2">
              <span className="block text-[8px] font-black uppercase text-[var(--editorial-text-gray)]">{item.label}</span>
              <span className="mt-0.5 line-clamp-2 block text-[10px] font-bold leading-4 text-[var(--editorial-text)]">{item.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 border border-dashed border-[var(--editorial-stroke)]/50 bg-[var(--editorial-paper)]/60 px-3 py-2 text-[10px] font-bold text-[var(--editorial-text-gray)]">
          生成会使用通用默认上下文。建议先在项目页补齐品牌记忆。
        </div>
      )}
    </section>
  );
}
