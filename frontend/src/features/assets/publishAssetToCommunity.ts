import type { AssetRecord } from '../../types/workspace';
import type { CommunityItem } from '../community/types';
import type { CreationContent } from '../generation/types';
import { apiFetch, buildErrorToast, parseApiErrorResponse } from '../../hooks/useApi';
import type { TriggerToastFn } from '../../shared/types/toast';
import type { WorkspaceScope } from '../dashboard/types';
import { assetTaskType } from './assetContent';

export type CommunityCreationType = CommunityItem['creation_type'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** 将 Asset 映射为社区 creation_type；无法发布时返回 null */
export function communityTypeFromAsset(asset: AssetRecord): CommunityCreationType | null {
  const taskType = assetTaskType(asset);
  if (taskType === 'copy' || taskType === 'rag_search') return 'copy';
  if (taskType === 'image' || taskType === 'image_prompt') return 'image';
  if (taskType === 'storyboard') return 'storyboard';
  if (taskType === 'audio') return 'audio';
  if (taskType === 'video') return 'video';
  if (asset.asset_type === 'image') return 'image';
  if (asset.asset_type === 'audio') return 'audio';
  if (asset.asset_type === 'video') return 'video';
  if (asset.asset_type === 'document') return 'copy';
  return null;
}

export function buildCommunityPayloadFromAsset(asset: AssetRecord) {
  const creationType = communityTypeFromAsset(asset);
  if (!creationType) return null;

  const result = isRecord(asset.metadata?.result) ? asset.metadata.result : {};
  const content: CreationContent = { ...result };

  if (creationType === 'copy' && !content.paragraphs?.length) {
    content.title = typeof content.title === 'string' ? content.title : asset.title;
    content.paragraphs = [asset.title];
  }

  let imageUrl = asset.source_url || '';
  let audioUrl = '';
  if (creationType === 'image') {
    imageUrl = imageUrl || (typeof result.image_url === 'string' ? result.image_url : '');
  }
  if (creationType === 'audio') {
    audioUrl = asset.source_url || (typeof result.audio_url === 'string' ? result.audio_url : '');
  }

  const generationTaskId = asset.metadata?.generation_task_id;
  const sourceTaskId = typeof generationTaskId === 'number' ? generationTaskId : undefined;

  return {
    creation_type: creationType,
    title: asset.title,
    content,
    image_url: imageUrl,
    audio_url: audioUrl,
    source_asset_id: asset.id,
    source_task_id: sourceTaskId,
    tags: asset.tags || [],
  };
}

export interface PublishAssetOptions {
  asset: AssetRecord;
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  triggerToast: TriggerToastFn;
  creatorNote?: string;
  /** 从项目检查器发布时，优先使用所选项目而非当前工作区 scope */
  projectSlug?: string;
  campaignId?: number;
}

export async function publishAssetToCommunity({
  asset,
  workspaceScope,
  username,
  triggerToast,
  creatorNote = '',
  projectSlug,
  campaignId,
}: PublishAssetOptions): Promise<boolean> {
  const payload = buildCommunityPayloadFromAsset(asset);
  if (!payload) {
    triggerToast('该资产类型暂不支持发布到模板库', 'error');
    return false;
  }

  const metadata: Record<string, unknown> = {};
  if (creatorNote) metadata.creator_note = creatorNote;

  try {
    const res = await apiFetch('/community/creations/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username || '',
        organization: workspaceScope?.organization.slug,
        project: projectSlug ?? workspaceScope?.project.slug,
        campaign: campaignId ?? workspaceScope?.campaign?.id,
        creation_type: payload.creation_type,
        title: payload.title,
        content: payload.content,
        image_url: payload.image_url,
        audio_url: payload.audio_url,
        tags: payload.tags,
        source_asset_id: payload.source_asset_id,
        source_task_id: payload.source_task_id,
        metadata,
        visibility: 'public',
        responsibility_confirmed: true,
        ai_generated: true,
      }),
    });

    if (res.ok) {
      triggerToast('已发布到模板库，团队成员可在模板库中复用', 'success');
      return true;
    }

    const err = await parseApiErrorResponse(res, '/community/creations/');
    triggerToast(buildErrorToast(err, '发布到模板库失败'));
    return false;
  } catch (err) {
    triggerToast(buildErrorToast(err, '发布失败', '无法连接服务器，请稍后重试'));
    return false;
  }
}
