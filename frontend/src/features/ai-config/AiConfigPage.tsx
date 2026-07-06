import { useEffect, type FormEvent } from 'react';
import { KeyRound, Lock, PlugZap, RefreshCw, Sparkles } from 'lucide-react';
import { useAiConfig } from './useAiConfig';
import {
  providerDefaultScope,
  providerSupportsAudioConfig,
  providerSupportsImageConfig,
  providerSupportsVideoConfig,
  configScopeLabels,
} from './types';
import type { WorkspaceScope } from '../dashboard/types';
import type { FeatureEntitlements } from '../../types/workspace';

interface AiConfigPageProps {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  onWorkspaceRefresh?: () => Promise<void>;
  featureEntitlements?: Partial<FeatureEntitlements>;
  onOpenBilling?: () => void;
}

export function AiConfigPage({
  workspaceScope,
  username,
  triggerToast,
  onWorkspaceRefresh: _onWorkspaceRefresh,
  featureEntitlements,
  onOpenBilling,
}: AiConfigPageProps) {
  void _onWorkspaceRefresh;
  const {
    aiConfigs,
    activeConfigForm,
    setActiveConfigForm,
    showKey,
    setShowKey,
    loading,
    fetchingModels,
    modelOptions,
    setModelOptions,
    fetchConfigs,
    handleFetchModels,
    handleSaveConfig,
  } = useAiConfig({ workspaceScope, username, triggerToast });

  useEffect(() => {
    void fetchConfigs();
  }, [fetchConfigs]);

  const availableScopes = Object.entries(configScopeLabels).filter(([value]) => {
    if (value === 'image' && !providerSupportsImageConfig(activeConfigForm.provider)) return false;
    if (value === 'video' && !providerSupportsVideoConfig(activeConfigForm.provider)) return false;
    if (value === 'audio' && !providerSupportsAudioConfig(activeConfigForm.provider)) return false;
    if (activeConfigForm.provider === 'anthropic' && value !== 'text') return false;
    return true;
  });

  const showTextModel = activeConfigForm.config_scope !== 'image'
    && activeConfigForm.config_scope !== 'video';
  const showImageModel = providerSupportsImageConfig(activeConfigForm.provider)
    && (activeConfigForm.config_scope === 'all' || activeConfigForm.config_scope === 'image');
  const showVideoModel = providerSupportsVideoConfig(activeConfigForm.provider)
    && (activeConfigForm.config_scope === 'all' || activeConfigForm.config_scope === 'video');
  const textModelOptions = modelOptions.filter((model) => model.capabilities.includes('text'));
  const imageModelOptions = modelOptions.filter((model) => model.capabilities.includes('image'));
  const videoModelOptions = modelOptions.filter((model) => model.capabilities.includes('video'));
  const canWriteAiConfig = true;
  const canUseByok = featureEntitlements?.byok_config ?? true;
  const openProGate = () => {
    triggerToast('AI 设置和 BYOK 配置需要 Pro。', 'info');
    onOpenBilling?.();
  };
  const submitConfig = (event: FormEvent) => {
    if (!canWriteAiConfig) {
      event.preventDefault();
      openProGate();
      return;
    }
    void handleSaveConfig(event);
  };
  const fetchModels = () => {
    if (!canWriteAiConfig) {
      openProGate();
      return;
    }
    void handleFetchModels();
  };

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-5 overflow-hidden font-mono xl:grid-cols-[minmax(0,1fr)_360px]">
      <form
        onSubmit={submitConfig}
        className="min-h-0 overflow-y-auto rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-panel)]"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
          <div>
            <span className="inline-flex h-7 items-center rounded-full bg-[var(--brand-accent)] px-3 text-[9px] font-black uppercase tracking-[0.16em] text-black">
              AI Gateway
            </span>
            <h3 className="serif-header mt-3 text-2xl font-black text-[var(--editorial-text)]">模型接口设置</h3>
            <p className="mt-1 max-w-2xl text-xs leading-6 text-[var(--editorial-text-gray)]">
              这里只管理 Provider、用途、模型名和 API Key。套餐、额度、成本请到「计费」页查看。
            </p>
          </div>
          <Sparkles className="h-6 w-6 shrink-0 text-[var(--brand-accent-strong)]" />
        </div>

        {!canWriteAiConfig ? (
          <div className="mb-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 text-xs leading-6 text-[var(--editorial-text-gray)]">
            <span className="mb-1 flex items-center gap-2 font-black text-[var(--editorial-text)]">
              <Lock className="h-3.5 w-3.5" />
              Pro AI Gateway
            </span>
            免费用户使用平台默认模型；自定义 Provider、获取模型列表、BYOK 和激活配置需要 Pro。
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)]">
            1. 服务商
            <select
              value={activeConfigForm.provider}
              onChange={(event) => {
                const provider = event.target.value;
                setModelOptions([]);
                setActiveConfigForm({
                  ...activeConfigForm,
                  provider,
                  config_scope: providerDefaultScope(provider),
                  model_name: '',
                  image_model_name: '',
                  video_model_name: '',
                });
              }}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2 text-xs font-bold text-[var(--editorial-text)] focus:outline-none"
            >
              <option value="agnes">Agnes AI</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)]">
            2. 用途
            <select
              value={activeConfigForm.config_scope}
              onChange={(event) => setActiveConfigForm({
                ...activeConfigForm,
                config_scope: event.target.value as 'all' | 'text' | 'image' | 'audio' | 'video',
              })}
              className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2 text-xs font-bold text-[var(--editorial-text)] focus:outline-none"
            >
              {availableScopes.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            { id: 'byok', label: '自有 API Key', hint: '输入后可立即获取模型' },
            { id: 'platform', label: '平台密钥', hint: '使用服务端已配置密钥' },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => {
                if (mode.id === 'byok' && !canUseByok) {
                  openProGate();
                  return;
                }
                setActiveConfigForm({ ...activeConfigForm, billing_mode: mode.id });
              }}
              className={`rounded-2xl border px-3 py-3 text-left transition-all ${
                activeConfigForm.billing_mode === mode.id
                  ? 'border-[var(--brand-accent-strong)] bg-[var(--brand-accent-soft)] text-[var(--editorial-text)]'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)]'
              }`}
            >
              <span className="block text-[11px] font-black">{mode.label}</span>
              <span className="mt-1 block text-[9px] font-bold">{mode.hint}</span>
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-4">
          <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)]">
            3. API Key
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={activeConfigForm.api_key}
                onChange={(event) => setActiveConfigForm({ ...activeConfigForm, api_key: event.target.value })}
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2 pr-16 text-xs text-[var(--editorial-text)] focus:outline-none"
                placeholder="留空则使用已保存或服务端配置的密钥"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)]"
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </label>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_160px]">
            <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)]">
              Base URL（可选）
              <input
                type="url"
                value={activeConfigForm.base_url}
                onChange={(event) => setActiveConfigForm({ ...activeConfigForm, base_url: event.target.value })}
                className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--editorial-text)] focus:outline-none"
                placeholder={activeConfigForm.provider === 'agnes' ? 'https://apihub.agnes-ai.com/v1' : 'https://api.example.com/v1'}
              />
            </label>
            <button
              type="button"
              onClick={fetchModels}
              disabled={fetchingModels}
              className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[var(--editorial-stroke)] bg-[var(--brand-accent)] px-3 text-[10px] font-black uppercase tracking-wider text-black shadow-editorial-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {canWriteAiConfig ? <RefreshCw className={`h-3.5 w-3.5 ${fetchingModels ? 'animate-spin' : ''}`} /> : <Lock className="h-3.5 w-3.5" />}
              {canWriteAiConfig ? '获取模型' : 'Pro 获取'}
            </button>
          </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {showTextModel && (
                <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)]">
                  文本模型
                  {textModelOptions.length ? (
                    <select
                      value={activeConfigForm.model_name}
                      onChange={(event) => setActiveConfigForm({ ...activeConfigForm, model_name: event.target.value })}
                      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--editorial-text)] focus:outline-none"
                    >
                      {textModelOptions.map((model) => (
                        <option key={model.id} value={model.id}>{model.label || model.id}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={activeConfigForm.model_name}
                      onChange={(event) => setActiveConfigForm({ ...activeConfigForm, model_name: event.target.value })}
                      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--editorial-text)] focus:outline-none"
                      placeholder="先点击获取模型"
                    />
                  )}
                </label>
              )}
              {showImageModel && (
                <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)]">
                  图片模型
                  {imageModelOptions.length ? (
                    <select
                      value={activeConfigForm.image_model_name}
                      onChange={(event) => setActiveConfigForm({ ...activeConfigForm, image_model_name: event.target.value })}
                      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--editorial-text)] focus:outline-none"
                    >
                      {imageModelOptions.map((model) => (
                        <option key={model.id} value={model.id}>{model.label || model.id}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={activeConfigForm.image_model_name}
                      onChange={(event) => setActiveConfigForm({ ...activeConfigForm, image_model_name: event.target.value })}
                      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--editorial-text)] focus:outline-none"
                      placeholder="先点击获取模型"
                    />
                  )}
                </label>
              )}
              {showVideoModel && (
                <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)]">
                  视频模型
                  {videoModelOptions.length ? (
                    <select
                      value={activeConfigForm.video_model_name}
                      onChange={(event) => setActiveConfigForm({ ...activeConfigForm, video_model_name: event.target.value })}
                      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--editorial-text)] focus:outline-none"
                    >
                      {videoModelOptions.map((model) => (
                        <option key={model.id} value={model.id}>{model.label || model.id}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={activeConfigForm.video_model_name}
                      onChange={(event) => setActiveConfigForm({ ...activeConfigForm, video_model_name: event.target.value })}
                      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-3 py-2 text-xs text-[var(--editorial-text)] focus:outline-none"
                      placeholder="先点击获取模型"
                    />
                  )}
                </label>
              )}
            </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="btn-editorial-primary mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-xs font-black uppercase tracking-wider"
        >
          {loading ? <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : null}
          {!loading && !canWriteAiConfig ? <Lock className="h-3.5 w-3.5" /> : null}
          {canWriteAiConfig ? '保存并激活配置' : '升级 Pro 后配置'}
        </button>
      </form>

      <aside className="min-h-0 overflow-y-auto rounded-3xl border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-panel)]">
        <h4 className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3 text-sm font-black uppercase text-[var(--editorial-text)]">
          <PlugZap className="h-4 w-4 text-[var(--brand-accent-strong)]" />
          当前接口状态
        </h4>

        <div className="mt-4 space-y-3">
          {aiConfigs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 text-xs leading-6 text-[var(--editorial-text-gray)]">
              暂无已保存配置。选择服务商和用途后保存，即可在这里看到启用状态。
            </div>
          ) : aiConfigs.map((config) => (
            <div
              key={config.id}
              className={`rounded-2xl border p-4 ${
                config.is_active
                  ? 'border-[var(--brand-accent-strong)] bg-[var(--brand-accent-soft)]'
                  : 'border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black text-[var(--editorial-text)]">{config.provider_display}</span>
                <span className={`rounded-full px-2 py-1 text-[8px] font-black ${config.is_active ? 'bg-[var(--brand-accent)] text-black' : 'border border-dashed border-[var(--border-subtle)] text-[var(--editorial-text-gray)]'}`}>
                  {config.is_active ? 'ACTIVE' : 'STANDBY'}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[8px] font-bold uppercase text-[var(--editorial-text-gray)]">
                <span>{config.config_scope_display || configScopeLabels[config.config_scope || 'all']}</span>
                <span>Key: {config.api_key_masked || 'Unset'}</span>
                {config.model_name ? <span>Text: {config.model_name}</span> : null}
                {config.image_model_name ? <span>Image: {config.image_model_name}</span> : null}
                {config.video_model_name ? <span>Video: {config.video_model_name}</span> : null}
                <span>{config.billing_mode === 'byok' ? '自有 Key' : '平台托管'}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 text-[10px] font-medium leading-relaxed text-[var(--editorial-text-gray)]">
          <span className="mb-2 flex items-center gap-2 font-black text-[var(--editorial-text)]">
            <KeyRound className="h-3.5 w-3.5" />
            使用建议
          </span>
          文本、图片、视频可以分别配置不同服务商；同一用途保存新配置时，会替换该用途旧激活配置。
          <br />
          套餐、额度、成本和 BYOK 抵扣统一在「计费」页管理。
        </div>
      </aside>
    </div>
  );
}
