import { useCallback } from 'react';
import { apiFetch, buildErrorToast, parseApiErrorResponse } from '../../hooks/useApi';
import type { TriggerToastFn } from '../../shared/types/toast';
import type { ContentPackage } from '../generation/types';
import type { OnboardingState } from '../onboarding/types';
import type { WorkspaceScope } from '../dashboard/types';

export interface ContentPackageInputs {
  onboarding: OnboardingState;
  contentBrief: string;
  copyInput: { brandName: string; description: string; tone: string; platform: string };
  workspaceScope: WorkspaceScope | null;
  outputLocale: 'zh-CN' | 'en-US';
}

export function buildContentPackageRequest(inputs: ContentPackageInputs & { username: string | null; storyboardDuration: number }) {
  const { onboarding, copyInput, contentBrief, workspaceScope, username, storyboardDuration, outputLocale } = inputs;
  return {
    brief: contentBrief,
    brand_name: onboarding.brandName || copyInput.brandName || workspaceScope?.project.name || '',
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
    output_locale: outputLocale,
    username: username || '',
    organization: workspaceScope?.organization.slug,
    project: workspaceScope?.project.slug,
    campaign: workspaceScope?.campaign?.id,
  };
}

interface UseContentPackageOptions {
  setLoading: (loading: boolean) => void;
  setAgentLogs: React.Dispatch<React.SetStateAction<string[]>>;
  triggerToast: TriggerToastFn;
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
        throw await parseApiErrorResponse(res, '/generate/content-package/');
      }
      const data: { content_package: ContentPackage; logs?: string[] } = await res.json();
      onApplied(data.content_package);
      setAgentLogs(data.logs?.length ? data.logs : ['已完成内容包生成。', '可继续改写、保存到资产库或加入审阅。']);
      triggerToast('内容包已生成', 'success');
    } catch (err) {
      triggerToast(buildErrorToast(err, '内容包生成失败'));
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
        throw await parseApiErrorResponse(res, '/generate/content-package/');
      }
      const data: { content_package: ContentPackage; logs?: string[] } = await res.json();
      onApplied(data.content_package);
      setAgentLogs(data.logs?.length ? data.logs : ['已完成快捷改写。']);
      triggerToast('已完成快捷改写', 'success');
    } catch (err) {
      triggerToast(buildErrorToast(err, '改写失败'));
    } finally {
      setLoading(false);
    }
  }, [setLoading, setAgentLogs, triggerToast, onApplied]);

  return { generate, rewrite };
}
