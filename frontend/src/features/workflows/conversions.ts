import type { WorkflowNode } from '../../types/workspace';
import type { NodeType } from './constants';
import type { FlowNode } from './WorkflowNodeComponent';

// WorkflowNode → ReactFlow Node (at API boundary: load)
export function wfToRF(node: WorkflowNode): FlowNode {
  return {
    id: node.id,
    type: 'workflowNode',
    position: { x: node.x, y: node.y },
    data: {
      label: node.label,
      nodeType: node.type as NodeType,
      config: (node.config || {}) as Record<string, unknown>,
      output: (node.output || {}) as Record<string, unknown>,
      status: node.status || 'idle',
      errorMessage: node.error_message || '',
      taskId: node.task_id,
      inputSchema: node.input_schema || {},
      outputSchema: node.output_schema || {},
    },
    width: node.width || 260,
    height: node.height || 200,
  };
}

// ReactFlow Node → WorkflowNode (at API boundary: save)
export function rfToWF(node: FlowNode): WorkflowNode {
  return {
    id: node.id,
    type: node.data.nodeType,
    label: node.data.label,
    x: node.position.x,
    y: node.position.y,
    width: node.width || 260,
    height: node.height || 200,
    status: node.data.status as WorkflowNode['status'],
    config: node.data.config as WorkflowNode['config'],
    output: node.data.output,
    error_message: node.data.errorMessage || undefined,
    task_id: node.data.taskId,
    input_schema: node.data.inputSchema,
    output_schema: node.data.outputSchema,
  };
}
