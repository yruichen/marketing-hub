import type { AssetRecord, AssetType } from '../../types/workspace';

export type { AssetRecord, AssetType } from '../../types/workspace';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  image: '图片',
  audio: '音频',
  video: '视频',
  document: '文档',
};

/**
 * 按 task_type 分组的 5 个固定组（顺序固定，UI 稳定）。
 * metadata.task_type 是后端创建 Asset 时存的字段。
 * 落不到这 5 类的（task_type 缺失或新值）进 "other"。
 */
export type AssetGroupKey = 'copy' | 'image' | 'audio' | 'video' | 'custom_agent' | 'other';

export const ASSET_GROUP_LABELS: Record<AssetGroupKey, string> = {
  copy: '文案',
  image: '图片',
  audio: '音频',
  video: '视频',
  custom_agent: '智能体',
  other: '其他',
};

export const ASSET_GROUP_ORDER: AssetGroupKey[] = ['copy', 'image', 'audio', 'video', 'custom_agent', 'other'];

export function groupOfAsset(asset: AssetRecord): AssetGroupKey {
  const taskType = (asset.metadata?.task_type as string | undefined) || '';
  if (taskType === 'copy' || taskType === 'storyboard' || taskType === 'rag_search') {
    // 文本类（storyboard/rag_search 也算文案/草稿）
    return 'copy';
  }
  if (taskType === 'image') return 'image';
  if (taskType === 'audio') return 'audio';
  if (taskType === 'video') return 'video';
  if (taskType === 'custom_agent') return 'custom_agent';
  return 'other';
}

export interface AssetGroup {
  key: AssetGroupKey;
  label: string;
  items: AssetRecord[];
}

export interface AssetsListResponse {
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
  type_counts: Partial<Record<AssetType, number>>;
  items: AssetRecord[];
}

export type AssetTypeFilter = AssetType | 'all';

export interface AssetFilterState {
  type: AssetTypeFilter;
  search: string;
}

export interface AssetsLibraryProps {
  organizationSlug: string;
  onOpenProject?: (projectId: number) => void;
}
