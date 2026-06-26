export interface AiConfig {
  id: number;
  provider: string;
  provider_display: string;
  api_key?: string;
  api_key_masked?: string;
  base_url: string;
  model_name: string;
  image_model_name?: string;
  video_model_name?: string;
  config_scope?: 'all' | 'text' | 'image' | 'audio' | 'video';
  config_scope_display?: string;
  billing_mode: string;
  is_active: boolean;
}

export interface ProviderModelOption {
  id: string;
  label: string;
  capabilities: Array<'text' | 'image' | 'audio' | 'video' | string>;
}

export interface ProviderModelListResponse {
  provider: string;
  base_url: string;
  source: 'live';
  models: ProviderModelOption[];
  defaults: {
    model_name: string;
    image_model_name: string;
    video_model_name: string;
  };
}

export type ConfigScope = 'all' | 'text' | 'image' | 'audio' | 'video';
export type BillingMode = 'platform' | 'byok';

export const providerDefaultScope = (provider: string): ConfigScope => {
  if (provider === 'anthropic') return 'text';
  return 'all';
};

export const providerSupportsImageConfig = (provider: string) =>
  provider === 'agnes';

export const providerSupportsVideoConfig = (provider: string) =>
  provider === 'agnes';

export const providerSupportsAudioConfig = (provider: string) =>
  provider === 'openai';

export const configScopeLabels: Record<string, string> = {
  all: '全部能力',
  text: '仅文本（文案/分镜）',
  image: '仅图片',
  audio: '仅配音',
  video: '仅视频',
};
