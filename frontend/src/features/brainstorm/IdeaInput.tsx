import { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useUnderlineProgress } from './useUnderlineProgress';

interface IdeaInputProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
}

/**
 * 输入框 + 智能下划线 + 提交按钮。
 *   - 下划线三态：idle 0% / focused 30% / filled 100%
 *   - 自动聚焦由父组件传 ref 控制；本组件只管自己内部的 focus 态
 *   - onSubmit 在回车或点击 Ignite 时触发
 */
export function IdeaInput({ value, onChange, onSubmit }: IdeaInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const underlineWidth = useUnderlineProgress(value, isFocused);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder="e.g., Launch a minimalist coffee brand targeting Gen Z on Xiaohongshu..."
        className="w-full bg-transparent border-b-2 border-[var(--editorial-stroke)] pb-3 text-lg md:text-xl font-sans text-[var(--editorial-text)] placeholder:text-[var(--editorial-text-gray)]/50 focus:outline-none focus:border-neoYellow transition-colors"
      />
      <div
        className="brainstorm-underline"
        style={{ width: `${underlineWidth}%` }}
      />
      <div className="flex items-center justify-between mt-10">
        <span className="font-mono text-[9px] text-[var(--editorial-text-gray)] uppercase tracking-wider">
          Press Enter to brainstorm
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim()}
          className="btn-editorial-primary flex items-center gap-2 px-6 py-3 rounded-none font-bold text-[11px] uppercase tracking-[0.15em] disabled:opacity-40 disabled:cursor-not-allowed hover:translate-y-[-1px] transition-transform"
        >
          <Sparkles size={14} />
          Ignite
        </button>
      </div>
    </div>
  );
}
