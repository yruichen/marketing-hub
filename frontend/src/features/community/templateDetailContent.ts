import type { CommunityItem } from './types';

export function formatTemplateDetailBody(item: CommunityItem): string {
  const { content, creation_type: type } = item;

  if (type === 'copy') {
    const parts = [
      content.title ? `标题：${content.title}` : '',
      ...(content.paragraphs || []).map((p, i) => `${i + 1}. ${p}`),
      content.call_to_action ? `行动号召：${content.call_to_action}` : '',
      (content.tags || []).length ? `标签：${(content.tags || []).join(' / ')}` : '',
    ].filter(Boolean);
    return parts.join('\n\n') || item.title;
  }

  if (type === 'image') {
    return [
      content.revised_prompt || content.prompt,
      content.style ? `风格：${content.style}` : '',
      content.aspect_ratio || content.aspectRatio ? `比例：${content.aspect_ratio || content.aspectRatio}` : '',
    ].filter(Boolean).join('\n\n') || item.title;
  }

  if (type === 'storyboard') {
    const lines = [
      content.video_topic ? `主题：${content.video_topic}` : '',
      content.target_audience ? `受众：${content.target_audience}` : '',
      ...(content.scenes || []).map(
        (scene) => `镜头 ${scene.scene_number || '-'} (${scene.duration_seconds || '-'}s)\n画面：${scene.visual_description}\n旁白：${scene.audio_narration}`,
      ),
    ].filter(Boolean);
    return lines.join('\n\n') || item.title;
  }

  if (type === 'audio') {
    return [
      content.text,
      content.voice_id ? `音色：${content.voice_id}` : '',
      content.estimated_audio_duration_seconds
        ? `时长约 ${content.estimated_audio_duration_seconds} 秒`
        : '',
    ].filter(Boolean).join('\n\n') || item.title;
  }

  if (type === 'video') {
    return [
      content.video_topic ? `主题：${content.video_topic}` : '',
      content.prompt,
      content.aspect_ratio ? `比例：${content.aspect_ratio}` : '',
      content.duration_seconds ? `时长：${content.duration_seconds}s` : '',
    ].filter(Boolean).join('\n\n') || item.title;
  }

  return item.title;
}
