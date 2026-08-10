import { describe, expect, it } from 'vitest';
import { defaultNodeConfig } from './definition';
import { normalizeWorkflowNode } from './types';
import type { WorkflowNode } from '../../types/workspace';

describe('workflow definition boundaries', () => {
  it('uses language-neutral persisted identifiers without seeded business content', () => {
    expect(defaultNodeConfig('copy', {})).toEqual({ tone: '', platform: '' });
    expect(defaultNodeConfig('review', {})).toEqual({ forbidden_words: '', channel_rules: '' });
    expect(defaultNodeConfig('retrieval', {})).toMatchObject({ retrieval_scope: 'brand_memory_and_assets' });
    expect(defaultNodeConfig('image_generation', {})).toMatchObject({ model: '', failure_strategy: 'retry_once' });
  });

  it('does not persist a localized fallback label', () => {
    const node = normalizeWorkflowNode({
      id: 'copy-1',
      type: 'copy',
      label: '',
      x: 0,
      y: 0,
      status: 'idle',
      config: {},
      output: {},
      input_schema: {},
      output_schema: {},
    } as WorkflowNode, {});

    expect(node.label).toBe('');
  });
});
