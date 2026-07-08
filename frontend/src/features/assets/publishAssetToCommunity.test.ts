import { describe, expect, it } from 'vitest';
import { buildCommunityPayloadFromAsset, communityTypeFromAsset } from './publishAssetToCommunity';
import type { AssetRecord } from '../../types/workspace';

function makeAsset(partial: Partial<AssetRecord>): AssetRecord {
  return {
    id: 1,
    organization_id: 1,
    project_id: null,
    campaign_id: null,
    folder_id: null,
    asset_type: 'document',
    title: '测试文案',
    source_url: '',
    tags: [],
    metadata: {},
    created_at: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('publishAssetToCommunity', () => {
  it('maps copy assets to community copy type', () => {
    const asset = makeAsset({
      metadata: {
        task_type: 'copy',
        result: { title: '标题', paragraphs: ['第一段'] },
      },
    });
    expect(communityTypeFromAsset(asset)).toBe('copy');
    const payload = buildCommunityPayloadFromAsset(asset);
    expect(payload?.creation_type).toBe('copy');
    expect(payload?.source_asset_id).toBe(1);
  });

  it('maps image assets with source url', () => {
    const asset = makeAsset({
      asset_type: 'image',
      source_url: 'https://example.com/a.png',
      metadata: { task_type: 'image', result: { prompt: 'coffee' } },
    });
    expect(communityTypeFromAsset(asset)).toBe('image');
    expect(buildCommunityPayloadFromAsset(asset)?.image_url).toBe('https://example.com/a.png');
  });
});
