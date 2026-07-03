import { ClipboardList, Copy, Link2, Play, RotateCcw, Settings2, Trash2 } from 'lucide-react';
import type { WorkflowNode, WorkflowEdge } from '../../types/workspace';

interface ContextMenuProps {
  nodeId: string;
  x: number;
  y: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  readOnly: boolean;
  onStartConnect: (nodeId: string) => void;
  onDuplicate: (nodeId: string) => void;
  onConfigure: (nodeId: string) => void;
  onCopyDiagnostics: (nodeId: string) => void;
  onRecoverFromNode: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

export function ContextMenu({
  nodeId, x, y, nodes, readOnly,
  onStartConnect, onDuplicate, onConfigure, onCopyDiagnostics, onRecoverFromNode, onDelete, onClose,
}: ContextMenuProps) {
  const ctxNode = nodes.find((n) => n.id === nodeId);
  return (
    <div
      className="fixed z-50 bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] shadow-editorial-sm py-1 min-w-[160px]"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="w-full px-3 py-2 text-left text-[10px] font-bold hover:bg-[var(--editorial-unselected)] flex items-center gap-2"
        onClick={() => { onStartConnect(nodeId); onClose(); }}
      >
        <Link2 className="h-3.5 w-3.5" /> 连线到…
      </button>
      <button
        type="button"
        className="w-full px-3 py-2 text-left text-[10px] font-bold hover:bg-[var(--editorial-unselected)] flex items-center gap-2"
        onClick={() => { onDuplicate(nodeId); onClose(); }}
      >
        <Copy className="h-3.5 w-3.5" /> 复制节点
      </button>
      {ctxNode?.status === 'failed' && (
        <button
          type="button"
          className="w-full px-3 py-2 text-left text-[10px] font-bold hover:bg-[var(--editorial-unselected)] flex items-center gap-2"
          onClick={() => { onConfigure(nodeId); onClose(); }}
        >
        <RotateCcw className="h-3.5 w-3.5" /> 查看失败 / 重试
        </button>
      )}
      <button
        type="button"
        className="w-full px-3 py-2 text-left text-[10px] font-bold hover:bg-[var(--editorial-unselected)] flex items-center gap-2 disabled:opacity-40"
        disabled={readOnly}
        onClick={() => { onRecoverFromNode(nodeId); onClose(); }}
      >
        <Play className="h-3.5 w-3.5" /> 从此向后重跑
      </button>
      <button
        type="button"
        className="w-full px-3 py-2 text-left text-[10px] font-bold hover:bg-[var(--editorial-unselected)] flex items-center gap-2"
        onClick={() => { onCopyDiagnostics(nodeId); onClose(); }}
      >
        <ClipboardList className="h-3.5 w-3.5" /> 复制输入快照
      </button>
      <button
        type="button"
        className="w-full px-3 py-2 text-left text-[10px] font-bold hover:bg-[var(--editorial-unselected)] flex items-center gap-2"
        onClick={() => { onConfigure(nodeId); onClose(); }}
      >
        <Settings2 className="h-3.5 w-3.5" /> 打开详情
      </button>
      <div className="border-t border-[var(--editorial-stroke)] my-1" />
      <button
        type="button"
        className="w-full px-3 py-2 text-left text-[10px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2 disabled:opacity-40"
        disabled={readOnly}
        onClick={() => { onDelete(nodeId); onClose(); }}
      >
        <Trash2 className="h-3.5 w-3.5" /> 删除节点
      </button>
    </div>
  );
}
