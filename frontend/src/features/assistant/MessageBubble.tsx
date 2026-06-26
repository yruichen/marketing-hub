import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Clipboard } from 'lucide-react';
import type { ChatMessage } from './types';
import { ToolCallCard } from './ToolCallCard';
import './assistant.css';

interface MessageBubbleProps {
  message: ChatMessage;
  onNavigate: (
    tab: string,
    projectId?: number,
    assetId?: number,
    reason?: string,
  ) => void;
}

/**
 * A single chat turn. User messages are plain text; assistant messages
 * get Markdown (GFM) so the model's bullet lists / code / tables /
 * links render natively.
 */
export function MessageBubble({ message, onNavigate }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={`assistant-msg assistant-msg--${message.role}`}>
      <div className="assistant-msg__top">
        <span className="assistant-msg__role">{isUser ? '我' : '助手'}</span>
        <div className="assistant-msg__actions">
          {!isUser && message.content ? (
            <button
              type="button"
              className="assistant-msg__copy"
              onClick={copy}
              aria-label="复制回复"
            >
              {copied ? <Check className="h-3 w-3" /> : <Clipboard className="h-3 w-3" />}
              {copied ? '已复制' : '复制'}
            </button>
          ) : null}
        </div>
      </div>
      <div
        className={`assistant-msg__bubble ${
          message.pending && !message.content ? 'assistant-msg__bubble--pending' : ''
        } ${!message.content && message.pending === false ? 'assistant-msg__bubble--empty' : ''}`}
      >
        {isUser ? (
          // User input: never run untrusted text through a markdown
          // parser — it's already verbatim from the textarea.
          <span className="assistant-md">{message.content}</span>
        ) : message.content ? (
          <div className="assistant-md">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              // Force links to open in a new tab; the panel is a side
              // drawer so we don't want to nuke the user's place.
              components={{
                a: (props) => (
                  <a {...props} target="_blank" rel="noopener noreferrer" />
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
            {message.pending ? <span className="assistant-md__caret" /> : null}
          </div>
        ) : message.pending ? (
          <span className="assistant-md__thinking">思考中</span>
        ) : (
          <span className="assistant-md__thinking">暂无内容</span>
        )}
      </div>
      {message.toolCalls.length > 0 ? (
        <div className="assistant-msg__tools">
          {message.toolCalls.map((tc, i) => (
            <ToolCallCard key={i} call={tc} onNavigate={onNavigate} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
