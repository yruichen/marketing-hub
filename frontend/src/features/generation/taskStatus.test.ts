import { describe, expect, it } from 'vitest';
import { explainGenerationError, taskProgressMessage } from './taskStatus';
import type { GenerationTaskRecord } from '../../types/workspace';

function task(overrides: Partial<GenerationTaskRecord>): GenerationTaskRecord {
  return {
    id: 17,
    task_type: 'copy',
    status: 'queued',
    result: {},
    error_message: '',
    created_at: '2026-06-26T00:00:00Z',
    ...overrides,
  };
}

describe('generation task status helpers', () => {
  it('turns quota errors into actionable guidance', () => {
    const error = explainGenerationError('quota exceeded', 402);
    expect(error.message).toContain('额度不足');
    expect(error.recoveryActions).toContain('查看计费页余额');
  });

  it('summarizes queued and succeeded task states', () => {
    expect(taskProgressMessage(task({ status: 'queued' })).title).toContain('文案任务已进入队列');
    expect(taskProgressMessage(task({ status: 'succeeded', cost_usd: '0.0010' })).detail).toContain('0.0010');
  });
});
