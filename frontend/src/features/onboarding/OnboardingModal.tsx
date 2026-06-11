import { useState } from 'react';
import type { OnboardingState } from './types';
import {
  useCaseChoices,
  channelChoices,
  templateChoices,
} from './types';

interface OnboardingModalProps {
  state: OnboardingState;
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  onClose: () => void;
  onComplete: () => void;
}

const steps = ['使用场景', '创建品牌', '选择渠道', '起始模板', '生成内容包'];

export function OnboardingModal({
  state,
  setState,
  onClose,
  onComplete,
}: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial p-6">
        <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-4">
          <div>
            <h2 className="text-lg serif-header font-bold">首次使用引导</h2>
            <p className="text-[10px] text-[var(--editorial-text-gray)] mt-1">5 步完成第一轮内容生成，后续可以再补品牌细节。</p>
          </div>
          <button type="button" onClick={onClose} className="text-xs font-black hover:text-rose-500" aria-label="关闭首次使用引导">关闭</button>
        </div>

        <div className="flex flex-wrap gap-2 my-5">
          {steps.map((label, index) => (
            <button key={label} type="button" onClick={() => setStep(index)} className={`border px-3 py-1.5 text-[10px] font-black ${step === index ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-unselected)]' : 'border-[var(--editorial-stroke)]/40'}`}>
              {index + 1}. {label}
            </button>
          ))}
        </div>

        <div className="min-h-[300px]">
          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {useCaseChoices.map((choice) => (
                <button key={choice} type="button" onClick={() => setState((prev) => ({ ...prev, useCase: choice }))} className={`border p-4 text-left text-sm font-black ${state.useCase === choice ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/50' : 'border-[var(--editorial-stroke)]/40'}`}>
                  {choice}
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                ['brandName', '品牌名称'],
                ['industry', '行业'],
                ['audience', '目标人群'],
                ['tone', '语调'],
                ['forbiddenWords', '禁用词'],
                ['referenceLinks', '参考链接'],
              ].map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
                  {label}
                  <input value={String(state[key as keyof OnboardingState] || '')} onChange={(event) => setState((prev) => ({ ...prev, [key]: event.target.value }))} className="border border-[var(--editorial-stroke)] bg-transparent px-3 py-2 text-xs font-normal focus:outline-none" />
                </label>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {channelChoices.map((channel) => {
                const active = state.channels.includes(channel);
                return (
                  <button key={channel} type="button" onClick={() => setState((prev) => ({ ...prev, channels: active ? prev.channels.filter((item) => item !== channel) : [...prev.channels, channel] }))} className={`border p-4 text-left text-sm font-black ${active ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/50' : 'border-[var(--editorial-stroke)]/40'}`}>
                    {channel}
                  </button>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templateChoices.map((template) => (
                <button key={template} type="button" onClick={() => setState((prev) => ({ ...prev, template }))} className={`border p-4 text-left text-sm font-black ${state.template === template ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/50' : 'border-[var(--editorial-stroke)]/40'}`}>
                  {template}
                </button>
              ))}
            </div>
          )}

          {step === 4 && (
            <label className="flex flex-col gap-2 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
              第一份内容包 brief
              <textarea value={state.brief} onChange={(event) => setState((prev) => ({ ...prev, brief: event.target.value }))} rows={7} className="border border-[var(--editorial-stroke)] bg-transparent p-3 text-xs font-normal resize-none focus:outline-none" />
            </label>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--editorial-stroke)] pt-4">
          <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} className="border border-[var(--editorial-stroke)] px-4 py-2 text-[10px] font-black disabled:opacity-40">
            上一步
          </button>
          <button type="button" onClick={() => isLast ? onComplete() : setStep((value) => Math.min(steps.length - 1, value + 1))} className="btn-editorial-primary px-4 py-2 text-[10px] font-black uppercase">
            {isLast ? '生成第一份内容包' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  );
}