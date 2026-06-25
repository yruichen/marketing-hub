import { useRef, useState } from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
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
    <div className={`brainstorm-input ${isFocused ? 'is-focused' : ''}`}>
      <div className="brainstorm-input__meta">
        <span>Simple idea</span>
        <span>{value.trim().length}/180</span>
      </div>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={180}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="一个产品、一个人群、一个渠道，先写下来。"
          className="brainstorm-input__field"
        />
        <div
          className="brainstorm-underline"
          style={{ width: `${underlineWidth}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 mt-7">
        <span className="brainstorm-input__signal">
          <Sparkles size={13} />
          workflow seed
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!value.trim()}
          className="brainstorm-input__submit btn-editorial-primary"
        >
          Ignite
          <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  );
}
