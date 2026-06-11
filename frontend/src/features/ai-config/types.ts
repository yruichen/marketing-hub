export interface AiConfig {
  id: number;
  provider: string;
  provider_display: string;
  api_key?: string;
  api_key_masked?: string;
  base_url: string;
  model_name: string;
  image_model_name?: string;
  config_scope?: 'all' | 'text' | 'image' | 'audio';
  config_scope_display?: string;
  billing_mode: string;
  is_active: boolean;
}

export type ConfigScope = 'all' | 'text' | 'image' | 'audio';
export type BillingMode = 'platform' | 'byok';

export const providerDefaultScope = (provider: string): ConfigScope => {
  if (provider === 'anthropic') return 'text';
  return 'all';
};

export const providerSupportsImageConfig = (provider: string) =>
  ['mock', 'agnes', 'openai', 'gemini'].includes(provider);

export const configScopeLabels: Record<string, string> = {
  all: '全部能力',
  text: '仅文本（文案/分镜）',
  image: '仅图片',
  audio: '仅配音',
};