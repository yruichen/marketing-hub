import { useCallback } from 'react';
import { apiFetch } from '../../hooks/useApi';
import type { ContentPackage } from '../generation/types';
import type { OnboardingState } from '../onboarding/types';
import type { WorkspaceScope } from '../dashboard/types';

export interface ContentPackageInputs {
  onboarding: OnboardingState;
  contentBrief: string;
  copyInput: { brandName: string; description: string; tone: string; platform: string };
  workspaceScope: WorkspaceScope | null;
}

export function buildContentPackage(
  inputs: Pick<ContentPackageInputs, 'onboarding' | 'copyInput' | 'workspaceScope' | 'contentBrief'>,
  brief: string,
  patch: Partial<OnboardingState> = {},
): ContentPackage {
  const { onboarding, copyInput, workspaceScope } = inputs;
  const state = { ...onboarding, ...patch };
  const platform = state.channels[0] || copyInput.platform || '小红书';
  const brandName = state.brandName || copyInput.brandName || workspaceScope?.project.name || '品牌';
  const coreBrief = brief.trim() || state.brief || workspaceScope?.project.brief || copyInput.description;
  const tags = [state.useCase, platform, state.industry, '品牌内容包']
    .filter(Boolean)
    .map((item) => item.replace(/\s+/g, ''));

  return {
    platform,
    title: `${brandName}｜${state.useCase}内容包`,
    body: `面向${state.audience || '目标用户'}，围绕"${coreBrief}"展开内容。语调保持${state.tone || '清晰专业'}，突出 ${state.industry || brandName} 的关键价值，并主动避开 ${state.forbiddenWords || '夸张承诺'} 等表达。`,
    tags,
    imagePrompt: `${brandName} 的${state.useCase}营销主视觉，渠道为${platform}，目标人群是${state.audience}，风格${state.tone}，包含清晰产品场景和品牌规范，4:5`,
    storyboard: [
      `镜头 1：展示${brandName}所处使用场景，点出用户真实问题。`,
      `镜头 2：用 2-3 个画面说明核心卖点与差异化理由。`,
      `镜头 3：给出行动建议，引导收藏、咨询或进入活动页面。`,
    ],
    voiceover: `${brandName} 为${state.audience || '运营团队'}准备了一套${state.useCase}内容包，从 brief 到审核建议一次完成。`,
    reviewAdvice: [
      '检查是否符合品牌语调和禁用词要求',
      `确认${platform}首屏标题长度和标签数量`,
      '保存人工修改，作为本项目下次生成偏好',
    ],
    exportFormats: ['Markdown', 'Docx', 'CSV'],
    version: 'AI 初稿' as const,
  };
}

export function buildContentPackageRequest(inputs: ContentPackageInputs & { username: string | null; storyboardDuration: number }) {
  const { onboarding, copyInput, contentBrief, workspaceScope, username, storyboardDuration } = inputs;
  return {
    brief: contentBrief,
    brand_name: onboarding.brandName || copyInput.brandName || workspaceScope?.project.name || 'Marketing Hub',
    use_case: onboarding.useCase,
    industry: onboarding.industry,
    audience: onboarding.audience,
    tone: onboarding.tone || copyInput.tone,
    forbidden_words: onboarding.forbiddenWords,
    reference_links: onboarding.referenceLinks,
    channels: onboarding.channels,
    template: onboarding.template,
    platform: onboarding.channels[0] || copyInput.platform,
    duration: storyboardDuration,
    username: username || 'ROOT',
    organization: workspaceScope?.organization.slug,
    project: workspaceScope?.project.slug,
    campaign: workspaceScope?.campaign.id,
  };
}

interface UseContentPackageOptions {
  setLoading: (loading: boolean) => void;
  setAgentLogs: React.Dispatch<React.SetStateAction<string[]>>;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  onApplied: (pkg: ContentPackage) => void;
}

export function useContentPackageActions({
  setLoading,
  setAgentLogs,
  triggerToast,
  onApplied,
}: UseContentPackageOptions) {
  const generate = useCallback(async (payload: Record<string, unknown>) => {
    setLoading(true);
    setAgentLogs(['正在调用 AI 生成内容包（文案 + 分镜）...', '正在根据 brief 和品牌记忆编排任务。']);
    try {
      const res = await apiFetch('/generate/content-package/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || `生成失败 (${res.status})`);
      }
      const data: { content_package: ContentPackage; logs?: string[] } = await res.json();
      onApplied(data.content_package);
      setAgentLogs(data.logs?.length ? data.logs : ['已完成内容包生成。', '可继续改写、保存到资产库或加入审阅。']);
      triggerToast('内容包已生成', 'success');
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : '内容包生成失败', 'error');
      setAgentLogs((prev) => [...prev, '内容包生成失败，请稍后重试。']);
    } finally {
      setLoading(false);
    }
  }, [setLoading, setAgentLogs, triggerToast, onApplied]);

  const rewrite = useCallback(async (payload: Record<string, unknown>, mode: string) => {
    setLoading(true);
    setAgentLogs([`正在按「${mode}」方向改写内容包...`]);
    try {
      const res = await apiFetch('/generate/content-package/', {
        method: 'POST',
        body: JSON.stringify({ ...payload, rewrite_mode: mode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || `改写失败 (${res.status})`);
      }
      const data: { content_package: ContentPackage; logs?: string[] } = await res.json();
      onApplied(data.content_package);
      setAgentLogs(data.logs?.length ? data.logs : ['已完成快捷改写。']);
      triggerToast('已完成快捷改写', 'success');
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : '改写失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [setLoading, setAgentLogs, triggerToast, onApplied]);

  return { generate, rewrite };
}