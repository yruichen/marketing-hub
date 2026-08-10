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
import type { TranslationKey } from '../../shared/i18n';
import type { NodeType } from './definition';

export type NodePreset = {
  type: NodeType;
  labelKey: TranslationKey;
  icon: typeof Settings2;
  width: number;
  height: number;
};

export const presets: NodePreset[] = [
  { type: 'context', labelKey: 'workflow.node.context', icon: Settings2, width: 320, height: 360 },
  { type: 'copy', labelKey: 'workflow.node.copy', icon: Copy, width: 320, height: 360 },
  { type: 'image_prompt', labelKey: 'workflow.node.imagePrompt', icon: Sparkles, width: 320, height: 360 },
  { type: 'image_generation', labelKey: 'workflow.node.imageGeneration', icon: ImageIcon, width: 320, height: 360 },
  { type: 'storyboard', labelKey: 'workflow.node.storyboard', icon: Film, width: 320, height: 360 },
  { type: 'video_generation', labelKey: 'workflow.node.videoGeneration', icon: Video, width: 320, height: 360 },
  { type: 'audio', labelKey: 'workflow.node.audio', icon: Mic, width: 320, height: 360 },
  { type: 'retrieval', labelKey: 'workflow.node.retrieval', icon: Search, width: 320, height: 360 },
  { type: 'review', labelKey: 'workflow.node.review', icon: ShieldCheck, width: 320, height: 360 },
  { type: 'custom_agent', labelKey: 'workflow.node.customAgent', icon: Sparkles, width: 320, height: 360 },
];

export const nodeTypeLabelKeys: Record<string, TranslationKey> = {
  context: 'workflow.node.context', copy: 'workflow.node.copy', image_prompt: 'workflow.node.imagePrompt',
  image_generation: 'workflow.node.imageGeneration', image: 'workflow.node.imageGeneration', storyboard: 'workflow.node.storyboard',
  video_generation: 'workflow.node.videoGeneration', video: 'workflow.node.videoGeneration', audio: 'workflow.node.audio',
  retrieval: 'workflow.node.retrieval', rag_search: 'workflow.node.retrieval', review: 'workflow.node.review', custom_agent: 'workflow.node.customAgent',
};

export const nodeTypeDescriptionKeys: Record<string, TranslationKey> = {
  context: 'workflow.description.context', copy: 'workflow.description.copy', image_prompt: 'workflow.description.imagePrompt',
  image_generation: 'workflow.description.imageGeneration', image: 'workflow.description.imageGeneration', storyboard: 'workflow.description.storyboard',
  video_generation: 'workflow.description.videoGeneration', video: 'workflow.description.videoGeneration', audio: 'workflow.description.audio',
  retrieval: 'workflow.description.retrieval', rag_search: 'workflow.description.retrieval', review: 'workflow.description.review', custom_agent: 'workflow.description.customAgent',
};

export const nodeTypeOutputKeys: Record<string, TranslationKey> = {
  context: 'workflow.output.context', copy: 'workflow.output.copy', image_prompt: 'workflow.output.imagePrompt',
  image_generation: 'workflow.output.imageGeneration', image: 'workflow.output.imageGeneration', storyboard: 'workflow.output.storyboard',
  video_generation: 'workflow.output.videoGeneration', video: 'workflow.output.videoGeneration', audio: 'workflow.output.audio',
  retrieval: 'workflow.output.retrieval', rag_search: 'workflow.output.retrieval', review: 'workflow.output.review', custom_agent: 'workflow.output.customAgent',
};

export const statusLabelKeys: Record<string, TranslationKey> = {
  idle: 'workflow.status.idle', queued: 'workflow.status.queued', running: 'workflow.status.running',
  succeeded: 'workflow.status.succeeded', failed: 'workflow.status.failed', skipped: 'workflow.status.skipped',
};
