import { useCallback, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { useAssistant } from './useAssistant';
import { useAssistantSessions } from './useAssistantSessions';
import { useAssistantChat } from './useAssistantChat';
import { AssistantThread } from './AssistantThread';
import { AssistantComposer } from './AssistantComposer';
import './assistant.css';

interface AssistantPanelProps {
  /**
   * Where to send the user when the agent emits a `navigate` tool call.
   * Provided by App.tsx so we don't depend on routing internals.
   */
  onNavigate: (tab: string, projectId?: number, assetId?: number, reason?: string) => void;
}

/**
 * 480px right drawer. Mounted once at AppProviders alongside the bubble.
 * Owns its own sessions list, active session id, and chat stream.
 */
export function AssistantPanel({ onNavigate }: AssistantPanelProps) {
  const { open, setOpen, sessionId, setSessionId } = useAssistant();
  const sessions = useAssistantSessions();
  const chat = useAssistantChat();

  // Load history when the active session changes.
  useEffect(() => {
    let cancelled = false;
    if (sessionId !== null) {
      void (async () => {
        const history = await sessions.fetchMessages(sessionId);
        if (cancelled) return;
        chat.loadHistory(
          history
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({
              id: String(m.id),
              role: m.role as 'user' | 'assistant',
              content: m.content,
              toolCalls: m.tool_calls,
            })),
        );
      })();
    } else {
      chat.reset();
    }
    return () => {
      cancelled = true;
    };
    // chat object is stable from useAssistantChat; sessions.fetchMessages too.
  }, [sessionId, chat, sessions]);

  const onNewSession = useCallback(async () => {
    const created = await sessions.createSession('新对话');
    if (created) setSessionId(created.id);
  }, [sessions, setSessionId]);

  const onSelectSession = useCallback(
    (id: number) => setSessionId(id),
    [setSessionId],
  );

  const onSend = useCallback(
    async (text: string) => {
      await chat.send({
        text,
        sessionId,
        pageContext: { route: window.location.pathname },
        onNavigate,
        onSessionId: (id) => setSessionId(id),
      });
    },
    [chat, sessionId, onNavigate, setSessionId],
  );

  return (
    <aside
      className={`assistant-drawer ${open ? 'assistant-drawer--open' : ''}`}
      aria-hidden={!open}
    >
      <header className="assistant-drawer__header">
        <span className="assistant-drawer__title">Marketing-Hub 助手</span>
        <div className="assistant-drawer__actions">
          <button
            type="button"
            onClick={onNewSession}
            className="assistant-drawer__btn"
            title="新建会话"
          >
            <Plus className="h-3 w-3" />
            新建
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="assistant-drawer__btn"
            aria-label="关闭"
            title="关闭"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </header>

      {sessions.sessions.length > 0 ? (
        <div className="assistant-sessions">
          {sessions.sessions.slice(0, 8).map((s) => (
            <div
              key={s.id}
              className={`assistant-session-row ${s.id === sessionId ? 'assistant-session-row--active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onSelectSession(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelectSession(s.id);
              }}
            >
              <span className="assistant-session-row__title">{s.title}</span>
              <button
                type="button"
                className="assistant-session-row__del"
                aria-label="删除会话"
                onClick={(e) => {
                  e.stopPropagation();
                  void sessions.deleteSession(s.id);
                  if (s.id === sessionId) setSessionId(null);
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <AssistantThread messages={chat.messages} sending={chat.sending} />

      <AssistantComposer
        onSend={onSend}
        sending={chat.sending}
        error={chat.error}
        disabled={!open}
      />
    </aside>
  );
}
