import { useCallback, useRef, useState } from 'react';
import { apiStream } from '../../hooks/useApi';
import { clientTools } from './clientTools';
import type { AssistantSseEvent, ChatMessage, PageContext } from './types';

export type { ChatMessage, ChatMessageRole } from './types';

interface SendInput {
  text: string;
  sessionId: number | null;
  pageContext: PageContext;
  onSessionId: (id: number) => void;
}

interface UseAssistantChatResult {
  messages: ChatMessage[];
  sending: boolean;
  error: string | null;
  send: (input: SendInput) => Promise<void>;
  reset: () => void;
  loadHistory: (history: ChatMessage[]) => void;
}

function newId(): string {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseSseEvent(raw: string): AssistantSseEvent | null {
  for (const line of raw.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      return JSON.parse(line.slice('data: '.length)) as AssistantSseEvent;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Pure SSE consumer. We avoid @ai-sdk/react's `useChat` because our
 * backend speaks a custom event protocol (text/tool_call/tool_result/
 * done/error), not OpenAI ChatCompletion chunks.
 *
 * The "current assistant message" being streamed is mutated in place
 * via setMessages; we keep its id stable across the whole stream.
 */
export function useAssistantChat(): UseAssistantChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setError(null);
  }, []);

  const loadHistory = useCallback((history: ChatMessage[]) => {
    setMessages(history);
  }, []);

  const send = useCallback(
    async ({ text, sessionId, pageContext, onSessionId }: SendInput) => {
      if (!text.trim() || sending) return;
      setError(null);

      const userMsg: ChatMessage = {
        id: newId(),
        role: 'user',
        content: text,
        toolCalls: [],
      };
      const assistantId = newId();
      const initialAssistant: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        toolCalls: [],
        pending: true,
      };
      setMessages((prev) => [...prev, userMsg, initialAssistant]);
      setSending(true);

      const controller = new AbortController();
      abortRef.current = controller;

      // Local mutable view onto the assistant message we're streaming.
      // We commit each event through setMessages with a fresh object so
      // React re-renders.
      const liveToolCalls: ChatMessage['toolCalls'] = [];
      let liveContent = '';
      const commit = () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: liveContent, toolCalls: [...liveToolCalls] }
              : m,
          ),
        );
      };

      try {
        const res = await apiStream('/assistant/chat', {
          method: 'POST',
          body: JSON.stringify({
            session_id: sessionId,
            message: text,
            page_context: pageContext,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          // Surface the backend's body (DRF throttle messages, upstream
          // 4xx, etc.) so the user gets actionable text instead of
          // just "HTTP 429".
          let detail = '';
          try {
            detail = (await res.text()).slice(0, 200);
          } catch {
            /* body not readable */
          }
          throw new Error(
            res.status === 429
              ? `请求过于频繁（429）${detail ? `：${detail}` : ''}`
              : `HTTP ${res.status}${detail ? `：${detail}` : ''}`,
          );
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            const event = parseSseEvent(rawEvent);
            if (!event) continue;

            if (event.type === 'text' && event.delta) {
              liveContent += event.delta;
              commit();
            } else if (event.type === 'tool_call' && event.name) {
              liveToolCalls.push({
                name: event.name,
                args: event.args ?? {},
              });
              commit();
              // Browser-side tool intents (e.g. clipboard, file picker).
              // navigate is intentionally NOT handled here — it surfaces
              // as a button on the ToolCallCard so the user opts in.
              const handler = clientTools[event.name];
              if (handler) {
                try {
                  const result = await handler(event.args ?? {});
                  liveToolCalls[liveToolCalls.length - 1].result = result;
                  commit();
                } catch (err) {
                  liveToolCalls[liveToolCalls.length - 1].result = {
                    error: err instanceof Error ? err.message : 'client tool failed',
                  };
                  commit();
                }
              }
            } else if (event.type === 'tool_result' && event.name) {
              const last = liveToolCalls[liveToolCalls.length - 1];
              if (last && last.name === event.name) {
                last.result = event.result;
                commit();
              }
            } else if (event.type === 'done') {
              if (typeof event.session_id === 'number') {
                onSessionId(event.session_id);
              }
            } else if (event.type === 'error') {
              // Lift error out of the bubble into the composer's error
              // slot — it's much more visible there, and we cancel the
              // 'pending' state so the spinner stops.
              const upstreamStatus = event.status;
              const msg = event.error ?? 'unknown';
              setError(
                upstreamStatus === 429
                  ? `上游模型限流（429）：${msg}`
                  : upstreamStatus
                    ? `上游模型 ${upstreamStatus}：${msg}`
                    : msg,
              );
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '未知错误';
        setError(message);
      } finally {
        setSending(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, pending: false } : m,
          ),
        );
        abortRef.current = null;
      }
    },
    [sending],
  );

  return { messages, sending, error, send, reset, loadHistory };
}
