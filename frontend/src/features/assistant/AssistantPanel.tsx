import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useAssistant } from './useAssistant';
import { useAssistantSessions } from './useAssistantSessions';
import { useAssistantChat } from './useAssistantChat';
import { AssistantThread } from './AssistantThread';
import { AssistantComposer } from './AssistantComposer';
import type { AssistantSession } from './types';
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
  const { open, setOpen, sessionId, setSessionId, pageContext } = useAssistant();
  const {
    sessions: sessionsList,
    createSession,
    deleteSession,
    renameSession,
    fetchMessages,
  } = useAssistantSessions();
  const {
    messages,
    sending,
    error,
    send,
    loadHistory,
    reset,
  } = useAssistantChat();

  // Load history when the active session changes.
  useEffect(() => {
    let cancelled = false;
    if (sessionId !== null) {
      void (async () => {
        const history = await fetchMessages(sessionId);
        if (cancelled) return;
        loadHistory(
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
      reset();
    }
    return () => {
      cancelled = true;
    };
    // chat / sessions are returned as object literals by their hooks
    // and get a new identity on every render, so depending on them
    // would re-fire this effect (and any setState inside — loadHistory,
    // reset — would just re-trigger it). Depend on the stable
    // sub-callbacks and the actual session id instead.
  }, [sessionId, fetchMessages, loadHistory, reset]);

  const onNewSession = useCallback(async () => {
    const created = await createSession('新对话');
    if (created) setSessionId(created.id);
  }, [createSession, setSessionId]);

  const onSelectSession = useCallback(
    (id: number) => setSessionId(id),
    [setSessionId],
  );

  const onSend = useCallback(
    async (text: string) => {
      await send({
        text,
        sessionId,
        pageContext,
        onSessionId: (id) => setSessionId(id),
      });
    },
    [send, sessionId, pageContext, setSessionId],
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

      {sessionsList.length > 0 ? (
        <div className="assistant-sessions">
          {sessionsList.slice(0, 8).map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              active={s.id === sessionId}
              onSelect={() => onSelectSession(s.id)}
              onDelete={() => {
                void deleteSession(s.id);
                if (s.id === sessionId) setSessionId(null);
              }}
              onRename={(title) => {
                void renameSession(s.id, title);
              }}
            />
          ))}
        </div>
      ) : null}

      <AssistantThread
        messages={messages}
        sending={sending}
        onNavigate={onNavigate}
      />

      <AssistantComposer
        onSend={onSend}
        sending={sending}
        error={error}
        disabled={!open}
      />
    </aside>
  );
}

interface SessionRowProps {
  session: AssistantSession;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

function SessionRow({ session, active, onSelect, onDelete, onRename }: SessionRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== session.title) onRename(next);
    else setDraft(session.title);
    setEditing(false);
  };

  return (
    <div
      className={`assistant-session-row ${active ? 'assistant-session-row--active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (!editing) onSelect();
      }}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === 'Enter' || e.key === ' ') onSelect();
      }}
    >
      {editing ? (
        <input
          autoFocus
          className="assistant-session-row__edit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') {
              setDraft(session.title);
              setEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="assistant-session-row__title"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setDraft(session.title);
            setEditing(true);
          }}
          title="双击重命名"
        >
          {session.title}
        </span>
      )}
      <button
        type="button"
        className="assistant-session-row__del"
        aria-label="删除会话"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
