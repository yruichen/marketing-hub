import { useEffect, useState } from 'react';

/**
 * 挂载后延时把"开"置为 true，让 JournalBook 自动沿书脊翻一次。
 * delay 0 = 挂载即翻；>0 = 等候用户读完封面。
 * 改交互时机（hover 翻 / 点击翻）时只动这一个 hook。
 */
export function useLoginAutoplay(delayMs: number = 600): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return open;
}
