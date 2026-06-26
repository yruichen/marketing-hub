import { describe, expect, it } from 'vitest';
import type { WorkflowEdge, WorkflowNode } from '../../types/workspace';
import { buildWorkflowReadiness, hasWorkflowCycle } from './workflowReadiness';

function node(id: string, type: WorkflowNode['type'], config: WorkflowNode['config'] = {}): WorkflowNode {
  return {
    id,
    type,
    label: id,
    x: 0,
    y: 0,
    status: 'idle',
    config,
    output: {},
  };
}

describe('workflow readiness', () => {
  it('blocks empty workflows', () => {
    const result = buildWorkflowReadiness([], [], {});

    expect(result.canRun).toBe(false);
    expect(result.blockers[0].id).toBe('empty-workflow');
  });

  it('detects cycles', () => {
    const nodes = [node('a', 'context'), node('b', 'copy', { platform: 'Xiaohongshu', tone: '清晰' })];
    const edges: WorkflowEdge[] = [
      { id: 'a-b', source: 'a', target: 'b' },
      { id: 'b-a', source: 'b', target: 'a' },
    ];

    expect(hasWorkflowCycle(nodes, edges)).toBe(true);
    expect(buildWorkflowReadiness(nodes, edges, { brand_name: 'A' }).blockers.some((issue) => issue.id === 'cycle')).toBe(true);
  });

  it('blocks isolated nodes and missing required config', () => {
    const result = buildWorkflowReadiness(
      [
        node('context', 'context'),
        node('copy', 'copy', { platform: 'Xiaohongshu' }),
      ],
      [],
      {
        brand_name: 'Brand',
        product_name: 'Product',
        audience: 'Ops',
        tone: 'Direct',
        selling_points: 'Fast',
        forbidden_words: 'absolute',
        platform: 'Xiaohongshu',
      },
    );

    expect(result.canRun).toBe(false);
    expect(result.blockers.some((issue) => issue.id === 'isolated-context')).toBe(true);
    expect(result.blockers.some((issue) => issue.id === 'missing-config-copy')).toBe(true);
  });

  it('allows a connected configured workflow and warns when review is missing', () => {
    const result = buildWorkflowReadiness(
      [
        node('context', 'context'),
        node('copy', 'copy', { platform: 'Xiaohongshu', tone: '清晰' }),
      ],
      [{ id: 'context-copy', source: 'context', target: 'copy' }],
      {
        brand_name: 'Brand',
        product_name: 'Product',
        audience: 'Ops',
        tone: 'Direct',
        selling_points: 'Fast',
        forbidden_words: 'absolute',
        platform: 'Xiaohongshu',
      },
    );

    expect(result.canRun).toBe(true);
    expect(result.warnings.some((issue) => issue.id === 'missing-review')).toBe(true);
  });
});
