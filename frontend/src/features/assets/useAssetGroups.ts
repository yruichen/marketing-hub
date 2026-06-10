import { useMemo } from 'react';
import type { AssetRecord } from '../../types/workspace';
import {
  ASSET_GROUP_LABELS,
  ASSET_GROUP_ORDER,
  groupOfAsset,
  type AssetGroup,
  type AssetGroupKey,
} from './types';

interface UseAssetGroupsResult {
  groups: AssetGroup[];
  total: number;
}

/**
 * 把 assets 列表按 task_type 分组。空组不会出现在结果里。
 * 分组顺序固定（ASSET_GROUP_ORDER），保证 UI 稳定。
 */
export function useAssetGroups(items: AssetRecord[]): UseAssetGroupsResult {
  return useMemo(() => {
    const buckets = new Map<AssetGroupKey, AssetRecord[]>();
    for (const item of items) {
      const key = groupOfAsset(item);
      const arr = buckets.get(key) || [];
      arr.push(item);
      buckets.set(key, arr);
    }

    const groups: AssetGroup[] = [];
    for (const key of ASSET_GROUP_ORDER) {
      const items = buckets.get(key);
      if (!items || items.length === 0) continue;
      groups.push({ key, label: ASSET_GROUP_LABELS[key], items });
    }

    return { groups, total: items.length };
  }, [items]);
}
