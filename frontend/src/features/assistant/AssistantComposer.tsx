import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send, Trash2 } from 'lucide-react';
import './assistant.css';

interface AssistantComposerProps {
  onSend: (text: string) => void | Promise<void>;
  sending: boolean;
  error: string | null;
  disabled: boolean;
}

/**
 * Input area at the bottom of the drawer. Enter sends, Shift+Enter
 * inserts a newline. Autofocuses when the drawer opens.
 */
export function AssistantComposer({ onSend, sending, error, disabled }: AssistantComposerProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const maxLength = 2000;

  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  const send = () => {
    const payload = text.trim();
    if (!payload || sending) return;
    onSend(payload);
    setText('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const onClear = () => {
    setText('');
    ref.current?.focus();
  };

  const isNearLimit = text.length > Math.floor(maxLength * 0.9);
  const hintClass = `assistant-composer__hint ${isNearLimit ? 'is-alert' : ''}`;

  return (
    <div className="assistant-composer">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, maxLength))}
        onKeyDown={onKey}
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        className="assistant-composer__textarea"
        rows={2}
        disabled={disabled}
      />
      {error ? <div className="assistant-composer__error">⚠ {error}</div> : null}
      <div className="assistant-composer__toolbar">
        <div className="assistant-composer__toolbar-left">
          {text ? (
            <button type="button" className="assistant-composer__clear" onClick={onClear}>
              <Trash2 className="h-3 w-3" />
              清空
            </button>
          ) : (
            <span />
          )}
          <span className={hintClass}>
            {text.length}/{maxLength}
            {sending ? <strong> · 发送中</strong> : null}
          </span>
        </div>
        <button
          type="button"
          className="assistant-composer__send"
          onClick={send}
          disabled={!text.trim() || sending}
        >
          <Send className="h-3 w-3" />
          {sending ? '发送中' : '发送'}
        </button>
      </div>
    </div>
  );
}
