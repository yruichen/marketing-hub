import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react';
import type { WorkflowNode } from '../../types/workspace';
import { NodeConfigPopover } from './NodeConfigPopover';
import { WorkflowNodeComponent, type FlowNode } from './WorkflowNodeComponent';
import type { WorkflowLoadingState } from './WorkflowBuilderToolbar';

const nodeTypes = { workflowNode: WorkflowNodeComponent };

const defaultEdgeOpts = {
  type: 'smoothstep' as const,
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  style: { stroke: '#64748b', strokeWidth: 2 },
};

interface WorkflowBuilderCanvasProps {
  nodes: FlowNode[];
  edges: Edge[];
  readOnly: boolean;
  selectedNode: WorkflowNode | null;
  feedback: string;
  loadingState: WorkflowLoadingState;
  onNodesChange: OnNodesChange<FlowNode>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: (connection: Connection) => void;
  isValidConnection: (connection: Connection | Edge) => boolean;
  onSelectionChange: (change: { nodes: FlowNode[] }) => void;
  onNodeClick: (nodeId: string) => void;
  onPaneClick: () => void;
  onEdgeContextMenu: (edgeId: string, x: number, y: number) => void;
  onNodeDragStart: () => void;
  onNodeDragStop: () => void;
  onUpdateNode: (id: string, patch: Partial<WorkflowNode>) => void;
  onUpdateConfig: (key: string, value: string | number) => void;
  onSetFeedback: (value: string) => void;
  onRetryNode: () => Promise<void>;
  onRemoveNode: () => void;
  onCloseNode: () => void;
}

export function WorkflowBuilderCanvas({
  nodes,
  edges,
  readOnly,
  selectedNode,
  feedback,
  loadingState,
  onNodesChange,
  onEdgesChange,
  onConnect,
  isValidConnection,
  onSelectionChange,
  onNodeClick,
  onPaneClick,
  onEdgeContextMenu,
  onNodeDragStart,
  onNodeDragStop,
  onUpdateNode,
  onUpdateConfig,
  onSetFeedback,
  onRetryNode,
  onRemoveNode,
  onCloseNode,
}: WorkflowBuilderCanvasProps) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      isValidConnection={isValidConnection}
      onSelectionChange={onSelectionChange}
      onNodeClick={(_, node) => onNodeClick(node.id)}
      onPaneClick={onPaneClick}
      onEdgeContextMenu={(event, edge) => {
        event.preventDefault();
        onEdgeContextMenu(edge.id, event.clientX, event.clientY);
      }}
      onNodeDragStart={onNodeDragStart}
      onNodeDragStop={onNodeDragStop}
      defaultEdgeOptions={defaultEdgeOpts}
      connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2 }}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.2}
      maxZoom={1.6}
      nodesDraggable={!readOnly}
      nodesConnectable={!readOnly}
      elementsSelectable
      selectionOnDrag
      selectNodesOnDrag={false}
      snapToGrid
      snapGrid={[16, 16]}
      deleteKeyCode={['Backspace', 'Delete']}
      multiSelectionKeyCode={['Meta', 'Shift']}
      className="editorial-grid min-w-0"
    >
      <Background color="var(--editorial-dot-color)" gap={16} size={1.2} variant={BackgroundVariant.Dots} />
      <MiniMap pannable zoomable nodeStrokeColor="var(--editorial-stroke)" nodeColor="var(--editorial-paper)" />
      <Controls showInteractive={false} />
      <NodeConfigPopover
        node={selectedNode}
        readOnly={readOnly}
        feedback={feedback}
        loadingState={loadingState}
        onUpdateNode={onUpdateNode}
        onUpdateConfig={onUpdateConfig}
        onSetFeedback={onSetFeedback}
        onRetryNode={onRetryNode}
        onRemoveNode={onRemoveNode}
        onClose={onCloseNode}
      />
    </ReactFlow>
  );
}
