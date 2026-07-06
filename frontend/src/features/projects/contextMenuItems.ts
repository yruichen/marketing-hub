import { Copy, Pencil, Trash2, X, RotateCcw } from 'lucide-react';

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: typeof Pencil;
  danger?: boolean;
  divider?: boolean;
  onClick: () => void;
}

/**
 * 工具：根据项目状态生成标准的右键菜单项。
 * 调用方传入操作回调，避免组件耦合。
 * 单独成文件，避免与 ContextMenu 组件同文件导出（react-refresh 约束）。
 */
export function buildProjectContextItems(params: {
  isDeleted: boolean;
  onOpen: () => void;
  onSetAsCurrent: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onCopyName: () => void;
}): ContextMenuItem[] {
  return [
    { key: 'open', label: '打开 / 查看', icon: Pencil, onClick: params.onOpen },
    ...(params.isDeleted
      ? [{ key: 'restore', label: '从回收站恢复', icon: RotateCcw as typeof Pencil, onClick: params.onRestore }]
      : [{ key: 'current', label: '设为当前', icon: Copy as typeof Pencil, onClick: params.onSetAsCurrent }]),
    { key: 'd1', label: '', divider: true, onClick: () => undefined },
    { key: 'copy', label: '复制名称', icon: X as typeof Pencil, onClick: params.onCopyName },
    { key: 'd2', label: '', divider: true, onClick: () => undefined },
    { key: 'delete', label: '移至回收站', icon: Trash2, danger: true, onClick: params.onDelete },
  ];
}
