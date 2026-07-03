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
import { WorkflowNodeComponent, type FlowNode } from './WorkflowNodeComponent';

const nodeTypes = { workflowNode: WorkflowNodeComponent };

const defaultEdgeOpts = {
  type: 'smoothstep' as const,
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: 'var(--workflow-edge-color)' },
  style: { stroke: 'var(--workflow-edge-color)', strokeWidth: 2.2 },
};

interface WorkflowBuilderCanvasProps {
  nodes: FlowNode[];
  edges: Edge[];
  readOnly: boolean;
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
}

export function WorkflowBuilderCanvas({
  nodes,
  edges,
  readOnly,
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
      connectionLineStyle={{ stroke: 'var(--editorial-accent-blue)', strokeWidth: 2.4 }}
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
      className="workflow-canvas editorial-grid min-w-0"
    >
      <Background color="var(--editorial-dot-color)" gap={16} size={1.2} variant={BackgroundVariant.Dots} />
      <MiniMap pannable zoomable nodeStrokeColor="var(--border-default)" nodeColor="var(--surface-elevated)" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
