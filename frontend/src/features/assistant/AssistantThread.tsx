import { useEffect, useRef } from 'react';
import type { ChatMessage } from './types';
import { MessageBubble } from './MessageBubble';
import './assistant.css';

interface AssistantThreadProps {
  messages: ChatMessage[];
  sending: boolean;
  onNavigate: (
    tab: string,
    projectId?: number,
    assetId?: number,
    reason?: string,
  ) => void;
}

/**
 * Scrollable message list. Auto-scrolls to the bottom whenever a new
 * message or text delta arrives so the user always sees the latest
 * streamed content.
 */
export function AssistantThread({
  messages,
  sending,
  onNavigate,
}: AssistantThreadProps) {
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
        <MessageBubble key={m.id} message={m} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
