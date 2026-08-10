import type { BrandContext } from '../../types/workspace';

export type NodeType = 'context' | 'copy' | 'image_prompt' | 'image_generation' | 'storyboard' | 'video_generation' | 'audio' | 'retrieval' | 'review' | 'custom_agent';
export type LegacyNodeType = NodeType | 'image' | 'rag_search' | 'video';

export const ioSchema: Record<LegacyNodeType, { input: Record<string, string>; output: Record<string, string> }> = {
  context: { input: {}, output: { brand_summary: 'String', tone: 'String', audience: 'String', forbidden_words: 'String[]' } },
  copy: {
    input: { brand_summary: 'String', tone: 'String', audience: 'String' },
    output: { title: 'String', body: 'String', tags: 'String[]', cta: 'String', platform_variants: 'Object' },
  },
  image_prompt: {
    input: { title: 'String', body: 'String', brand_summary: 'String' },
    output: { prompt: 'String', negative_prompt: 'String', aspect_ratio: 'String', style_skill: 'String' },
  },
  image_generation: {
    input: { prompt: 'String', negative_prompt: 'String', aspect_ratio: 'String', style: 'String' },
    output: { image_asset: 'Asset', image_url: 'URL', revised_prompt: 'String' },
  },
  image: {
    input: { prompt: 'String', negative_prompt: 'String', aspect_ratio: 'String', style: 'String' },
    output: { image_asset: 'Asset', image_url: 'URL', revised_prompt: 'String' },
  },
  storyboard: {
    input: { title: 'String', body: 'String', target_audience: 'String' },
    output: { shots: 'Shot[]', duration: 'Number', visuals: 'String[]', voiceover: 'String', transitions: 'String[]' },
  },
  video_generation: {
    input: { scenes: 'Scene[]', audio_url: 'URL', video_topic: 'String' },
    output: { video_asset: 'Asset', video_url: 'URL', thumbnail_url: 'URL', duration_seconds: 'Number' },
  },
  video: {
    input: { scenes: 'Scene[]', audio_url: 'URL', video_topic: 'String' },
    output: { video_asset: 'Asset', video_url: 'URL', thumbnail_url: 'URL', duration_seconds: 'Number' },
  },
  audio: {
    input: { voiceover: 'String', voice_id: 'String', speed: 'Number' },
    output: { audio_asset: 'Asset', audio_url: 'URL', subtitle_timeline: 'Subtitle[]' },
  },
  retrieval: {
    input: { query: 'String', scope: 'String' },
    output: { references: 'Reference[]', insights: 'String[]', brand_memory: 'Object' },
  },
  rag_search: {
    input: { query: 'String', scope: 'String' },
    output: { references: 'Reference[]', insights: 'String[]', brand_memory: 'Object' },
  },
  review: {
    input: { title: 'String', body: 'String', tags: 'String[]' },
    output: { sensitive_word_issues: 'Issue[]', brand_consistency: 'Score', channel_rules: 'Issue[]' },
  },
  custom_agent: {
    input: { input: 'Any' },
    output: { response: 'String', metadata: 'Object' },
  },
};

export const defaultNodeConfig = (type: NodeType, brandContext: BrandContext) => {
  if (type === 'copy') return { tone: brandContext.tone || '', platform: '' };
  if (type === 'image_prompt') return { style_skill: 'editorial_magazine', aspect_ratio: '1:1', prompt: '', negative_prompt: '' };
  if (type === 'image_generation') return { model: '', failure_strategy: 'retry_once' };
  if (type === 'storyboard') return { duration: 30, target_audience: brandContext.audience || '' };
  if (type === 'video_generation') return { aspect_ratio: '9:16', duration_cap: 30, model: '', failure_strategy: 'retry_once' };
  if (type === 'audio') return { voice_id: 'female_warm', speed: 1 };
  if (type === 'retrieval') return { retrieval_scope: 'brand_memory_and_assets', query: brandContext.campaign_goal || '', reference_urls: [] };
  if (type === 'review') return { forbidden_words: '', channel_rules: '' };
  if (type === 'custom_agent') return { name: '', icon: 'Sparkles', prompt: '', input_fields: '', output_schema_text: '{ "response": "string" }', model: '', temperature: 0.7, failure_strategy: 'retry_once_then_skip' };
  return { summary: brandContext.campaign_goal || '' };
};
