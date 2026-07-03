import {
  Copy,
  Film,
  Image as ImageIcon,
  Mic,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react';
import type { BrandContext, WorkflowEdge, WorkflowNode } from '../../types/workspace';

export type NodeType = 'context' | 'copy' | 'image_prompt' | 'image_generation' | 'storyboard' | 'video_generation' | 'audio' | 'retrieval' | 'review' | 'custom_agent';
export type LegacyNodeType = NodeType | 'image' | 'rag_search' | 'video';

export type NodePreset = {
  type: NodeType;
  label: string;
  icon: typeof Settings2;
  width: number;
  height: number;
};

export const presets: NodePreset[] = [
  { type: 'context', label: '读取品牌记忆', icon: Settings2, width: 320, height: 360 },
  { type: 'copy', label: '写渠道文案', icon: Copy, width: 320, height: 360 },
  { type: 'image_prompt', label: '生成图片说明', icon: Sparkles, width: 320, height: 360 },
  { type: 'image_generation', label: '生成配图', icon: ImageIcon, width: 320, height: 360 },
  { type: 'storyboard', label: '生成分镜脚本', icon: Film, width: 320, height: 360 },
  { type: 'video_generation', label: '生成视频', icon: Video, width: 320, height: 360 },
  { type: 'audio', label: '合成配音', icon: Mic, width: 320, height: 360 },
  { type: 'retrieval', label: '素材组', icon: Search, width: 320, height: 360 },
  { type: 'review', label: '内容审阅', icon: ShieldCheck, width: 320, height: 360 },
  { type: 'custom_agent', label: '自定义步骤', icon: Sparkles, width: 320, height: 360 },
];

export const nodeTypeDescriptions: Record<string, string> = {
  context: '读取当前项目的品牌、受众、语调和禁区。',
  copy: '按渠道规则生成标题、正文、标签和 CTA。',
  image_prompt: '把文案转成可用于生图的视觉描述。',
  image_generation: '调用图片模型生成可保存的视觉资产。',
  storyboard: '把主题拆成镜头、旁白和时长。',
  video_generation: '根据提示词、分镜或参考图生成视频。',
  audio: '将口播文本转成音频资产。',
  retrieval: '绑定参考素材，并从品牌记忆、资产库和授权资料里找素材。',
  rag_search: '从品牌记忆、资产库和授权资料里找素材。',
  review: '检查禁用词、品牌一致性和渠道规则。',
  custom_agent: '高级用户定义自己的输入、提示词和输出。',
};

export const nodeTypeOutputs: Record<string, string> = {
  context: '品牌摘要、语调、受众、禁用词',
  copy: '标题、正文、标签、CTA',
  image_prompt: '图片 prompt、负面提示词、画幅比例',
  image_generation: '图片资产、图片 URL、修订 prompt',
  storyboard: '分镜镜头、旁白、总时长',
  video_generation: '视频资产、视频 URL、缩略图',
  audio: '音频资产、音频 URL、字幕时间线',
  retrieval: '参考素材、洞察、可复用角度',
  rag_search: '参考素材、洞察、可复用角度',
  review: '风险项、品牌一致性评分、渠道规则建议',
  custom_agent: '自定义响应和结构化输出',
};

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
  if (type === 'copy') return { tone: brandContext.tone || '清晰专业', platform: 'Xiaohongshu' };
  if (type === 'image_prompt') {
    return {
      style_skill: 'editorial_magazine',
      aspect_ratio: '1:1',
      prompt: '',
      negative_prompt: '低清晰度、夸张承诺、品牌不一致、文字错误、多余手指',
    };
  }
  if (type === 'image_generation') return { model: 'image-default', failure_strategy: '失败后保留提示词并重试一次' };
  if (type === 'storyboard') return { duration: 30, target_audience: brandContext.audience || '' };
  if (type === 'video_generation') return { aspect_ratio: '9:16', duration_cap: 30, model: 'agnes-video-v2.0', failure_strategy: '失败后重试一次' };
  if (type === 'audio') return { voice_id: 'female_warm', speed: 1 };
  if (type === 'retrieval') return { retrieval_scope: '品牌记忆和资产库', query: brandContext.campaign_goal || '', reference_urls: [] };
  if (type === 'review') return { forbidden_words: '绝对、第一、包治', channel_rules: '平台基础合规规则' };
  if (type === 'custom_agent') return { name: '自定义智能体', icon: 'Sparkles', prompt: '', input_fields: 'brief, brand_context', output_schema_text: '{ "response": "string" }', model: '', temperature: 0.7, failure_strategy: '重试一次后跳过' };
  return { summary: brandContext.campaign_goal || '' };
};

export const defaultNodes = (projectName: string): WorkflowNode[] => [
  {
    id: 'brand-brief', type: 'context', label: '读取品牌记忆', x: 72, y: 118, width: 320, height: 360, status: 'idle',
    config: { summary: `${projectName} 品牌上下文`, input_schema: {}, output_schema: ioSchema.context.output },
    output: {}, input_schema: ioSchema.context.input, output_schema: ioSchema.context.output,
  },
  {
    id: 'copy-agent', type: 'copy', label: '写渠道文案', x: 448, y: 98, width: 320, height: 360, status: 'idle',
    config: { tone: '清晰专业', platform: 'Xiaohongshu', input_schema: ioSchema.copy.input, output_schema: ioSchema.copy.output },
    output: {}, input_schema: ioSchema.copy.input, output_schema: ioSchema.copy.output,
  },
  {
    id: 'image-prompt-agent', type: 'image_prompt', label: '生成图片说明', x: 824, y: 116, width: 320, height: 360, status: 'idle',
    config: { style_skill: 'editorial_magazine', aspect_ratio: '1:1', negative_prompt: '低清晰度、夸张承诺、品牌不一致', input_schema: ioSchema.image_prompt.input, output_schema: ioSchema.image_prompt.output },
    output: {}, input_schema: ioSchema.image_prompt.input, output_schema: ioSchema.image_prompt.output,
  },
  {
    id: 'review-agent', type: 'review', label: '内容审阅', x: 448, y: 500, width: 320, height: 360, status: 'idle',
    config: { forbidden_words: '绝对、第一、包治', channel_rules: '平台基础合规规则', input_schema: ioSchema.review.input, output_schema: ioSchema.review.output },
    output: {}, input_schema: ioSchema.review.input, output_schema: ioSchema.review.output,
  },
];

export const defaultEdges: WorkflowEdge[] = [
  { id: 'edge-brand-copy', source: 'brand-brief', target: 'copy-agent' },
  { id: 'edge-copy-image-prompt', source: 'copy-agent', target: 'image-prompt-agent' },
  { id: 'edge-copy-review', source: 'copy-agent', target: 'review-agent' },
];

export const statusLabels: Record<string, string> = {
  idle: '未运行', queued: '排队', running: '运行', succeeded: '成功', failed: '失败', skipped: '跳过',
};

export const nodeTypeLabels: Record<string, string> = {
  context: '读取品牌记忆', copy: '写渠道文案', image_prompt: '生成图片说明', image_generation: '生成配图',
  image: '生成配图', storyboard: '生成分镜脚本', video_generation: '生成视频', video: '生成视频', audio: '合成配音', retrieval: '素材组',
  rag_search: '素材组', review: '内容审阅', custom_agent: '自定义步骤',
};
