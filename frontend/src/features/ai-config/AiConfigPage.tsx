import { useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useAiConfig } from './useAiConfig';
import {
  providerDefaultScope,
  providerSupportsImageConfig,
  providerSupportsVideoConfig,
  configScopeLabels,
} from './types';
import type { WorkspaceScope } from '../dashboard/types';

interface AiConfigPageProps {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  onWorkspaceRefresh?: () => Promise<void>;
}

export function AiConfigPage({
  workspaceScope,
  username,
  triggerToast,
  onWorkspaceRefresh,
}: AiConfigPageProps) {
  const {
    aiConfigs,
    activeConfigForm,
    setActiveConfigForm,
    showKey,
    setShowKey,
    billingPlans,
    loading,
    fetchConfigs,
    fetchBillingPlans,
    handleSaveConfig,
    handleSelectPlan,
  } = useAiConfig({ workspaceScope, username, triggerToast, onWorkspaceRefresh });

  useEffect(() => {
    void fetchConfigs();
    void fetchBillingPlans();
  }, [fetchConfigs, fetchBillingPlans]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start font-mono">
      <form onSubmit={handleSaveConfig} className="col-span-1 lg:col-span-6 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial relative flex flex-col gap-5">
        <div className="flex justify-center border-b border-[var(--editorial-stroke)] pb-4">
          <Sparkles className="h-6 w-6 text-[var(--editorial-text)]" />
        </div>

        <h3 className="text-sm font-black text-[var(--editorial-text)] border-b border-[var(--editorial-stroke)] pb-2 flex items-center gap-2 font-mono uppercase">
          <span>模型接口与自有密钥</span>
        </h3>

        <div className="flex flex-col gap-1.5">
          <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">选择服务商</label>
          <select
            value={activeConfigForm.provider}
            onChange={(e) => {
              const provider = e.target.value;
              setActiveConfigForm({
                ...activeConfigForm,
                provider,
                config_scope: providerDefaultScope(provider),
              });
            }}
            className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
          >
            <option value="mock">演示模式</option>
            <option value="agnes">Agnes AI</option>
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">配置用途</label>
          <select
            value={activeConfigForm.config_scope}
            onChange={(e) => setActiveConfigForm({
              ...activeConfigForm,
              config_scope: e.target.value as 'all' | 'text' | 'image' | 'audio' | 'video',
            })}
            className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
          >
            {Object.entries(configScopeLabels)
              .filter(([value]) => {
                if (value === 'image' && !providerSupportsImageConfig(activeConfigForm.provider)) return false;
                if (value === 'video' && !providerSupportsVideoConfig(activeConfigForm.provider)) return false;
                if (activeConfigForm.provider === 'anthropic' && value !== 'text') return false;
                return true;
              })
              .map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <p className="text-[9px] text-[var(--editorial-text-gray)] leading-relaxed">
            不同用途可分别保存并同时激活。例如：OpenAI 仅文本 + Agnes 仅图片 + Agnes 仅视频。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { id: 'platform', label: '使用平台额度' },
            { id: 'byok', label: '使用自有密钥' },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setActiveConfigForm({ ...activeConfigForm, billing_mode: mode.id })}
              className={`border px-3 py-2 text-[10px] font-black ${
                activeConfigForm.billing_mode === mode.id
                  ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-unselected)]'
                  : 'border-[var(--editorial-stroke)]/40'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {activeConfigForm.provider !== 'mock' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">API KEY 密钥</label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={activeConfigForm.api_key}
                  onChange={(e) => setActiveConfigForm({ ...activeConfigForm, api_key: e.target.value })}
                  className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono"
                  placeholder="请输入 API Key（留空则保留已保存的密钥）"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 text-[9px] text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)] cursor-pointer font-bold"
                >
                  {showKey ? '[HIDE]' : '[SHOW]'}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider flex items-center justify-between font-mono">
                <span>自定义代理网关 Base URL</span>
                <span className="text-[8px] text-[var(--editorial-text-gray)] lowercase tracking-normal">可选配置</span>
              </label>
              <input
                type="url"
                value={activeConfigForm.base_url}
                onChange={(e) => setActiveConfigForm({ ...activeConfigForm, base_url: e.target.value })}
                className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono"
                placeholder={
                  activeConfigForm.provider === 'agnes'
                    ? 'https://apihub.agnes-ai.com/v1'
                    : 'e.g. https://api.openai-proxy.org/v1'
                }
              />
            </div>

            {activeConfigForm.config_scope !== 'image' && activeConfigForm.config_scope !== 'video' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider flex items-center justify-between font-mono">
                  <span>文本模型名称</span>
                  <span className="text-[8px] text-[var(--editorial-text-gray)] lowercase tracking-normal">文案 / 分镜</span>
                </label>
                <input
                  type="text"
                  value={activeConfigForm.model_name}
                  onChange={(e) => setActiveConfigForm({ ...activeConfigForm, model_name: e.target.value })}
                  className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono"
                  placeholder={
                    activeConfigForm.provider === 'agnes'
                      ? 'agnes-2.0-flash'
                      : activeConfigForm.provider === 'gemini'
                        ? 'gemini-1.5-flash'
                        : activeConfigForm.provider === 'anthropic'
                          ? 'claude-3-5-sonnet'
                          : 'gpt-4o-mini'
                  }
                />
              </div>
            )}

            {providerSupportsImageConfig(activeConfigForm.provider)
              && (activeConfigForm.config_scope === 'all' || activeConfigForm.config_scope === 'image') && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider flex items-center justify-between font-mono">
                  <span>图片模型名称</span>
                  <span className="text-[8px] text-[var(--editorial-text-gray)] lowercase tracking-normal">图片任务专用</span>
                </label>
                <input
                  type="text"
                  value={activeConfigForm.image_model_name}
                  onChange={(e) => setActiveConfigForm({ ...activeConfigForm, image_model_name: e.target.value })}
                  className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono"
                  placeholder={
                    activeConfigForm.provider === 'agnes'
                      ? 'agnes-image-2.0-flash'
                      : activeConfigForm.provider === 'openai'
                        ? 'dall-e-3'
                        : 'image-model'
                  }
                />
              </div>
            )}

            {providerSupportsVideoConfig(activeConfigForm.provider)
              && (activeConfigForm.config_scope === 'all' || activeConfigForm.config_scope === 'video') && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider flex items-center justify-between font-mono">
                  <span>视频模型名称</span>
                  <span className="text-[8px] text-[var(--editorial-text-gray)] lowercase tracking-normal">视频任务专用</span>
                </label>
                <input
                  type="text"
                  value={activeConfigForm.video_model_name}
                  onChange={(e) => setActiveConfigForm({ ...activeConfigForm, video_model_name: e.target.value })}
                  className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono"
                  placeholder={
                    activeConfigForm.provider === 'agnes'
                      ? 'agnes-video-v2.0'
                      : 'mock-video'
                  }
                />
              </div>
            )}
          </>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
        >
          {loading ? (
            <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          ) : null}
          <span>保存并激活配置</span>
        </button>
      </form>

      <div className="col-span-1 lg:col-span-6 flex flex-col gap-6 font-mono">
        <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial relative flex flex-col gap-4">
          <h4 className="text-sm font-black text-[var(--editorial-text)] border-b border-[var(--editorial-stroke)] pb-2 flex items-center gap-2 font-mono uppercase">
            <span>订阅与接口状态</span>
          </h4>

          {billingPlans && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(['free', 'pro', 'enterprise'] as const).map((planKey) => {
                const plan = billingPlans.plans[planKey];
                const active = billingPlans.current_plan === planKey;
                return (
                  <button
                    key={planKey}
                    type="button"
                    onClick={() => handleSelectPlan(planKey)}
                    className={`text-left border-1.5 p-3 transition-all ${
                      active
                        ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/40 shadow-editorial-sm'
                        : 'border-dashed border-[var(--editorial-stroke)]/40 hover:border-[var(--editorial-stroke)]'
                    }`}
                  >
                    <span className="block text-xs font-black">{plan.name}</span>
                    <span className="block mt-2 text-[9px] text-[var(--editorial-text-gray)]">
                      {plan.project_limit >= 9999 ? '不限项目' : `${plan.project_limit} 个项目`} / {plan.storage_gb}GB
                    </span>
                    <span className="block mt-1 text-[9px] text-[var(--editorial-text-gray)]">
                      自有密钥抵扣 {plan.byok_discount}
                    </span>
                  </button>
                );
              })}
              <div className="md:col-span-3 text-[10px] text-[var(--editorial-text-gray)]">
                当前项目数：{billingPlans.project_count} / {billingPlans.current_limits.project_limit >= 9999 ? '不限' : billingPlans.current_limits.project_limit}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {aiConfigs.map((config) => (
              <div key={config.id} className={`p-4 border-1.5 flex items-center justify-between ${
                config.is_active
                  ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/40 text-[var(--editorial-text)]'
                  : 'border-dashed border-[var(--editorial-stroke)]/40 bg-[var(--editorial-paper)] text-[var(--editorial-text-gray)]'
              }`}>
                <div>
                  <span className="text-xs font-black block">{config.provider_display}</span>
                  <div className="flex items-center gap-2.5 mt-1 text-[8px] font-bold uppercase font-mono flex-wrap">
                    <span>{config.config_scope_display || configScopeLabels[config.config_scope || 'all']}</span>
                    <span>•</span>
                    <span>Key: {config.api_key_masked || 'Unset'}</span>
                    {config.model_name && !['image', 'video'].includes(config.config_scope || 'all') && (
                      <>
                        <span>•</span>
                        <span>Text: {config.model_name}</span>
                      </>
                    )}
                    {config.image_model_name && (
                      <>
                        <span>•</span>
                        <span>Image: {config.image_model_name}</span>
                      </>
                    )}
                    {config.video_model_name && (
                      <>
                        <span>•</span>
                        <span>Video: {config.video_model_name}</span>
                      </>
                    )}
                    <span>•</span>
                    <span>{config.billing_mode === 'byok' ? '自有密钥' : '平台额度'}</span>
                  </div>
                </div>
                {config.is_active ? (
                  <span className="bg-[var(--editorial-stroke)] text-[var(--editorial-bg)] text-[8px] font-black px-2 py-0.5 border border-[var(--editorial-stroke)]">
                    ACTIVE
                  </span>
                ) : (
                  <span className="bg-transparent text-[var(--editorial-text-gray)] text-[8px] font-bold px-2 py-0.5 border border-dashed border-[var(--editorial-stroke)]/40">
                    STANDBY
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="border border-dashed border-[var(--editorial-stroke)]/40 bg-[var(--editorial-bg)]/40 p-4 text-[10px] text-[var(--editorial-text-gray)] font-medium leading-relaxed mt-2">
            <span className="font-bold text-[var(--editorial-text)] block mb-1">计费说明</span>
            1. 使用自有密钥时，平台只保留必要的配置记录，生成消耗走您自己的模型账户。
            <br />
            2. 未配置密钥时，系统会使用演示模式，便于本地试用和流程演练。
            <br />
            3. 文本与图片可分别配置不同服务商，同一用途下保存时会替换该用途的旧配置。
          </div>
        </div>
      </div>
    </div>
  );
}