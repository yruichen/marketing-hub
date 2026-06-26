import { describe, expect, it } from 'vitest';
import type { AssetRecord } from '../../types/workspace';
import { assetSourceLabel, assetWorkflowLabel } from './assetContent';
import { groupAssetsForLibrary } from './useAssetGroups';

function asset(overrides: Partial<AssetRecord>): AssetRecord {
  return {
    id: 1,
    organization_id: 1,
    project_id: 1,
    campaign_id: null,
    asset_type: 'document',
    title: 'Asset',
    source_url: '',
    tags: [],
    metadata: {},
    created_at: '2026-06-27T00:00:00Z',
    ...overrides,
  };
}

describe('asset library grouping', () => {
  it('groups workflow assets by run before normal generation groups', () => {
    const result = groupAssetsForLibrary([
      asset({
        id: 1,
        title: 'Copy',
        metadata: {
          source: 'workflow',
          workflow_run_id: 88,
          workflow_node_label: 'Copy Node',
          task_type: 'copy',
        },
      }),
      asset({
        id: 2,
        title: 'Image',
        asset_type: 'image',
        source_url: '/image.png',
        metadata: {
          source: 'workflow',
          workflow_run_id: 88,
          workflow_node_label: 'Image Node',
          task_type: 'image',
        },
      }),
      asset({
        id: 3,
        title: 'Manual Note',
        metadata: { source: 'manual' },
      }),
    ]);

    expect(result.total).toBe(3);
    expect(result.groups[0].key).toBe('workflow-88');
    expect(result.groups[0].items.map((item) => item.id)).toEqual([1, 2]);
    expect(result.groups[0].hint).toContain('Copy Node');
    expect(result.groups[1].items.map((item) => item.id)).toEqual([3]);
  });

  it('formats workflow source labels for cards and preview details', () => {
    const item = asset({
      metadata: {
        source: 'workflow',
        workflow_run_id: 42,
        workflow_node_label: 'Review',
      },
    });

    expect(assetSourceLabel(item)).toBe('工作流');
    expect(assetWorkflowLabel(item)).toBe('Run #42 / Review');
  });
});
