import { useState } from 'react';

export function AgentTerminal({ logs }: { logs: string[] }) {
  const [open, setOpen] = useState(true);
  const hasActivity = logs.length > 0;

  return (
    <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] overflow-hidden shadow-editorial transform rotate-[0.1deg]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full bg-[var(--editorial-unselected)] px-5 py-3 border-b-1.5 border-[var(--editorial-stroke)] flex items-center justify-between text-[10px] font-black text-[var(--editorial-text)] font-mono tracking-wider cursor-pointer transition-all"
      >
        <span className="flex items-center gap-2">
          <span>创作进度</span>
        </span>
        <span className="text-[9px] bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] px-2 py-0.5 font-bold">
          {open ? '收起' : '展开'}
        </span>
      </button>

      {open && (
        <div className="bg-[var(--editorial-bg)]/60 p-4 font-mono text-[9px] leading-relaxed text-[var(--editorial-text)] max-h-[140px] overflow-y-auto pr-1 border-t border-[var(--editorial-stroke)]">
          <div className="space-y-2">
            <div className="flex items-center justify-between border border-[var(--editorial-stroke)]/30 px-3 py-2">
              <span>{hasActivity ? '素材已整理完成' : '等待开始创作'}</span>
              <span className={hasActivity ? 'text-emerald-600 font-black' : 'text-[var(--editorial-text-gray)]'}>{hasActivity ? '完成' : '待处理'}</span>
            </div>
            <div className="flex items-center justify-between border border-[var(--editorial-stroke)]/30 px-3 py-2">
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