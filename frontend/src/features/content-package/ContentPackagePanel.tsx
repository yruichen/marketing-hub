import { Sparkles } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { ContentPackage } from '../generation/types';
import { defaultContentPackage } from './constants';
import { buildContentPackage, buildContentPackageRequest, useContentPackageActions } from './hooks';
import { BrandMemorySummary } from '../brand-memory';
import { channelChoices, useCaseChoices, templateChoices } from '../onboarding/types';
import type { OnboardingState } from '../onboarding/types';
import type { WorkspaceScope } from '../dashboard/types';
import type { AppSection } from '../../shared/stores/uiStore';
import type { TriggerToastFn } from '../../shared/types/toast';

interface ContentPackagePanelProps {
  onboarding: OnboardingState;
  setOnboarding: React.Dispatch<React.SetStateAction<OnboardingState>>;
  copyInput: { brandName: string; description: string; tone: string; platform: string };
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  storyboardDuration: number;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  setAgentLogs: React.Dispatch<React.SetStateAction<string[]>>;
  triggerToast: TriggerToastFn;
  setActiveTab: (tab: AppSection) => void;
  onCopy: (text: string) => Promise<void>;
  onApplyContentPackage: (pkg: ContentPackage) => void;
}

export function ContentPackagePanel({
  onboarding,
  setOnboarding,
  copyInput,
  workspaceScope,
  username,
  storyboardDuration,
  loading: _loading,
  setLoading: _setLoading,
  setAgentLogs,
  triggerToast,
  setActiveTab,
  onCopy,
  onApplyContentPackage,
}: ContentPackagePanelProps) {
  void _loading;
  void _setLoading;
  const [contentBrief, setContentBrief] = useState(onboarding.brief);
  const [contentPackage, setContentPackage] = useState<ContentPackage>(defaultContentPackage);
  const [contentVersion, setContentVersion] = useState<'AI 初稿' | '用户修改稿' | '最终稿'>(defaultContentPackage.version);
  const [isRunning, setIsRunning] = useState(false);

  const handleApplied = useCallback((pkg: ContentPackage) => {
    setContentPackage(pkg);
    setContentVersion(pkg.version || 'AI 初稿');
    onApplyContentPackage(pkg);
  }, [onApplyContentPackage]);

  const { generate, rewrite } = useContentPackageActions({
    setLoading: setIsRunning,
    setAgentLogs,
    triggerToast,
    onApplied: handleApplied,
  });

  const requestPayload = useMemo(() => buildContentPackageRequest({
    onboarding,
    contentBrief,
    copyInput,
    workspaceScope,
    username,
    storyboardDuration,
  }), [onboarding, contentBrief, copyInput, workspaceScope, username, storyboardDuration]);

  const generateContentPackage = () => {
    return generate(requestPayload);
  };

  const rewriteContentPackage = (mode: string) => {
    return rewrite(requestPayload, mode);
  };

  const exportContentPackage = (format: string) => {
    const text = [
      `# ${contentPackage.title}`,
      '',
      `平台：${contentPackage.platform}`,
      '',
      contentPackage.body,
      '',
      `标签：${contentPackage.tags.map((tag) => `#${tag}`).join(' ')}`,
      '',
      `图片建议：${contentPackage.imagePrompt}`,
      '',
      '分镜/口播：',
      ...contentPackage.storyboard.map((item) => `- ${item}`),
      '',
      '审核建议：',
      ...contentPackage.reviewAdvice.map((item) => `- ${item}`),
    ].join('\n');
    if (format === 'Markdown') {
      onCopy(text);
    }
    triggerToast(`${format} 导出内容已准备好`, 'info');
  };

  // Expose local builders for parent onboarding completion via ref-like pattern (kept here so
  // the parent can compute the very first draft using the same logic)
  void buildContentPackage;

  return (
    <div className="generation-workspace generation-workspace--with-result">
      <section className="generation-workspace__form bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial-sm relative">
        <div className="generation-workspace__form-body">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
          <div>
            <h3 className="text-sm font-black uppercase">内容包输入</h3>
            <p className="text-[10px] text-[var(--editorial-text-gray)] mt-1">一个 brief 生成标题、正文、标签、图片建议和分镜建议。</p>
          </div>
          <button type="button" onClick={generateContentPackage} disabled={isRunning} className="btn-editorial-primary px-3 py-2 text-[10px] font-black uppercase flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            生成内容包
          </button>
        </div>
        <BrandMemorySummary
          projectName={workspaceScope?.project.name}
          context={workspaceScope?.project.brand_context}
          compact
        />

        <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
          使用场景
          <select value={onboarding.useCase} onChange={(event) => setOnboarding((prev) => ({ ...prev, useCase: event.target.value }))} className="border border-[var(--editorial-stroke)] bg-transparent px-3 py-2 text-xs font-normal">
            {useCaseChoices.map((choice) => <option key={choice}>{choice}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
          brief
          <textarea rows={4} value={contentBrief} onChange={(event) => setContentBrief(event.target.value)} className="border border-[var(--editorial-stroke)] bg-transparent p-3 text-xs resize-none focus:outline-none" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
            渠道
            <div className="flex flex-wrap gap-2">
              {channelChoices.map((channel) => {
                const active = onboarding.channels.includes(channel);
                return (
                  <button key={channel} type="button" onClick={() => setOnboarding((prev) => ({
                    ...prev,
                    channels: prev.channels.includes(channel) ? prev.channels.filter((item) => item !== channel) : [...prev.channels, channel],
                  }))} className={`border px-2 py-1 text-[9px] ${active ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-unselected)]' : 'border-[var(--editorial-stroke)]/40'}`}>
                    {channel}
                  </button>
                );
              })}
            </div>
          </label>
          <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
            起始模板
            <select value={onboarding.template} onChange={(event) => setOnboarding((prev) => ({ ...prev, template: event.target.value }))} className="border border-[var(--editorial-stroke)] bg-transparent px-3 py-2 text-xs font-normal">
              {templateChoices.map((choice) => <option key={choice}>{choice}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            ['更短', 'short'],
            ['更有冲突感', 'conflict'],
            ['更专业', 'professional'],
            ['更年轻化', 'young'],
            ['减少夸张表达', 'calm'],
          ].map(([label, mode]) => (
            <button key={mode} type="button" onClick={() => rewriteContentPackage(mode)} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveTab('copy')} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">文案细化</button>
          <button type="button" onClick={() => setActiveTab('image')} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">图片提示词</button>
          <button type="button" onClick={() => setActiveTab('storyboard')} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">分镜</button>
          <button type="button" onClick={() => setActiveTab('audio')} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">口播</button>
        </div>
        </div>
      </section>

      <section className="generation-workspace__results">
        <div className="generation-workspace__preview bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial-sm space-y-3 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-3">
          <div>
            <h3 className="text-sm font-black uppercase">{contentPackage.title}</h3>
            <p className="text-[10px] text-[var(--editorial-text-gray)] mt-1">版本：{contentVersion}</p>
          </div>
          <div className="flex gap-2">
            {contentPackage.exportFormats.map((format) => (
              <button key={format} type="button" onClick={() => exportContentPackage(format)} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">
                导出 {format}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs leading-7 text-[var(--editorial-text-muted)]">{contentPackage.body}</p>
            <div className="flex flex-wrap gap-2 text-[10px] font-black text-[var(--editorial-accent-blue)]">
              {contentPackage.tags.map((tag) => <span key={tag}>#{tag}</span>)}
            </div>
            <div className="border border-[var(--editorial-stroke)] p-3 text-xs">
              <div className="text-[10px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">图片建议</div>
              <p>{contentPackage.imagePrompt}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="border border-[var(--editorial-stroke)] p-3">
              <div className="text-[10px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">分镜 / 口播</div>
              <div className="space-y-2 text-xs">
                {contentPackage.storyboard.map((line) => <p key={line}>{line}</p>)}
              </div>
            </div>
            <div className="border border-[var(--editorial-stroke)] p-3">
              <div className="text-[10px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">审核建议</div>
              <ul className="space-y-1 text-xs">
                {contentPackage.reviewAdvice.map((line) => <li key={line}>• {line}</li>)}
              </ul>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onCopy(contentPackage.body)} className="btn-editorial-secondary px-3 py-2 text-[10px] font-black uppercase">复制正文</button>
              <button type="button" onClick={() => setActiveTab('review')} className="btn-editorial-secondary px-3 py-2 text-[10px] font-black uppercase">加入审阅</button>
              <button type="button" onClick={() => setActiveTab('projects')} className="btn-editorial-secondary px-3 py-2 text-[10px] font-black uppercase">保存到项目</button>
            </div>
          </div>
        </div>
        </div>
      </section>
    </div>
  );
}
