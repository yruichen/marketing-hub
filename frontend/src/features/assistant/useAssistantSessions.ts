import { useCallback, useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../hooks/useApi';
import type { AssistantMessage, AssistantSession } from './types';

interface UseAssistantSessionsResult {
  sessions: AssistantSession[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  createSession: (title?: string) => Promise<AssistantSession | null>;
  renameSession: (id: number, title: string) => Promise<boolean>;
  archiveSession: (id: number) => Promise<boolean>;
  deleteSession: (id: number) => Promise<boolean>;
  fetchMessages: (sessionId: number) => Promise<AssistantMessage[]>;
}

/**
 * CRUD over the /assistant/sessions endpoints. The active session id
 * itself lives in AssistantContext; this hook is just the data source.
 */
export function useAssistantSessions(): UseAssistantSessionsResult {
  const [sessions, setSessions] = useState<AssistantSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ sessions: AssistantSession[] }>(
        '/assistant/sessions',
      );
      setSessions(data.sessions);
    } catch {
      setError('加载会话失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    void refresh();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refresh]);

  const createSession = useCallback(
    async (title?: string): Promise<AssistantSession | null> => {
      try {
        const session = await apiPost<AssistantSession>(
          '/assistant/sessions',
          title ? { title } : {},
        );
        setSessions((prev) => [session, ...prev]);
        return session;
      } catch {
        setError('创建会话失败');
        return null;
      }
    },
    [],
  );

  const renameSession = useCallback(async (id: number, title: string) => {
    try {
      await apiPatch(`/assistant/sessions/${id}`, { title });
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, title } : s)),
      );
      return true;
    } catch {
      return false;
    }
  }, []);

  const archiveSession = useCallback(async (id: number) => {
    try {
      await apiPatch(`/assistant/sessions/${id}`, { is_archived: true });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      return true;
    } catch {
      return false;
    }
  }, []);

  const deleteSession = useCallback(async (id: number) => {
    try {
      await apiDelete(`/assistant/sessions/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      return true;
    } catch {
      return false;
    }
  }, []);

  const fetchMessages = useCallback(async (sessionId: number) => {
    try {
      const data = await apiGet<{ messages: AssistantMessage[] }>(
        `/assistant/sessions/${sessionId}/messages`,
      );
      return data.messages;
    } catch {
      return [];
    }
  }, []);

  return {
    sessions,
    loading,
    error,
    refresh,
    createSession,
    renameSession,
    archiveSession,
    deleteSession,
    fetchMessages,
  };
}
