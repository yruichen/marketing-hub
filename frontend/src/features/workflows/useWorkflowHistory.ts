import { useCallback, useRef, useState } from 'react';
import type { WorkflowEdge, WorkflowNode } from '../../types/workspace';
import type { BrandContext } from '../../types/workspace';
import type { WorkflowSnapshot } from './types';

export function useWorkflowHistory() {
  const [history, setHistory] = useState<WorkflowSnapshot[]>([]);
  const [future, setFuture] = useState<WorkflowSnapshot[]>([]);
  const [versions, setVersions] = useState<WorkflowSnapshot[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushSnapshot = useCallback((snapshot: WorkflowSnapshot) => {
    setHistory((prev) => [...prev.slice(-24), snapshot]);
    setFuture([]);
  }, []);

  const makeAndPush = useCallback((
    label: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    brandContext: BrandContext,
    selectedNodeId: string,
  ) => {
    const snapshot: WorkflowSnapshot = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label,
      createdAt: new Date().toISOString(),
      nodes: nodes.map((n) => ({ ...n, config: { ...n.config }, output: { ...(n.output || {}) } })),
      edges: edges.map((e) => ({ ...e })),
      brandContext: { ...brandContext },
      selectedNodeId,
    };
    pushSnapshot(snapshot);
  }, [pushSnapshot]);

  const debouncedPush = useCallback((
    label: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    brandContext: BrandContext,
    selectedNodeId: string,
  ) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      makeAndPush(label, nodes, edges, brandContext, selectedNodeId);
    }, 800);
  }, [makeAndPush]);

  const addVersion = useCallback((snapshot: WorkflowSnapshot) => {
    setVersions((prev) => [snapshot, ...prev].slice(0, 12));
  }, []);

  const undo = useCallback((
    currentNodes: WorkflowNode[],
    currentEdges: WorkflowEdge[],
    currentBrandContext: BrandContext,
    currentSelectedNodeId: string,
    restore: (snap: WorkflowSnapshot) => void,
  ) => {
    setHistory((prev) => {
      const snapshot = prev[prev.length - 1];
      if (!snapshot) return prev;
      const currentSnapshot: WorkflowSnapshot = {
        id: `${Date.now()}-redo`,
        label: '重做点',
        createdAt: new Date().toISOString(),
        nodes: currentNodes.map((n) => ({ ...n, config: { ...n.config }, output: { ...(n.output || {}) } })),
        edges: currentEdges.map((e) => ({ ...e })),
        brandContext: { ...currentBrandContext },
        selectedNodeId: currentSelectedNodeId,
      };
      setFuture((items) => [currentSnapshot, ...items].slice(0, 25));
      restore(snapshot);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback((
    currentNodes: WorkflowNode[],
    currentEdges: WorkflowEdge[],
    currentBrandContext: BrandContext,
    currentSelectedNodeId: string,
    restore: (snap: WorkflowSnapshot) => void,
  ) => {
    setFuture((prev) => {
      const snapshot = prev[0];
      if (!snapshot) return prev;
      const currentSnapshot: WorkflowSnapshot = {
        id: `${Date.now()}-undo`,
        label: '撤销点',
        createdAt: new Date().toISOString(),
        nodes: currentNodes.map((n) => ({ ...n, config: { ...n.config }, output: { ...(n.output || {}) } })),
        edges: currentEdges.map((e) => ({ ...e })),
        brandContext: { ...currentBrandContext },
        selectedNodeId: currentSelectedNodeId,
      };
      setHistory((items) => [...items.slice(-24), currentSnapshot]);
      restore(snapshot);
      return prev.slice(1);
    });
  }, []);

  return {
    history,
    future,
    versions,
    pushSnapshot,
    makeAndPush,
    debouncedPush,
    addVersion,
    undo,
    redo,
  };
}
