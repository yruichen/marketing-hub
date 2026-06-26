import { useEffect, useRef } from 'react';
import { Bot, Sparkles } from 'lucide-react';
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
  onQuickPrompt?: (text: string) => void;
  quickPrompts?: string[];
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
  onQuickPrompt,
  quickPrompts = ['列出最近项目', '帮我生成一段短视频文案', '打开资产库'],
}: AssistantThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  return (
    <div className="assistant-thread" ref={scrollRef}>
      {messages.length === 0 ? (
        <div className="assistant-empty">
          <div className="assistant-empty__mark">
            <Bot className="h-5 w-5" />
          </div>
          <strong>Marketing-Hub 助手</strong>
          <p>我会结合当前页面、项目与历史任务回答，也可以直接帮你跳转到对应工作区。</p>
          <div className="assistant-empty__quick">
            <span className="assistant-empty__quick-title"><Sparkles className="h-3 w-3" /> 快速起步</span>
            <div className="assistant-empty__quicklist">
              {quickPrompts.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  className="assistant-quick-btn"
                  onClick={() => onQuickPrompt?.(prompt)}
                  disabled={sending}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        messages.map((m) => (
          <MessageBubble key={m.id} message={m} onNavigate={onNavigate} />
        ))
      )}
    </div>
  );
}
