import { describe, expect, it } from 'vitest';
import { buildGlobalSearchResults } from './globalSearch';
import type { AssetRecord, GenerationTaskRecord, ProjectRecord } from '../../types/workspace';

const project: ProjectRecord = {
  id: 1,
  organization_id: 1,
  name: 'Spring Launch',
  slug: 'spring-launch',
  brief: 'Launch a creator campaign',
  brand_context: { brand_name: 'Launchbook', audience: 'creators' },
  is_archived: false,
  created_at: '2026-06-26T00:00:00Z',
  updated_at: '2026-06-26T00:00:00Z',
};

const asset: AssetRecord = {
  id: 2,
  organization_id: 1,
  project_id: 1,
  campaign_id: null,
  asset_type: 'image',
  title: 'Hero Visual',
  source_url: '',
  tags: ['launch'],
  metadata: { task_type: 'image' },
  created_at: '2026-06-26T00:00:00Z',
};

const task: GenerationTaskRecord = {
  id: 3,
  task_type: 'copy',
  status: 'failed',
  result: {},
  error_message: 'quota exceeded',
  created_at: '2026-06-26T00:00:00Z',
};

describe('global search', () => {
  it('builds grouped search results across projects, assets, and tasks', () => {
    const results = buildGlobalSearchResults('launch', {
      projects: [project],
      assets: [asset],
      tasks: [task],
    });
    expect(results.map((item) => item.kind)).toContain('project');
    expect(results.map((item) => item.kind)).toContain('asset');
  });

  it('finds failed tasks by error message', () => {
    const results = buildGlobalSearchResults('quota', {
      projects: [project],
      assets: [asset],
      tasks: [task],
    });
    expect(results[0].kind).toBe('task');
    expect(results[0].label).toContain('#3');
  });
});
