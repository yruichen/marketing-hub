import { useCallback, useRef, useState } from 'react';
import { apiStream, formatErrorForToast, parseApiErrorResponse } from '../../hooks/useApi';
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

const WAITING_HINTS = [
  '正在连接助手',
  '正在理解需求',
  '任务可能需要一点时间，仍在处理',
  '正在等待模型返回结果',
  '还在继续处理，请稍候',
  '正在整理最终回复',
];

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
        statusText: WAITING_HINTS[0],
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
      let liveStatusText = WAITING_HINTS[0];
      const streamStartedAt = Date.now();
      const commit = () => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: liveContent, toolCalls: [...liveToolCalls], statusText: liveStatusText }
              : m,
          ),
        );
      };
      const statusTimer = window.setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - streamStartedAt) / 1000);
        const nextHint = elapsedSeconds >= 45
          ? WAITING_HINTS[5]
          : elapsedSeconds >= 25
            ? WAITING_HINTS[4]
            : elapsedSeconds >= 12
              ? WAITING_HINTS[3]
              : elapsedSeconds >= 5
                ? WAITING_HINTS[2]
                : '';
        if (nextHint && nextHint !== liveStatusText) {
          liveStatusText = nextHint;
          commit();
        }
      }, 3000);

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
          throw await parseApiErrorResponse(res, '/assistant/chat');
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

            if (event.type === 'status' && event.status_text) {
              liveStatusText = event.status_text;
              commit();
            } else if (event.type === 'text' && event.delta) {
              liveContent += event.delta;
              commit();
            } else if (event.type === 'tool_call' && event.name) {
              liveStatusText = toolStatusText(event.name, 'running');
              if (event.name === 'navigate') {
                liveToolCalls.push({
                  name: event.name,
                  args: event.args ?? {},
                  status: 'running',
                });
              } else {
                liveToolCalls.push({
                  name: event.name,
                  args: {},
                  status: 'running',
                });
              }
              commit();
              // Browser-side tool intents (e.g. clipboard, file picker).
              // navigate is intentionally NOT handled here — it surfaces
              // as a button on the ToolCallCard so the user opts in.
              const handler = clientTools[event.name];
              if (handler) {
                try {
                  const result = await handler(event.args ?? {});
                  liveToolCalls[liveToolCalls.length - 1].result = result;
                  liveToolCalls[liveToolCalls.length - 1].status = 'done';
                  commit();
                } catch (err) {
                  liveToolCalls[liveToolCalls.length - 1].result = {
                    error: formatErrorForToast(err, '客户端工具执行失败'),
                  };
                  liveToolCalls[liveToolCalls.length - 1].status = 'error';
                  commit();
                }
              }
            } else if (event.type === 'tool_result' && event.name) {
              const last = liveToolCalls[liveToolCalls.length - 1];
              if (last && last.name === event.name) {
                last.status = hasToolError(event.result) ? 'error' : 'done';
                if (event.name === 'navigate') {
                  last.result = event.result;
                }
                liveStatusText = toolStatusText(event.name, last.status);
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
        const message = formatErrorForToast(err, '助手暂时无法回复，请稍后重试');
        setError(message);
      } finally {
        window.clearInterval(statusTimer);
        setSending(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, pending: false, statusText: '' } : m,
          ),
        );
        abortRef.current = null;
      }
    },
    [sending],
  );

  return { messages, sending, error, send, reset, loadHistory };
}

function hasToolError(result: unknown): boolean {
  return Boolean(result && typeof result === 'object' && 'error' in result);
}

function toolStatusText(name: string, status: 'running' | 'done' | 'error'): string {
  const labels: Record<string, string> = {
    list_projects: '查询项目列表',
    get_project: '读取项目详情',
    get_dashboard: '汇总工作台数据',
    create_copy: '生成营销文案',
    navigate: '准备页面跳转',
  };
  const label = labels[name] || '调用工作区工具';
  if (status === 'running') return `正在${label}`;
  if (status === 'error') return `${label}遇到问题，正在调整回答`;
  return `已完成${label}`;
}
