import { X } from 'lucide-react';

export function WorkflowHandoffBanner({
  onRun,
  onInspect,
  onClose,
}: {
  onRun: () => void;
  onInspect: () => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute left-4 right-4 top-4 z-20 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] shadow-editorial-sm px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wide text-[var(--editorial-text)]">
          已根据你的灵感生成工作流草稿
        </p>
        <p className="text-[9px] text-[var(--editorial-text-gray)] mt-0.5">
          可先检查节点配置，也可以直接运行。
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onInspect} className="border border-[var(--editorial-stroke)] px-2.5 py-1.5 text-[9px] font-black hover:bg-[var(--editorial-unselected)]">
          检查第一个节点
        </button>
        <button type="button" onClick={onRun} className="btn-editorial-primary px-3 py-1.5 text-[9px] font-black uppercase">
          运行工作流
        </button>
        <button type="button" onClick={onClose} className="border border-[var(--editorial-stroke)] p-1.5 hover:bg-[var(--editorial-unselected)]" title="关闭" aria-label="关闭提示">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function WorkflowConnectionHint() {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 py-1.5 text-[10px] font-black shadow-editorial-sm">
      点击目标节点完成连接 · ESC 取消
    </div>
  );
}

export function WorkflowLoadingOverlay() {
  return (
    <div className="absolute inset-0 z-10 bg-[var(--editorial-bg)]/78 backdrop-blur-[1px] p-8">
      <div className="grid grid-cols-3 gap-8 max-w-4xl">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-44 border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] shadow-editorial-sm opacity-70">
            <div className="h-8 border-b border-[var(--editorial-stroke)]/40 bg-[var(--editorial-unselected)]" />
            <div className="m-4 h-3 w-24 bg-[var(--editorial-unselected)]" />
            <div className="mx-4 mt-3 h-16 border border-dashed border-[var(--editorial-stroke)]/40" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkflowEmptyState({
  onAddCopy,
  onAddImagePrompt,
}: {
  onAddCopy: () => void;
  onAddImagePrompt: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] shadow-editorial p-5 max-w-sm">
        <h4 className="text-xs font-black uppercase">还没有工作流节点</h4>
        <p className="mt-2 text-[10px] text-[var(--editorial-text-gray)]">从常用节点开始搭建当前项目的内容生产流程。</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={onAddCopy} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)]">写渠道文案</button>
          <button type="button" onClick={onAddImagePrompt} className="border border-[var(--editorial-stroke)] px-2.5 py-2 text-[9px] font-black hover:bg-[var(--editorial-unselected)]">生成图片说明</button>
        </div>
      </div>
    </div>
  );
}

export function WorkflowEdgeContextMenu({
  x,
  y,
  onDelete,
}: {
  x: number;
  y: number;
  onDelete: () => void;
}) {
  return (
    <div
      className="fixed z-50 bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] shadow-editorial-sm py-1 min-w-[140px]"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="w-full px-3 py-2 text-left text-[10px] font-bold text-red-600 hover:bg-red-50 flex items-center gap-2"
        onClick={onDelete}
      >
        删除连线
      </button>
    </div>
  );
}
