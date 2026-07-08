import type { CommunityItem } from './types';

export function templateSummary(item: CommunityItem): string {
  if (item.creation_type === 'copy') {
    return item.content.paragraphs?.[0] || item.content.call_to_action || item.content.title || item.title;
  }
  if (item.creation_type === 'image') {
    return item.content.revised_prompt || item.content.prompt || '可复用的视觉提示词模板';
  }
  if (item.creation_type === 'storyboard') {
    return item.content.scenes?.[0]?.visual_description || item.content.video_topic || '可复用的短视频分镜结构';
  }
  if (item.creation_type === 'audio') {
    return item.content.text || `约 ${item.content.estimated_audio_duration_seconds || '-'} 秒口播音频模板`;
  }
  if (item.creation_type === 'video') {
    return item.content.prompt || item.content.video_topic || '可复用的视频生成模板';
  }
  return item.title;
}

export function templateVisualTone(item: CommunityItem, index: number): 'short' | 'medium' | 'tall' {
  if (item.creation_type === 'image') {
    const mod = index % 3;
    if (mod === 0) return 'tall';
    if (mod === 1) return 'medium';
    return 'short';
  }
  const summaryLen = templateSummary(item).length;
  if (summaryLen > 140) return 'tall';
  if (summaryLen > 70) return 'medium';
  return 'short';
}
