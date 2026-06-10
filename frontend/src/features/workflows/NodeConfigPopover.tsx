import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Trash2, X } from 'lucide-react';
import { useReactFlow, useStore } from '@xyflow/react';
import type { WorkflowNode } from '../../types/workspace';
import { nodeTypeLabels } from './constants';
import { NodeConfigFields } from './NodeConfigFields';
import { nodeStatusDotClass } from './utils';

type NodeConfigPopoverProps = {
  node: WorkflowNode | null;
  readOnly: boolean;
  feedback: string;
  loadingState: string;
  onUpdateNode: (id: string, patch: Partial<WorkflowNode>) => void;
  onUpdateConfig: (key: string, value: string | number) => void;
  onSetFeedback: (value: string) => void;
  onRetryNode: () => void;
  onRemoveNode: () => void;
  onClose: () => void;
};

const PANEL_WIDTH = 340;
const panelMaxHeight = () => (typeof window !== 'undefined' ? Math.min(520, window.innerHeight - 48) : 520);

function clampPosition(left: number, top: number, height: number) {
  const margin = 12;
  const maxLeft = window.innerWidth - PANEL_WIDTH - margin;
  const maxTop = window.innerHeight - height - margin;
  return {
    left: Math.max(margin, Math.min(left, maxLeft)),
    top: Math.max(margin, Math.min(top, maxTop)),
  };
}

export function NodeConfigPopover({
  node,
  readOnly,
  feedback,
  loadingState,
  onUpdateNode,
  onUpdateConfig,
  onSetFeedback,
  onRetryNode,
  onRemoveNode,
  onClose,
}: NodeConfigPopoverProps) {
  const { getNode, flowToScreenPosition } = useReactFlow();
  const [viewportX, viewportY, viewportZoom] = useStore((state) => state.transform);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const position = useMemo(() => {
    if (!node || readOnly) return null;
    const rfNode = getNode(node.id);
    if (!rfNode) return null;
    const nodeWidth = rfNode.width ?? 260;
    const nodeHeight = rfNode.height ?? 150;
    const right = flowToScreenPosition({ x: rfNode.position.x + nodeWidth + 16, y: rfNode.position.y });
    const leftSide = flowToScreenPosition({ x: rfNode.position.x - PANEL_WIDTH - 16, y: rfNode.position.y });
    const below = flowToScreenPosition({ x: rfNode.position.x, y: rfNode.position.y + nodeHeight + 12 });
    const preferRight = right.x + PANEL_WIDTH <= window.innerWidth - 12;
    const base = preferRight ? right : leftSide.x > 12 ? leftSide : below;
    return clampPosition(base.x, base.y, panelMaxHeight());
  }, [node, readOnly, getNode, flowToScreenPosition, viewportX, viewportY, viewportZoom]);

  if (!node || readOnly || !position) return null;

  return createPortal(
    <div
      className="fixed z-[1200] nodrag nopan"
      style={{ left: position.left, top: position.top, width: PANEL_WIDTH, maxHeight: panelMaxHeight() }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col max-h-[inherit] border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] shadow-editorial overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--editorial-stroke)] px-4 py-3 shrink-0">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={node.label}
              onChange={(e) => onUpdateNode(node.id, { label: e.target.value })}
              className="nodrag nopan w-full bg-transparent text-base font-black text-[var(--editorial-text)] border-b border-[var(--editorial-stroke)]/50 py-1 focus:outline-none focus:border-[var(--editorial-accent-blue)]"
              placeholder="节点名称"
            />
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--editorial-text-gray)]">
              <span className={`h-2 w-2 rounded-full ${nodeStatusDotClass(node.status)}`} />
              <span>{nodeTypeLabels[node.type] || node.type}</span>
              <span>·</span>
              <span>{node.status || '未运行'}</span>
            </div>
            {node.status === 'failed' && node.error_message && (
              <p className="mt-2 text-[10px] text-rose-600 leading-snug line-clamp-2">{node.error_message}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-[var(--editorial-stroke)] p-1.5 hover:bg-[var(--editorial-unselected)] shrink-0"
            aria-label="关闭配置"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3 flex-1 min-h-0">
          <NodeConfigFields node={node} onUpdateConfig={onUpdateConfig} variant="popover" />
        </div>
        <div className="border-t border-[var(--editorial-stroke)] px-4 py-3 space-y-2 shrink-0">
          {node.status === 'failed' && (
            <>
              <textarea
                rows={2}
                value={feedback}
                onChange={(e) => onSetFeedback(e.target.value)}
                className="nodrag nopan w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-2 text-sm resize-none focus:outline-none focus:border-[var(--editorial-accent-blue)]"
                placeholder="填写修改意见后可重试节点"
              />
              <button
                type="button"
                onClick={onRetryNode}
                disabled={loadingState !== 'idle' || !feedback.trim()}
                className="w-full border border-[var(--editorial-stroke)] py-2 text-[10px] font-black uppercase hover:bg-[var(--editorial-unselected)] flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" /> 按意见重试
              </button>
            </>
          )}
          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { onRemoveNode(); onClose(); }}
                className="flex-1 border border-rose-400 py-2 text-[10px] font-black text-rose-600 hover:bg-rose-50"
              >
                确认删除
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 border border-[var(--editorial-stroke)] py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full border border-[var(--editorial-stroke)] py-2 text-[10px] font-black text-rose-600 hover:bg-rose-50 flex items-center justify-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" /> 删除节点
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
