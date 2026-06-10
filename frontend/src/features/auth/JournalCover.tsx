interface JournalCoverProps {
  year: number;
}

/**
 * 杂志风封面：左下 vol/年月小标签 + 居中标题。
 * 整张卡面用 backface-visibility:hidden，避免翻到背面时镜像出字。
 */
export function JournalCover({ year }: JournalCoverProps) {
  return (
    <div className="journal-face journal-face--cover bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial p-8 paper-sheet-1 relative flex flex-col">
      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-[var(--editorial-text-gray)] font-bold">
        <span>vol.01</span>
        <span>{year}</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <p className="font-mono text-[10px] tracking-widest uppercase text-[var(--editorial-text-gray)] mb-3 font-bold">
          // 营销内容工作台
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-[var(--editorial-text)] serif-header leading-none">
          Marketing
        </h1>
        <h1 className="text-4xl font-bold tracking-tight text-[var(--editorial-text)] serif-header leading-none mt-1">
          -Hub
        </h1>
        <div className="mt-6 w-12 h-[1.5px] bg-[var(--editorial-stroke)]" />
        <p className="mt-4 font-mono text-[10px] tracking-wider uppercase text-[var(--editorial-text-gray)] font-semibold">
          analog editorial workspace
        </p>
      </div>

      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--editorial-text-gray)] font-bold flex items-center justify-between">
        <span>— opening —</span>
        <span>↻</span>
      </div>
    </div>
  );
}
