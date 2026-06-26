import type { WorkflowEdge, WorkflowNode } from '../../types/workspace';
import { ContextMenu } from './ContextMenu';
import { WorkflowEdgeContextMenu } from './WorkflowBuilderOverlays';

interface WorkflowBuilderContextMenusProps {
  contextMenu: { nodeId: string; x: number; y: number } | null;
  edgeContextMenu: { edgeId: string; x: number; y: number } | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  readOnly: boolean;
  onStartConnect: (id: string) => void;
  onDuplicateNode: (id: string) => void;
  onConfigureNode: (id: string) => void;
  onCopyNodeDiagnostics: (id: string) => void;
  onRecoverFromNode: (id: string) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onCloseContextMenu: () => void;
  onCloseEdgeContextMenu: () => void;
}

export function WorkflowBuilderContextMenus({
  contextMenu,
  edgeContextMenu,
  nodes,
  edges,
  readOnly,
  onStartConnect,
  onDuplicateNode,
  onConfigureNode,
  onCopyNodeDiagnostics,
  onRecoverFromNode,
  onDeleteNode,
  onDeleteEdge,
  onCloseContextMenu,
  onCloseEdgeContextMenu,
}: WorkflowBuilderContextMenusProps) {
  return (
    <>
      {contextMenu && (
        <ContextMenu
          nodeId={contextMenu.nodeId}
          x={contextMenu.x}
          y={contextMenu.y}
          nodes={nodes}
          edges={edges}
          readOnly={readOnly}
          onStartConnect={onStartConnect}
          onDuplicate={onDuplicateNode}
          onConfigure={onConfigureNode}
          onCopyDiagnostics={onCopyNodeDiagnostics}
          onRecoverFromNode={onRecoverFromNode}
          onDelete={onDeleteNode}
          onClose={onCloseContextMenu}
        />
      )}

      {edgeContextMenu && (
        <WorkflowEdgeContextMenu
          x={edgeContextMenu.x}
          y={edgeContextMenu.y}
          onDelete={() => {
            onDeleteEdge(edgeContextMenu.edgeId);
            onCloseEdgeContextMenu();
          }}
        />
      )}
    </>
  );
}
