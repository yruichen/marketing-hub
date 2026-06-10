import { useEffect, useState } from 'react';

type FocusState = 'idle' | 'focused' | 'filled';

/**
 * 输入框下划线三态进度：
 *   idle    → 0%   （未聚焦 + 空）
 *   focused → 30%  （聚焦 + 空：表示"开始输入吧"）
 *   filled  → 100% （有内容，无论聚焦与否）
 *
 * 用 useEffect 监听状态切换，不在 render 里直接 setState。
 * 颜色/缓动由 CSS 控制，这里只返回 0-100 数字。
 */
export function useUnderlineProgress(value: string, isFocused: boolean): number {
  const compute = (): number => {
    if (value.trim().length > 0) return 100;
    if (isFocused) return 30;
    return 0;
  };
  const [progress, setProgress] = useState<number>(compute);

  useEffect(() => {
    const next = compute();
    if (next !== progress) {
      const timer = window.setTimeout(() => setProgress(next), 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
    // compute is derived from value/isFocused, intentionally inlined.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isFocused, progress]);

  return progress;
}

export function focusStateOf(value: string, isFocused: boolean): FocusState {
  if (value.trim().length > 0) return 'filled';
  if (isFocused) return 'focused';
  return 'idle';
}
