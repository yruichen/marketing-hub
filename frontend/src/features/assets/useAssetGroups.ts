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
  return useMemo(() => groupAssetsForLibrary(items), [items]);
}

export function groupAssetsForLibrary(items: AssetRecord[]): UseAssetGroupsResult {
  const workflowBuckets = new Map<string, AssetRecord[]>();
  const buckets = new Map<AssetGroupKey, AssetRecord[]>();
  for (const item of items) {
    if (item.metadata?.source === 'workflow') {
      const runId = item.metadata.workflow_run_id || 'unknown';
      const key = `workflow-${runId}`;
      const arr = workflowBuckets.get(key) || [];
      arr.push(item);
      workflowBuckets.set(key, arr);
      continue;
    }
    const key = groupOfAsset(item);
    const arr = buckets.get(key) || [];
    arr.push(item);
    buckets.set(key, arr);
  }

  const groups: AssetGroup[] = [];
  for (const [key, groupItems] of Array.from(workflowBuckets.entries()).sort(compareWorkflowGroup)) {
    const runId = key.replace('workflow-', '');
    const nodeLabels = Array.from(new Set(groupItems
      .map((item) => item.metadata.workflow_node_label)
      .filter((label): label is string => typeof label === 'string' && label.length > 0)));
    groups.push({
      key,
      label: runId === 'unknown' ? '工作流产物' : `工作流 Run #${runId}`,
      hint: nodeLabels.length ? `节点：${nodeLabels.slice(0, 3).join(' / ')}${nodeLabels.length > 3 ? '…' : ''}` : '按一次运行聚合',
      items: groupItems,
    });
  }

  for (const key of ASSET_GROUP_ORDER) {
    const groupItems = buckets.get(key);
    if (!groupItems || groupItems.length === 0) continue;
    groups.push({ key, label: ASSET_GROUP_LABELS[key], hint: '非工作流来源', items: groupItems });
  }

  return { groups, total: items.length };
}

function compareWorkflowGroup(a: [string, AssetRecord[]], b: [string, AssetRecord[]]) {
  const newestA = Math.max(...a[1].map((item) => new Date(item.created_at).getTime()).filter(Number.isFinite));
  const newestB = Math.max(...b[1].map((item) => new Date(item.created_at).getTime()).filter(Number.isFinite));
  return newestB - newestA;
}
