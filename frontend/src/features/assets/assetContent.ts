import type { AssetRecord } from '../../types/workspace';
import { detectDocFormat } from './assetVisuals';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberText(value: unknown): string {
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function resultOf(asset: AssetRecord): JsonRecord | null {
  return isRecord(asset.metadata?.result) ? asset.metadata.result : null;
}

export function assetTaskType(asset: AssetRecord): string {
  return typeof asset.metadata?.task_type === 'string' ? asset.metadata.task_type : asset.asset_type;
}

export function getAssetSummary(asset: AssetRecord): string {
  const result = resultOf(asset);
  const taskType = assetTaskType(asset);

  if (result) {
    if (taskType === 'copy') {
      const paragraphs = stringList(result.paragraphs);
      return paragraphs[0] || text(result.call_to_action) || text(result.title) || asset.title;
    }

    if (taskType === 'storyboard') {
      const scenes = Array.isArray(result.scenes) ? result.scenes : [];
      const firstScene = scenes.find(isRecord);
      return text(firstScene?.visual_description) || text(firstScene?.audio_narration) || text(result.video_topic) || asset.title;
    }

    if (taskType === 'image_prompt') {
      return text(result.prompt_zh) || text(result.prompt) || asset.title;
    }

    if (taskType === 'rag_search') {
      return text(result.query) || stringList(result.rag_logs)[0] || asset.title;
    }

    return (
      text(result.summary) ||
      text(result.title) ||
      text(result.prompt) ||
      text(result.revised_prompt) ||
      text(result.text) ||
      text(result.script) ||
      asset.title
    );
  }

  if (asset.source_url) return truncate(asset.source_url, 72);
  if (asset.asset_type === 'document') {
    return detectDocFormat(asset.source_url) ? `.${detectDocFormat(asset.source_url)} 文档` : '没有源文件，点击查看记录详情';
  }
  return '没有源文件，点击查看记录详情';
}

export function formatAssetPreviewText(asset: AssetRecord): string {
  const result = resultOf(asset);
  const taskType = assetTaskType(asset);

  if (!result) {
    return asset.source_url ? `${asset.title}\n\n源文件：${asset.source_url}` : asset.title;
  }

  if (taskType === 'copy') return formatCopy(asset, result);
  if (taskType === 'storyboard') return formatStoryboard(asset, result);
  if (taskType === 'image_prompt') return formatImagePrompt(asset, result);
  if (taskType === 'rag_search') return formatRagSearch(asset, result);
  if (taskType === 'audio') return formatAudio(asset, result);
  if (taskType === 'video') return formatVideo(asset, result);
  if (taskType === 'image') return formatImage(asset, result);

  return formatGeneric(asset, result);
}

function formatCopy(asset: AssetRecord, result: JsonRecord): string {
  const paragraphs = stringList(result.paragraphs);
  const tags = stringList(result.tags);
  return compactLines([
    text(result.title) || asset.title,
    '',
    ...paragraphs,
    tags.length ? '' : '',
    tags.length ? tags.map((tag) => `#${tag}`).join(' ') : '',
    text(result.call_to_action) ? '' : '',
    text(result.call_to_action),
  ]);
}

function formatStoryboard(asset: AssetRecord, result: JsonRecord): string {
  const scenes = Array.isArray(result.scenes) ? result.scenes.filter(isRecord) : [];
  const header = compactLines([
    text(result.video_topic) || asset.title,
    numberText(result.total_duration_seconds) ? `总时长：${numberText(result.total_duration_seconds)} 秒` : '',
    text(result.target_audience) ? `目标受众：${text(result.target_audience)}` : '',
  ]);
  const sceneText = scenes.map((scene, index) => compactLines([
    `Scene ${numberText(scene.scene_number) || index + 1}${numberText(scene.duration_seconds) ? ` / ${numberText(scene.duration_seconds)}s` : ''}`,
    text(scene.visual_description),
    text(scene.audio_narration) ? `旁白：${text(scene.audio_narration)}` : '',
  ])).join('\n\n');
  return compactLines([header, '', sceneText || '暂无分镜详情']);
}

function formatImagePrompt(asset: AssetRecord, result: JsonRecord): string {
  return compactLines([
    asset.title,
    '',
    text(result.prompt_zh) ? `中文提示词：\n${text(result.prompt_zh)}` : '',
    text(result.prompt) ? `英文提示词：\n${text(result.prompt)}` : '',
    text(result.negative_prompt) ? `负面提示词：\n${text(result.negative_prompt)}` : '',
  ]);
}

function formatRagSearch(asset: AssetRecord, result: JsonRecord): string {
  const logs = stringList(result.rag_logs);
  const results = Array.isArray(result.results) ? result.results : [];
  return compactLines([
    asset.title,
    '',
    text(result.query) ? `检索词：${text(result.query)}` : '',
    results.length ? `命中结果：${results.length} 条` : '命中结果：暂无',
    logs.length ? '' : '',
    logs.length ? `检索日志：\n${logs.map((line) => `- ${line}`).join('\n')}` : '',
  ]);
}

function formatAudio(asset: AssetRecord, result: JsonRecord): string {
  return compactLines([
    text(result.text) || text(result.original_text) || asset.title,
    '',
    text(result.voice_id) ? `声线：${text(result.voice_id)}` : '',
    numberText(result.speed) ? `语速：${numberText(result.speed)}x` : '',
    numberText(result.estimated_audio_duration_seconds) ? `预计时长：${numberText(result.estimated_audio_duration_seconds)} 秒` : '',
  ]);
}

function formatVideo(asset: AssetRecord, result: JsonRecord): string {
  return compactLines([
    text(result.video_topic) || asset.title,
    '',
    text(result.prompt) || text(result.summary),
    text(result.video_url) ? `视频地址：${text(result.video_url)}` : '',
  ]);
}

function formatImage(asset: AssetRecord, result: JsonRecord): string {
  return compactLines([
    asset.title,
    '',
    text(result.revised_prompt) || text(result.prompt),
    text(result.image_url) ? `图片地址：${text(result.image_url)}` : '',
  ]);
}

function formatGeneric(asset: AssetRecord, result: JsonRecord): string {
  const rows = Object.entries(result)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${labelFor(key)}：${formatValue(value)}`);
  return compactLines([asset.title, '', ...rows]);
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => isRecord(item) ? formatRecordInline(item) : String(item)).join('\n');
  }
  if (isRecord(value)) return formatRecordInline(value);
  return '';
}

function formatRecordInline(record: JsonRecord): string {
  return Object.entries(record)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${labelFor(key)}=${typeof value === 'object' ? '[结构化内容]' : String(value)}`)
    .join(' / ');
}

function labelFor(key: string): string {
  const labels: Record<string, string> = {
    title: '标题',
    summary: '摘要',
    prompt: '提示词',
    revised_prompt: '优化提示词',
    prompt_zh: '中文提示词',
    negative_prompt: '负面提示词',
    text: '正文',
    script: '脚本',
    query: '检索词',
    video_topic: '视频主题',
    total_duration_seconds: '总时长',
    target_audience: '目标受众',
  };
  return labels[key] || key.replaceAll('_', ' ');
}

function compactLines(lines: string[]): string {
  return lines.map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 3) + '...';
}
