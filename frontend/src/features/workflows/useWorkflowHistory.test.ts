import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowSnapshot } from './types';
import { useWorkflowHistory } from './useWorkflowHistory';

function snapshot(id: string): WorkflowSnapshot {
  return {
    id,
    label: id,
    createdAt: '2026-08-10T00:00:00Z',
    nodes: [],
    edges: [],
    brandContext: {},
    selectedNodeId: '',
  };
}

describe('useWorkflowHistory', () => {
  it('owns undo and redo transitions outside the workflow component', () => {
    const restoreSnapshot = vi.fn();
    const onRestore = vi.fn();
    const makeSnapshot = vi.fn((label: string) => snapshot(`current-${label}`));
    const { result } = renderHook(() => useWorkflowHistory({
      makeSnapshot,
      restoreSnapshot,
      onRestore,
    }));

    act(() => {
      result.current.pushSnapshot(snapshot('before-edit'));
      result.current.pushSnapshot(snapshot('before-delete'));
    });
    expect(result.current.history.map((item) => item.id)).toEqual(['before-edit', 'before-delete']);

    act(() => result.current.undo());
    expect(restoreSnapshot).toHaveBeenLastCalledWith(snapshot('before-delete'));
    expect(result.current.history.map((item) => item.id)).toEqual(['before-edit']);
    expect(result.current.future).toHaveLength(1);

    act(() => result.current.redo());
    expect(restoreSnapshot).toHaveBeenLastCalledWith(snapshot('current-重做点'));
    expect(result.current.history).toHaveLength(2);
    expect(result.current.future).toHaveLength(0);
    expect(onRestore).toHaveBeenCalledTimes(2);
  });

  it('resets both stacks when loading a different draft', () => {
    const { result } = renderHook(() => useWorkflowHistory({
      makeSnapshot: snapshot,
      restoreSnapshot: vi.fn(),
    }));

    act(() => result.current.pushSnapshot(snapshot('old')));
    act(() => result.current.resetHistory(snapshot('loaded')));

    expect(result.current.history.map((item) => item.id)).toEqual(['loaded']);
    expect(result.current.future).toEqual([]);
  });
});
