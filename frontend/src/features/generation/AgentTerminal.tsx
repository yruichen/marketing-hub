import { useState } from 'react';

export function AgentTerminal({ logs, className = '' }: { logs: string[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const hasActivity = logs.length > 0;

  return (
    <div className={`agent-terminal bg-[var(--surface-panel)] border border-[var(--border-subtle)] overflow-hidden shadow-[var(--shadow-panel)] ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="agent-terminal__toggle w-full bg-[var(--surface-elevated)] px-4 py-2.5 border-b border-[var(--border-subtle)] flex items-center justify-between text-[10px] font-black text-[var(--editorial-text)] font-mono tracking-wider cursor-pointer transition-all hover:bg-[var(--surface-hover)]"
      >
        <span className="flex items-center gap-2">
          <span>创作进度</span>
          <span className={hasActivity ? 'agent-terminal__dot is-done' : 'agent-terminal__dot'} aria-hidden="true" />
        </span>
        <span className="text-[9px] bg-[var(--surface-panel)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5 font-bold">
          {open ? '收起' : '展开'}
        </span>
      </button>

      {open && (
        <div className="bg-[var(--surface-canvas)]/60 p-3 font-mono text-[9px] leading-relaxed text-[var(--editorial-text)] max-h-[120px] overflow-y-auto pr-1 border-t border-[var(--border-subtle)]">
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-3 py-2">
              <span>{hasActivity ? '素材已整理完成' : '等待开始创作'}</span>
              <span className={hasActivity ? 'text-emerald-600 font-black' : 'text-[var(--editorial-text-gray)]'}>{hasActivity ? '完成' : '待处理'}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-3 py-2">
              <span>品牌设定同步</span>
              <span className="text-emerald-600 font-black">{hasActivity ? '已同步' : '准备中'}</span>
            </div>
            <div className="text-[var(--editorial-text-gray)] leading-relaxed">
              {hasActivity ? '已根据当前输入生成结果，可继续修改参数或发布到作品库。' : '点击生成后，这里会显示面向创作者的进度摘要。'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
