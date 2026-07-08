import { describe, expect, it } from 'vitest';
import type { WorkflowNode } from '../../types/workspace';
import { classifyWorkflowFailure, downstreamNodeIds, formatNodeDiagnosticSnapshot, workflowFailureAppActions } from './workflowRecovery';

const nodes: WorkflowNode[] = [
  { id: 'context-1', type: 'context', label: '读取品牌记忆', x: 0, y: 0, status: 'succeeded', config: {}, output: { summary: 'brand' } },
  { id: 'copy-1', type: 'copy', label: '写渠道文案', x: 0, y: 0, status: 'failed', config: { platform: 'xhs' }, error_message: 'Missing required tone' },
  { id: 'review-1', type: 'review', label: '内容审阅', x: 0, y: 0, status: 'queued', config: {} },
];
const edges = [
  { id: 'e1', source: 'context-1', target: 'copy-1' },
  { id: 'e2', source: 'copy-1', target: 'review-1' },
];

describe('workflow recovery helpers', () => {
  it('classifies common failure messages', () => {
    expect(classifyWorkflowFailure('Missing required tone').kind).toBe('missing_input');
    expect(classifyWorkflowFailure('provider gateway timeout').kind).toBe('model_timeout');
    expect(classifyWorkflowFailure('openai service unavailable').kind).toBe('provider');
    expect(workflowFailureAppActions('quota')[0]?.id).toBe('open_billing');
  });

  it('walks downstream nodes for rerun impact', () => {
    expect(downstreamNodeIds('context-1', edges)).toEqual(['copy-1', 'review-1']);
  });

  it('formats a diagnostic snapshot with upstream outputs', () => {
    const text = formatNodeDiagnosticSnapshot(nodes[1], nodes, edges);
    expect(text).toContain('Missing required tone');
    expect(text).toContain('读取品牌记忆');
    expect(text).toContain('内容审阅');
  });
});
