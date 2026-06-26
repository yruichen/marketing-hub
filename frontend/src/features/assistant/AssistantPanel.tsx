import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, MessageSquarePlus, RefreshCcw, Search, X } from 'lucide-react';
import { useAssistant } from './useAssistant';
import { useAssistantSessions } from './useAssistantSessions';
import { useAssistantChat } from './useAssistantChat';
import { AssistantThread } from './AssistantThread';
import { AssistantComposer } from './AssistantComposer';
import { NAV_TAB_LABELS } from './navTargets';
import type { AssistantSession } from './types';
import './assistant.css';

const QUICK_TIPS = ['总结当前页面', '列出最近项目', '帮我写一段小红书文案', '跳到资产库'];

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
    loading: sessionsLoading,
    error: sessionsError,
    refresh: refreshSessions,
  } = useAssistantSessions();
  const {
    messages,
    sending,
    error,
    send,
    loadHistory,
    reset,
  } = useAssistantChat();
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  const [sessionQuery, setSessionQuery] = useState('');

  const contextLabel = pageContext.tab ? `当前页面：${NAV_TAB_LABELS[pageContext.tab] ?? pageContext.tab}` : '当前上下文：全局';
  const normalizedSessionQuery = sessionQuery.trim().toLowerCase();
  const visibleSessions = useMemo(() => {
    if (!normalizedSessionQuery) return sessionsList;
    return sessionsList.filter((session) => {
      const title = session.title.toLowerCase();
      const updatedAt = session.updated_at?.toLowerCase?.() ?? '';
      return title.includes(normalizedSessionQuery) || updatedAt.includes(normalizedSessionQuery);
    });
  }, [normalizedSessionQuery, sessionsList]);

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

  useEffect(() => {
    const onGlobalShortcut = (event: KeyboardEvent) => {
      const isModifier = event.metaKey || event.ctrlKey;
      if (isModifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(!open);
        return;
      }

      if (event.key === 'Escape' && open) {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', onGlobalShortcut);
    return () => window.removeEventListener('keydown', onGlobalShortcut);
  }, [open, setOpen]);

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

  const onQuickPrompt = useCallback(
    async (text: string) => {
      if (sending) return;
      await onSend(text);
    },
    [onSend, sending],
  );

  return (
    <>
      <button
        type="button"
        className={`assistant-drawer__scrim ${open ? 'assistant-drawer__scrim--active' : ''}`}
        aria-label="关闭 AI 助手"
        aria-hidden={!open}
        tabIndex={-1}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`assistant-drawer ${open ? 'assistant-drawer--open' : ''}`}
        aria-hidden={!open}
      >
        <header className="assistant-drawer__header">
          <div className="assistant-drawer__header-copy">
            <span className="assistant-drawer__title">Marketing-Hub 助手</span>
            <span className="assistant-drawer__subtitle">{contextLabel}</span>
          </div>
          <div className="assistant-drawer__actions">
            <button
              type="button"
              onClick={onNewSession}
              className="assistant-drawer__btn"
              title="新建会话"
            >
              <MessageSquarePlus className="h-3 w-3" />
              新建
            </button>
            <button
              type="button"
              onClick={() => {
                void refreshSessions();
              }}
              className="assistant-drawer__btn"
              title="刷新会话"
            >
              <RefreshCcw className="h-3 w-3" />
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

        <div className="assistant-sessions-panel">
          <div className="assistant-sessions-panel__head">
            <span>历史会话 {visibleSessions.length}/{sessionsList.length}</span>
            <button
              type="button"
              className="assistant-sessions-panel__toggle"
              onClick={() => setSessionsExpanded((prev) => !prev)}
              aria-label={sessionsExpanded ? '收起会话列表' : '展开会话列表'}
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${sessionsExpanded ? 'rotate-180' : ''}`}
              />
            </button>
          </div>
          <label className={`assistant-sessions-search ${sessionsExpanded ? '' : 'assistant-sessions-search--collapsed'}`}>
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <input
              value={sessionQuery}
              onChange={(event) => setSessionQuery(event.target.value)}
              placeholder="搜索历史会话"
              aria-label="搜索历史会话"
            />
            {sessionQuery ? (
              <button type="button" onClick={() => setSessionQuery('')} aria-label="清空会话搜索">
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </label>
          {sessionsLoading ? (
            <div className={`assistant-sessions__loading ${sessionsExpanded ? '' : 'assistant-sessions__state--collapsed'}`}>加载会话中...</div>
          ) : sessionsError ? (
            <div className={`assistant-sessions__error ${sessionsExpanded ? '' : 'assistant-sessions__state--collapsed'}`}>{sessionsError}</div>
          ) : visibleSessions.length > 0 ? (
            <div className={`assistant-sessions ${sessionsExpanded ? '' : 'assistant-sessions--collapsed'}`}>
              {visibleSessions.map((s) => (
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
          ) : sessionsList.length > 0 ? (
            <div className={`assistant-sessions__empty ${sessionsExpanded ? '' : 'assistant-sessions__state--collapsed'}`}>没有匹配的历史会话。</div>
          ) : (
            <div className={`assistant-sessions__empty ${sessionsExpanded ? '' : 'assistant-sessions__state--collapsed'}`}>未找到会话，点击右上角“新建”开始新会话。</div>
          )}
        </div>

        <AssistantThread
          messages={messages}
          sending={sending}
          onNavigate={onNavigate}
          onQuickPrompt={onQuickPrompt}
          quickPrompts={QUICK_TIPS}
        />

        <AssistantComposer
          onSend={onSend}
          sending={sending}
          error={error}
          disabled={!open}
        />
      </aside>
    </>
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
