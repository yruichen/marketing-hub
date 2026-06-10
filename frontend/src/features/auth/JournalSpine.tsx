interface JournalSpineProps {
  side: 'left' | 'right';
}

/**
 * 装订条/书脊：固定在书页一侧的细高亮线，3D 翻页时留在原位不动。
 * 颜色复用 --editorial-accent-yellow，与按钮主色形成对比。
 */
export function JournalSpine({ side }: JournalSpineProps) {
  const positionClass = side === 'left' ? 'left-0' : 'right-0';
  return (
    <div
      aria-hidden
      className={`journal-spine absolute top-0 bottom-0 ${positionClass} w-[6px] pointer-events-none`}
    />
  );
}
