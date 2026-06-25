import { describe, expect, it } from 'vitest';
import type { WorkflowEdge, WorkflowNode } from '../../types/workspace';
import { autoLayoutWorkflow, getWorkflowBounds, hasLayoutProblems } from './layout';

function node(id: string, type: WorkflowNode['type']): WorkflowNode {
  return {
    id,
    type,
    label: id,
    x: 0,
    y: 0,
    width: 260,
    height: 200,
    status: 'idle',
    config: {},
    output: {},
  };
}

describe('workflow layout', () => {
  it('lays out a linear workflow from left to right without overlap', () => {
    const nodes = [node('context', 'context'), node('copy', 'copy'), node('review', 'review')];
    const edges: WorkflowEdge[] = [
      { id: 'context-copy', source: 'context', target: 'copy' },
      { id: 'copy-review', source: 'copy', target: 'review' },
    ];

    const laidOut = autoLayoutWorkflow(nodes, edges);

    expect(laidOut[1].x).toBeGreaterThan(laidOut[0].x);
    expect(laidOut[2].x).toBeGreaterThan(laidOut[1].x);
    expect(hasLayoutProblems(laidOut, edges)).toBe(false);
  });

  it('spreads branches vertically', () => {
    const nodes = [
      node('context', 'context'),
      node('copy', 'copy'),
      node('image', 'image_prompt'),
      node('storyboard', 'storyboard'),
      node('review', 'review'),
    ];
    const edges: WorkflowEdge[] = [
      { id: 'context-copy', source: 'context', target: 'copy' },
      { id: 'copy-image', source: 'copy', target: 'image' },
      { id: 'copy-storyboard', source: 'copy', target: 'storyboard' },
      { id: 'copy-review', source: 'copy', target: 'review' },
    ];

    const laidOut = autoLayoutWorkflow(nodes, edges);
    const branchYs = laidOut
      .filter((item) => ['image', 'storyboard', 'review'].includes(item.id))
      .map((item) => item.y);

    expect(new Set(branchYs).size).toBe(3);
    expect(hasLayoutProblems(laidOut, edges)).toBe(false);
  });

  it('detects clustered generated coordinates', () => {
    const nodes = [node('context', 'context'), node('copy', 'copy'), node('review', 'review')];
    const edges: WorkflowEdge[] = [
      { id: 'context-copy', source: 'context', target: 'copy' },
      { id: 'copy-review', source: 'copy', target: 'review' },
    ];

    expect(hasLayoutProblems(nodes, edges)).toBe(true);
    expect(getWorkflowBounds(autoLayoutWorkflow(nodes, edges)).width).toBeGreaterThan(600);
  });
});
