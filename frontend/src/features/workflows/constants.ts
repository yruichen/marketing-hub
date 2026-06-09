import {
  Copy,
  Film,
  Image as ImageIcon,
  Mic,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { BrandContext, WorkflowEdge, WorkflowNode } from '../../types/workspace';

export type NodeType = 'context' | 'copy' | 'image_prompt' | 'image_generation' | 'storyboard' | 'audio' | 'retrieval' | 'review' | 'custom_agent';
export type LegacyNodeType = NodeType | 'image' | 'rag_search';

export type NodePreset = {
  type: NodeType;
  label: string;
  icon: typeof Settings2;
  width: number;
  height: number;
};

export const presets: NodePreset[] = [
  { type: 'context', label: '品牌上下文', icon: Settings2, width: 260, height: 166 },
  { type: 'copy', label: '文案节点', icon: Copy, width: 260, height: 166 },
  { type: 'image_prompt', label: '图片提示词', icon: Sparkles, width: 260, height: 166 },
  { type: 'image_generation', label: '图片生成', icon: ImageIcon, width: 260, height: 166 },
  { type: 'storyboard', label: '分镜节点', icon: Film, width: 260, height: 166 },
  { type: 'audio', label: '配音节点', icon: Mic, width: 260, height: 166 },
  { type: 'retrieval', label: '检索节点', icon: Search, width: 260, height: 166 },
  { type: 'review', label: '审核节点', icon: ShieldCheck, width: 260, height: 166 },
  { type: 'custom_agent', label: '自定义智能体', icon: Sparkles, width: 260, height: 176 },
];

export const ioSchema: Record<LegacyNodeType, { input: Record<string, string>; output: Record<string, string> }> = {
  context: { input: {}, output: { brand_summary: 'String', tone: 'String', audience: 'String', forbidden_words: 'String[]' } },
  copy: {
    input: { brand_summary: 'String', tone: 'String', audience: 'String' },
    output: { title: 'String', body: 'String', tags: 'String[]', cta: 'String', platform_variants: 'Object' },
  },
  image_prompt: {
    input: { title: 'String', body: 'String', brand_summary: 'String' },
    output: { prompt: 'String', negative_prompt: 'String', aspect_ratio: 'String', style: 'String' },
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
  if (type === 'image_prompt') return { style: brandContext.visual_style || 'editorial', aspect_ratio: '1:1', prompt: '', negative_prompt: '低清晰度、夸张承诺、品牌不一致' };
  if (type === 'image_generation') return { model: 'image-default', failure_strategy: '失败后保留提示词并重试一次' };
  if (type === 'storyboard') return { duration: 30, target_audience: brandContext.audience || '' };
  if (type === 'audio') return { voice_id: 'female_warm', speed: 1 };
  if (type === 'retrieval') return { retrieval_scope: '品牌记忆和资产库', query: brandContext.campaign_goal || '' };
  if (type === 'review') return { forbidden_words: '绝对、第一、包治', channel_rules: '平台基础合规规则' };
  if (type === 'custom_agent') return { name: '自定义智能体', icon: 'Sparkles', prompt: '', input_fields: 'brief, brand_context', output_schema_text: '{ "response": "string" }', model: '', temperature: 0.7, failure_strategy: '重试一次后跳过' };
  return { summary: brandContext.campaign_goal || '' };
};

export const defaultNodes = (projectName: string): WorkflowNode[] => [
  {
    id: 'brand-brief', type: 'context', label: '品牌上下文', x: 72, y: 118, width: 260, height: 166, status: 'idle',
    config: { summary: `${projectName} 品牌上下文`, input_schema: {}, output_schema: ioSchema.context.output },
    output: {}, input_schema: ioSchema.context.input, output_schema: ioSchema.context.output,
  },
  {
    id: 'copy-agent', type: 'copy', label: '文案节点', x: 384, y: 98, width: 260, height: 166, status: 'idle',
    config: { tone: '清晰专业', platform: 'Xiaohongshu', input_schema: ioSchema.copy.input, output_schema: ioSchema.copy.output },
    output: {}, input_schema: ioSchema.copy.input, output_schema: ioSchema.copy.output,
  },
  {
    id: 'image-prompt-agent', type: 'image_prompt', label: '图片提示词', x: 696, y: 116, width: 260, height: 166, status: 'idle',
    config: { style: 'editorial', aspect_ratio: '1:1', input_schema: ioSchema.image_prompt.input, output_schema: ioSchema.image_prompt.output },
    output: {}, input_schema: ioSchema.image_prompt.input, output_schema: ioSchema.image_prompt.output,
  },
  {
    id: 'review-agent', type: 'review', label: '审核节点', x: 384, y: 340, width: 260, height: 166, status: 'idle',
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
  context: '品牌上下文', copy: '文案', image_prompt: '图片提示词', image_generation: '图片生成',
  image: '图片生成', storyboard: '分镜', audio: '配音', retrieval: '检索',
  rag_search: '检索', review: '审核', custom_agent: '自定义智能体',
};
