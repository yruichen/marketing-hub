import { describe, expect, it } from 'vitest';
import type { WorkflowNode, WorkflowRunRecord } from '../../types/workspace';
import { mergeWorkflowRunIntoNodes, workflowRunIsActive, workflowRunProgressLabel } from './workflowRunState';

function run(overrides: Partial<WorkflowRunRecord>): WorkflowRunRecord {
  return {
    id: 1,
    draft_id: 1,
    organization_id: 1,
    project_id: 1,
    campaign_id: null,
    requested_by_id: null,
    status: 'running',
    idempotency_key: '',
    graph_version: 'v1',
    input_snapshot: {},
    summary: {},
    total_nodes: 2,
    completed_nodes: 1,
    failed_nodes: 0,
    token_count: 0,
    estimated_cost_usd: '0.0000',
    actual_cost_usd: '0.0000',
    celery_task_id: '',
    started_at: null,
    completed_at: null,
    created_at: '',
    updated_at: '',
    node_runs: [],
    events: [],
    ...overrides,
  };
}

function node(id: string): WorkflowNode {
  return { id, type: 'copy', label: id, x: 0, y: 0, status: 'idle', config: {}, output: {} };
}

describe('workflow run state', () => {
  it('detects active runs', () => {
    expect(workflowRunIsActive(run({ status: 'queued' }))).toBe(true);
    expect(workflowRunIsActive(run({ status: 'succeeded' }))).toBe(false);
  });

  it('merges node run status and output summary into nodes', () => {
    const merged = mergeWorkflowRunIntoNodes([node('copy-1')], run({
      node_runs: [{
        id: 1,
        workflow_run_id: 1,
        generation_task_id: 9,
        retry_of_id: null,
        node_id: 'copy-1',
        node_type: 'copy',
        node_label: 'Copy',
        status: 'succeeded',
        attempt: 1,
        input_snapshot: {},
        output_summary: { title: 'Launch' },
        error_code: '',
        error_message: '',
        started_at: null,
        completed_at: null,
        duration_ms: 0,
        created_at: '',
        updated_at: '',
      }],
    }));

    expect(merged[0].status).toBe('succeeded');
    expect(merged[0].task_id).toBe(9);
    expect(merged[0].output?.title).toBe('Launch');
  });

  it('maps backend-only node run statuses to supported canvas statuses', () => {
    const merged = mergeWorkflowRunIntoNodes([node('image-1'), node('copy-1')], run({
      node_runs: [{
        id: 1,
        workflow_run_id: 1,
        generation_task_id: null,
        retry_of_id: null,
        node_id: 'image-1',
        node_type: 'image_generation',
        node_label: 'Image',
        status: 'saving_asset',
        attempt: 1,
        input_snapshot: {},
        output_summary: {},
        error_code: '',
        error_message: '',
        started_at: null,
        completed_at: null,
        duration_ms: 0,
        created_at: '',
        updated_at: '',
      }, {
        id: 2,
        workflow_run_id: 1,
        generation_task_id: null,
        retry_of_id: null,
        node_id: 'copy-1',
        node_type: 'copy',
        node_label: 'Copy',
        status: 'cancelled',
        attempt: 1,
        input_snapshot: {},
        output_summary: {},
        error_code: '',
        error_message: '',
        started_at: null,
        completed_at: null,
        duration_ms: 0,
        created_at: '',
        updated_at: '',
      }],
    }));

    expect(merged[0].status).toBe('running');
    expect(merged[1].status).toBe('skipped');
  });

  it('builds readable progress labels', () => {
    expect(workflowRunProgressLabel(run({ status: 'running', completed_nodes: 1, total_nodes: 3 }))).toBe('1/3 已完成');
    expect(workflowRunProgressLabel(run({ status: 'partial_success', completed_nodes: 2, failed_nodes: 1 }))).toBe('2 成功 · 1 失败');
  });
});
