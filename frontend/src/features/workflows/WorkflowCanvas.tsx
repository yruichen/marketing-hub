import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
} from '@xyflow/react';
import type { WorkflowEdge, WorkflowNode } from '../../types/workspace';
import { schemasCompatible } from './utils';
import { WorkflowNodeComponent, type FlowNode } from './WorkflowNodeComponent';
import { wfToRF } from './conversions';

const nodeTypes = { workflowNode: WorkflowNodeComponent };

const defaultEdgeOptions = {
  type: 'smoothstep' as const,
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  style: { stroke: '#64748b', strokeWidth: 2 },
};

function wfEdgeToRF(edge: WorkflowEdge): Edge {
  return { id: edge.id || `edge-${edge.source}-${edge.target}`, source: edge.source, target: edge.target };
}

// --- Imperative handle ---

export interface WorkflowCanvasHandle {
  getNodes: () => FlowNode[];
  getEdges: () => Edge[];
  setNodesFromWF: (nodes: WorkflowNode[]) => void;
  setEdgesFromWF: (edges: WorkflowEdge[]) => void;
  fitViewNow: () => void;
}

// --- Component ---

interface WorkflowCanvasProps {
  readOnly: boolean;
  connectionSource: string;
  onNodeClick: (nodeId: string) => void;
  onStartConnect: (nodeId: string) => void;
  onOpenContextMenu: (nodeId: string, x: number, y: number) => void;
  onSelectionChange: (nodeIds: string[]) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}

export const WorkflowCanvas = forwardRef<WorkflowCanvasHandle, WorkflowCanvasProps>(
  function WorkflowCanvas(
    {
      readOnly,
      connectionSource,
      onNodeClick,
      onStartConnect,
      onOpenContextMenu,
      onSelectionChange,
      onDragStart,
      onDragEnd,
    },
    ref,
  ) {
    const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const { fitView } = useReactFlow();

    // Refs for callbacks to avoid stale closures
    const nodesRef = useRef(nodes);
    nodesRef.current = nodes;
    const edgesRef = useRef(edges);
    edgesRef.current = edges;

    // Imperative handle for parent
    useImperativeHandle(ref, () => ({
      getNodes: () => nodesRef.current,
      getEdges: () => edgesRef.current,
      setNodesFromWF: (wfNodes: WorkflowNode[]) => setNodes(wfNodes.map(wfToRF)),
      setEdgesFromWF: (wfEdges: WorkflowEdge[]) => setEdges(wfEdges.map(wfEdgeToRF)),
      fitViewNow: () => fitView({ padding: 0.18, duration: 220 }),
    }), [setNodes, setEdges, fitView]);

    // onConnect: add edge directly to ReactFlow state
    const onConnect = useCallback(
      (connection: Connection) => {
        if (readOnly) return;
        if (!connection.source || !connection.target) return;
        if (connection.source === connection.target) return;
        if (edgesRef.current.some((e) => e.source === connection.source && e.target === connection.target)) return;
        const srcNode = nodesRef.current.find((n) => n.id === connection.source);
        const tgtNode = nodesRef.current.find((n) => n.id === connection.target);
        if (srcNode && tgtNode) {
          const srcSchema = srcNode.data.outputSchema || {};
          const tgtSchema = tgtNode.data.inputSchema || {};
          if (!schemasCompatible(srcSchema, tgtSchema)) return;
        }
        setEdges((eds) => addEdge({ ...connection, id: `edge-${connection.source}-${connection.target}` }, eds));
      },
      [readOnly, setEdges],
    );

    const isValidConnection = useCallback(
      (connection: Connection | Edge) => {
        if (readOnly) return false;
        if (!connection.source || !connection.target) return false;
        if (connection.source === connection.target) return false;
        const srcNode = nodesRef.current.find((n) => n.id === connection.source);
        const tgtNode = nodesRef.current.find((n) => n.id === connection.target);
        if (!srcNode || !tgtNode) return false;
        return schemasCompatible(srcNode.data.outputSchema, tgtNode.data.inputSchema);
      },
      [readOnly],
    );

    const handleSelectionChange = useCallback(
      ({ nodes: selected }: { nodes: FlowNode[] }) => onSelectionChange(selected.map((n) => n.id)),
      [onSelectionChange],
    );

    const handleNodeClick = useCallback(
      (_: React.MouseEvent, node: FlowNode) => onNodeClick(node.id),
      [onNodeClick],
    );

    // Inject callbacks + connectionSource flag into node data
    const nodesWithMeta = useMemo(
      () =>
        nodes.map((node) => ({
          ...node,
          data: {
            ...node.data,
            isConnectionSource: connectionSource === node.id,
            onStartConnect,
            onOpenContextMenu,
          },
        })),
      [nodes, connectionSource, onStartConnect, onOpenContextMenu],
    );

    return (
      <ReactFlow
        nodes={nodesWithMeta}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onSelectionChange={handleSelectionChange}
        onNodeClick={handleNodeClick}
        onPaneClick={() => onOpenContextMenu('', 0, 0)}
        onNodeDragStart={onDragStart}
        onNodeDragStop={onDragEnd}
        defaultEdgeOptions={defaultEdgeOptions}
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
        <Controls />
      </ReactFlow>
    );
  },
);

export type { FlowNode } from './WorkflowNodeComponent';
