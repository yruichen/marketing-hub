import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
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

  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);

  const send = () => {
    if (!text.trim() || sending) return;
    onSend(text);
    setText('');
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="assistant-composer">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        className="assistant-composer__textarea"
        rows={2}
        disabled={disabled}
      />
      {error ? <div className="assistant-composer__error">⚠ {error}</div> : null}
      <div className="assistant-composer__bar">
        <span className="assistant-composer__hint">
          {text.length}/2000
        </span>
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
