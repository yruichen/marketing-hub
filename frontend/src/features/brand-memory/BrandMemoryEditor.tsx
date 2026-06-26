import { AlertCircle, CheckCircle2, Save } from 'lucide-react';
import type { BrandContext, ProjectRecord } from '../../types/workspace';
import {
  BRAND_MEMORY_SECTIONS,
  calculateBrandMemoryScore,
  describeBrandMemoryReadiness,
  stringifyBrandMemoryValue,
} from './brandMemory';

interface BrandMemoryEditorProps {
  project: Pick<ProjectRecord, 'name' | 'updated_at'>;
  context: BrandContext;
  isDirty: boolean;
  isSaving: boolean;
  onChange: (next: BrandContext) => void;
  onSave: () => void;
}

export function BrandMemoryEditor({
  project,
  context,
  isDirty,
  isSaving,
  onChange,
  onSave,
}: BrandMemoryEditorProps) {
  const score = calculateBrandMemoryScore(context);
  const ready = score.score >= 50;
  const StatusIcon = ready ? CheckCircle2 : AlertCircle;

  return (
    <div className="border-t border-dashed border-[var(--editorial-stroke)]/30 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="desktop-inspector__label">品牌记忆</span>
          <p className="mt-1 text-[10px] leading-4 text-[var(--editorial-text-gray)]">
            {project.name} / {describeBrandMemoryReadiness(score.score)}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-2 py-1 text-[9px] font-black">
          <StatusIcon className={`h-3 w-3 ${ready ? 'text-emerald-600' : 'text-amber-600'}`} />
          {score.score}%
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)]">
        <div className="h-full bg-[var(--editorial-stroke)] transition-all" style={{ width: `${score.score}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] font-bold text-[var(--editorial-text-gray)]">
        <span>{score.completed}/{score.total} 已填写</span>
        <span>/</span>
        <span>{isDirty ? '有未保存改动' : `已保存到项目，更新时间 ${project.updated_at ? new Date(project.updated_at).toLocaleString('zh-CN') : '暂无'}`}</span>
      </div>

      {score.missingRequired.length ? (
        <div className="mt-3 border border-amber-500/50 bg-amber-50/70 px-3 py-2 text-[10px] font-bold leading-4 text-amber-900">
          建议补齐：{score.missingRequired.join('、')}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col gap-4">
        {BRAND_MEMORY_SECTIONS.map((section) => (
          <section key={section.id} className="border-t border-[var(--editorial-stroke)]/25 pt-3">
            <div className="mb-3">
              <h4 className="text-[11px] font-black text-[var(--editorial-text)]">{section.title}</h4>
              <p className="mt-0.5 text-[9px] font-semibold leading-4 text-[var(--editorial-text-gray)]">{section.description}</p>
            </div>
            <div className="flex flex-col gap-3">
              {section.fields.map((field) => {
                const value = stringifyBrandMemoryValue(context[field.key]);
                const sharedClass = 'bg-transparent border border-[var(--editorial-stroke)]/50 text-[var(--editorial-text)] text-[11px] px-2.5 py-2 focus:outline-none focus:border-[var(--editorial-stroke)]';
                return (
                  <label key={String(field.key)} className="flex flex-col gap-1">
                    <span className="text-[9px] font-black uppercase text-[var(--editorial-text-gray)]">
                      {field.label}{field.required ? ' *' : ''}
                    </span>
                    {field.multiline ? (
                      <textarea
                        rows={3}
                        value={value}
                        onChange={(event) => onChange({ ...context, [field.key]: event.target.value })}
                        className={`${sharedClass} resize-none leading-4`}
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <input
                        value={value}
                        onChange={(event) => onChange({ ...context, [field.key]: event.target.value })}
                        className={sharedClass}
                        placeholder={field.placeholder}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={isSaving || !isDirty}
        className="desktop-toolbar__btn desktop-toolbar__btn--primary mt-4 flex w-full justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-55"
      >
        <Save className="h-3.5 w-3.5" />
        {isSaving ? '保存中...' : isDirty ? '保存品牌记忆' : '品牌记忆已保存'}
      </button>
    </div>
  );
}
