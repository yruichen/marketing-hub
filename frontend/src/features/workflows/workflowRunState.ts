import type { NodeStatus, WorkflowNode, WorkflowNodeRunRecord, WorkflowRunRecord } from '../../types/workspace';

export function workflowRunIsActive(run?: Pick<WorkflowRunRecord, 'status'> | null) {
  return run?.status === 'queued' || run?.status === 'running';
}

export function workflowRunIsTerminal(run?: Pick<WorkflowRunRecord, 'status'> | null) {
  return !!run && !workflowRunIsActive(run);
}

function nodeStatusFromRun(status: WorkflowNodeRunRecord['status']): NodeStatus {
  if (status === 'pending' || status === 'queued') return 'queued';
  if (status === 'running' || status === 'saving_asset') return 'running';
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed') return 'failed';
  if (status === 'skipped' || status === 'cancelled') return 'skipped';
  return 'idle';
}

export function mergeWorkflowRunIntoNodes(nodes: WorkflowNode[], run: WorkflowRunRecord | null): WorkflowNode[] {
  if (!run?.node_runs?.length) return nodes;
  const runByNodeId = new Map(run.node_runs.map((nodeRun) => [nodeRun.node_id, nodeRun]));
  return nodes.map((node) => {
    const nodeRun = runByNodeId.get(node.id);
    if (!nodeRun) return node;
    const outputSummary = nodeRun.output_summary || {};
    const hasFullOutput = node.output && Object.keys(node.output).length > 0;
    return {
      ...node,
      status: nodeStatusFromRun(nodeRun.status),
      task_id: nodeRun.generation_task_id || node.task_id,
      error_message: nodeRun.error_message || node.error_message,
      output: hasFullOutput ? node.output : outputSummary,
    };
  });
}

export function workflowRunProgressLabel(run: WorkflowRunRecord | null) {
  if (!run) return '暂无运行';
  if (workflowRunIsActive(run)) {
    return `${run.completed_nodes}/${run.total_nodes} 已完成`;
  }
  if (run.status === 'succeeded') return `全部 ${run.total_nodes} 个节点成功`;
  if (run.status === 'partial_success') return `${run.completed_nodes} 成功 · ${run.failed_nodes} 失败`;
  if (run.status === 'failed') return `${run.failed_nodes || 1} 个节点失败`;
  return run.status;
}
