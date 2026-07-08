import { useCallback, useState } from 'react';
import { apiFetch, buildErrorToast, parseApiErrorResponse } from '../../hooks/useApi';
import type { TriggerToastFn } from '../../shared/types/toast';
import type { BillingPlanResponse } from '../../types/workspace';
import type { WorkspaceScope } from '../dashboard/types';
import type { AiConfig, ProviderModelListResponse, ProviderModelOption } from './types';

const DEMO_USERNAME = import.meta.env.VITE_DEMO_USERNAME || 'DEMO';

interface UseAiConfigOptions {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  triggerToast: TriggerToastFn;
  /** Platform staff only — org admins must use BYOK. */
  canManagePlatformConfig?: boolean;
}

export function useAiConfig({
  workspaceScope,
  username,
  triggerToast,
  canManagePlatformConfig = false,
}: UseAiConfigOptions) {
  const organizationSlug = workspaceScope?.organization.slug;
  const [aiConfigs, setAiConfigs] = useState<AiConfig[]>([]);
  const [activeConfigForm, setActiveConfigForm] = useState({
    provider: 'agnes',
    api_key: '',
    base_url: '',
    model_name: '',
    image_model_name: '',
    video_model_name: '',
    config_scope: 'all' as 'all' | 'text' | 'image' | 'audio' | 'video',
    billing_mode: 'byok',
  });
  const [showKey, setShowKey] = useState(false);
  const [billingPlans, setBillingPlans] = useState<BillingPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<ProviderModelOption[]>([]);

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await apiFetch('/ai/config/');
      if (res.ok) {
        const data: AiConfig[] = await res.json();
        const productionConfigs = data.filter((config) => config.provider !== 'mock');
        setAiConfigs(productionConfigs);
        const orgScopedActive = productionConfigs.find(
          (c) => c.is_active && c.billing_mode === 'byok',
        );
        const active = orgScopedActive
          ?? productionConfigs.find((c) => c.is_active);
        if (active) {
          const billingMode = canManagePlatformConfig
            ? (active.billing_mode || 'platform')
            : 'byok';
          setActiveConfigForm({
            provider: active.provider,
            api_key: '',
            base_url: active.base_url,
            model_name: active.model_name,
            image_model_name: active.image_model_name || '',
            video_model_name: active.video_model_name || '',
            config_scope: active.config_scope || (active.provider === 'anthropic' ? 'text' : 'all'),
            billing_mode: billingMode,
          });
          setModelOptions([]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch configs', err);
    }
  }, [canManagePlatformConfig]);

  const fetchBillingPlans = useCallback(async () => {
    try {
      const params = new URLSearchParams({ username: username || DEMO_USERNAME });
      const res = await apiFetch(`/billing/plans/?${params.toString()}`);
      if (res.ok) {
        const data: BillingPlanResponse = await res.json();
        setBillingPlans(data);
      }
    } catch (err) {
      console.error('Failed to fetch billing plans', err);
    }
  }, [username]);

  const effectiveBillingMode = canManagePlatformConfig
    ? activeConfigForm.billing_mode
    : 'byok';

  const handleSaveConfig = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch('/ai/config/', {
        method: 'POST',
        body: JSON.stringify({
          ...activeConfigForm,
          billing_mode: effectiveBillingMode,
          ...(activeConfigForm.api_key.trim() ? { api_key: activeConfigForm.api_key.trim() } : {}),
          username: username || DEMO_USERNAME,
          organization: organizationSlug,
        }),
      });
      if (res.ok) {
        triggerToast('AI 接口配置保存并激活成功', 'success');
        await fetchConfigs();
      } else {
        const err = await parseApiErrorResponse(res, '/ai/config/');
        triggerToast(buildErrorToast(err, '配置保存失败'));
      }
    } catch (err) {
      triggerToast(buildErrorToast(err, '配置保存失败', '连接异常，请稍后重试'));
    } finally {
      setLoading(false);
    }
  }, [activeConfigForm, effectiveBillingMode, username, organizationSlug, triggerToast, fetchConfigs]);

  const handleFetchModels = useCallback(async () => {
    setFetchingModels(true);
    try {
      const res = await apiFetch('/ai/config/models/', {
        method: 'POST',
        body: JSON.stringify({
          ...activeConfigForm,
          billing_mode: effectiveBillingMode,
          ...(activeConfigForm.api_key.trim() ? { api_key: activeConfigForm.api_key.trim() } : {}),
          username: username || DEMO_USERNAME,
          organization: organizationSlug,
        }),
      });
      if (!res.ok) {
        const err = await parseApiErrorResponse(res, '/ai/config/models/');
        triggerToast(buildErrorToast(err, '模型列表获取失败'));
        return;
      }
      const data: ProviderModelListResponse = await res.json();
      setModelOptions(data.models || []);
      setActiveConfigForm((current) => ({
        ...current,
        base_url: current.base_url || data.base_url || '',
        model_name: data.defaults.model_name || current.model_name,
        image_model_name: data.defaults.image_model_name || current.image_model_name,
        video_model_name: data.defaults.video_model_name || current.video_model_name,
      }));
      triggerToast(`已从 ${activeConfigForm.provider} 获取 ${data.models.length} 个模型`, 'success');
    } catch (err) {
      triggerToast(buildErrorToast(err, '模型列表获取失败', '连接异常，请稍后重试'));
    } finally {
      setFetchingModels(false);
    }
  }, [activeConfigForm, effectiveBillingMode, username, organizationSlug, triggerToast]);

  return {
    aiConfigs,
    activeConfigForm,
    setActiveConfigForm,
    showKey,
    setShowKey,
    billingPlans,
    loading,
    fetchingModels,
    modelOptions,
    setModelOptions,
    setLoading,
    fetchConfigs,
    fetchBillingPlans,
    handleFetchModels,
    handleSaveConfig,
  };
}
