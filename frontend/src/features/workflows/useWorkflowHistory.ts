import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkflowSnapshot } from './types';

type WorkflowHistoryOptions = {
  makeSnapshot: (label: string) => WorkflowSnapshot;
  restoreSnapshot: (snapshot: WorkflowSnapshot) => void;
  onRestore?: () => void;
  debounceMs?: number;
  limit?: number;
};

export function useWorkflowHistory({
  makeSnapshot,
  restoreSnapshot,
  onRestore,
  debounceMs = 800,
  limit = 25,
}: WorkflowHistoryOptions) {
  const [history, setHistory] = useState<WorkflowSnapshot[]>([]);
  const [future, setFuture] = useState<WorkflowSnapshot[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushSnapshot = useCallback((snapshot: WorkflowSnapshot) => {
    setHistory((previous) => [...previous.slice(-(limit - 1)), snapshot]);
    setFuture([]);
  }, [limit]);

  const resetHistory = useCallback((snapshot?: WorkflowSnapshot) => {
    setHistory(snapshot ? [snapshot] : []);
    setFuture([]);
  }, []);

  const markHistory = useCallback((label: string) => {
    pushSnapshot(makeSnapshot(label));
  }, [makeSnapshot, pushSnapshot]);

  const debouncedMarkHistory = useCallback((label: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => pushSnapshot(makeSnapshot(label)), debounceMs);
  }, [debounceMs, makeSnapshot, pushSnapshot]);

  const undo = useCallback(() => {
    const current = makeSnapshot('重做点');
    setHistory((previous) => {
      const snapshot = previous.at(-1);
      if (!snapshot) return previous;
      setFuture((items) => [current, ...items].slice(0, limit));
      restoreSnapshot(snapshot);
      onRestore?.();
      return previous.slice(0, -1);
    });
  }, [limit, makeSnapshot, onRestore, restoreSnapshot]);

  const redo = useCallback(() => {
    const current = makeSnapshot('撤销点');
    setFuture((previous) => {
      const snapshot = previous[0];
      if (!snapshot) return previous;
      setHistory((items) => [...items.slice(-(limit - 1)), current]);
      restoreSnapshot(snapshot);
      onRestore?.();
      return previous.slice(1);
    });
  }, [limit, makeSnapshot, onRestore, restoreSnapshot]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return {
    history,
    future,
    pushSnapshot,
    resetHistory,
    markHistory,
    debouncedMarkHistory,
    undo,
    redo,
  };
}
