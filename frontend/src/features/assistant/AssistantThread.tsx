import { useEffect, useRef } from 'react';
import type { ChatMessage } from './useAssistantChat';
import './assistant.css';

interface AssistantThreadProps {
  messages: ChatMessage[];
  sending: boolean;
}

/**
 * Scrollable message list. Auto-scrolls to the bottom whenever a new
 * message or text delta arrives so the user always sees the latest
 * streamed content.
 */
export function AssistantThread({ messages, sending }: AssistantThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  if (messages.length === 0) {
    return (
      <div className="assistant-thread" ref={scrollRef}>
        <div className="assistant-empty">
          👋 你好，我是 Marketing-Hub 助手。
          <br />
          <br />
          试试：
          <br />
          · 列出我最近的项目
          <br />
          · 帮我生成一段小红书爆款文案
          <br />
          · 跳到资产库
        </div>
      </div>
    );
  }

  return (
    <div className="assistant-thread" ref={scrollRef}>
      {messages.map((m) => (
        <MessageRow key={m.id} message={m} />
      ))}
    </div>
  );
}

function MessageRow({ message }: { message: ChatMessage }) {
  return (
    <div className={`assistant-msg assistant-msg--${message.role}`}>
      <span className="assistant-msg__role">
        {message.role === 'user' ? '我' : '助手'}
      </span>
      <div
        className={`assistant-msg__bubble ${message.pending ? 'assistant-msg__bubble--pending' : ''}`}
      >
        {message.content || (message.pending ? '思考中' : '')}
      </div>
      {message.toolCalls.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {message.toolCalls.map((tc, i) => (
            <div key={i} className="assistant-tool">
              <div className="assistant-tool__name">→ {tc.name}</div>
              {Object.keys(tc.args).length > 0 ? (
                <div className="assistant-tool__args">
                  {JSON.stringify(tc.args, null, 0)}
                </div>
              ) : null}
              {tc.result !== undefined ? (
                <div className="assistant-tool__result">
                  {typeof tc.result === 'string'
                    ? tc.result
                    : JSON.stringify(tc.result, null, 0).slice(0, 240)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
