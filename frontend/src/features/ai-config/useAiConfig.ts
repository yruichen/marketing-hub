import { useCallback, useState } from 'react';
import { apiFetch } from '../../hooks/useApi';
import type { BillingPlanResponse } from '../../types/workspace';
import type { WorkspaceScope } from '../dashboard/types';
import type { AiConfig } from './types';

interface UseAiConfigOptions {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  onWorkspaceRefresh?: () => Promise<void>;
}

export function useAiConfig({ workspaceScope, username, triggerToast, onWorkspaceRefresh }: UseAiConfigOptions) {
  const [aiConfigs, setAiConfigs] = useState<AiConfig[]>([]);
  const [activeConfigForm, setActiveConfigForm] = useState({
    provider: 'mock',
    api_key: '',
    base_url: '',
    model_name: '',
    image_model_name: '',
    video_model_name: '',
    config_scope: 'all' as 'all' | 'text' | 'image' | 'audio' | 'video',
    billing_mode: 'platform',
  });
  const [showKey, setShowKey] = useState(false);
  const [billingPlans, setBillingPlans] = useState<BillingPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await apiFetch('/ai/config/');
      if (res.ok) {
        const data: AiConfig[] = await res.json();
        setAiConfigs(data);
        const active = data.find((c) => c.is_active);
        if (active) {
          setActiveConfigForm({
            provider: active.provider,
            api_key: '',
            base_url: active.base_url,
            model_name: active.model_name,
            image_model_name: active.image_model_name || '',
            video_model_name: active.video_model_name || '',
            config_scope: active.config_scope || (active.provider === 'anthropic' ? 'text' : 'all'),
            billing_mode: active.billing_mode || 'platform',
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch configs', err);
    }
  }, []);

  const fetchBillingPlans = useCallback(async () => {
    try {
      const params = new URLSearchParams({ username: username || 'ROOT' });
      const res = await apiFetch(`/billing/plans/?${params.toString()}`);
      if (res.ok) {
        const data: BillingPlanResponse = await res.json();
        setBillingPlans(data);
      }
    } catch (err) {
      console.error('Failed to fetch billing plans', err);
    }
  }, [username]);

  const handleSaveConfig = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch('/ai/config/', {
        method: 'POST',
        body: JSON.stringify({
          ...activeConfigForm,
          ...(activeConfigForm.api_key.trim() ? { api_key: activeConfigForm.api_key.trim() } : {}),
          username: username || 'ROOT',
        }),
      });
      if (res.ok) {
        triggerToast('AI 接口配置保存并激活成功', 'success');
        await fetchConfigs();
      } else {
        const data = await res.json().catch(() => ({}));
        triggerToast(data.detail || data.error || `配置保存失败 (${res.status})`, 'error');
      }
    } catch {
      triggerToast('配置保存失败，连接异常', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeConfigForm, username, triggerToast, fetchConfigs]);

  const handleSelectPlan = useCallback(async (plan: 'free' | 'pro' | 'enterprise') => {
    setLoading(true);
    try {
      const res = await apiFetch('/billing/plans/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username || 'ROOT', plan }),
      });
      if (!res.ok) throw new Error('Plan update failed');
      const data: BillingPlanResponse = await res.json();
      setBillingPlans(data);
      if (onWorkspaceRefresh) {
        await onWorkspaceRefresh();
      }
      triggerToast('订阅方案已更新', 'success');
    } catch {
      triggerToast('订阅方案更新失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [username, triggerToast, onWorkspaceRefresh]);

  void workspaceScope;

  return {
    aiConfigs,
    activeConfigForm,
    setActiveConfigForm,
    showKey,
    setShowKey,
    billingPlans,
    loading,
    setLoading,
    fetchConfigs,
    fetchBillingPlans,
    handleSaveConfig,
    handleSelectPlan,
  };
}