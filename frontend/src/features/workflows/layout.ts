import type { WorkflowEdge, WorkflowNode } from '../../types/workspace';

const NODE_WIDTH = 320;
const NODE_HEIGHT = 360;
const X_GAP = 400;
const Y_GAP = 430;
const X_START = 72;
const Y_START = 96;
const MIN_GAP = 48;

const TYPE_PRIORITY: Record<string, number> = {
  context: 0,
  retrieval: 1,
  rag_search: 1,
  copy: 2,
  storyboard: 3,
  image_prompt: 4,
  image_generation: 5,
  image: 5,
  audio: 6,
  video_generation: 7,
  video: 7,
  review: 8,
  custom_agent: 9,
};

function nodeWidth(node: WorkflowNode) {
  return node.width || NODE_WIDTH;
}

function nodeHeight(node: WorkflowNode) {
  return node.height || NODE_HEIGHT;
}

function intersects(a: WorkflowNode, b: WorkflowNode, gap = MIN_GAP) {
  return !(
    a.x + nodeWidth(a) + gap <= b.x ||
    b.x + nodeWidth(b) + gap <= a.x ||
    a.y + nodeHeight(a) + gap <= b.y ||
    b.y + nodeHeight(b) + gap <= a.y
  );
}

function hasInvalidPosition(node: WorkflowNode) {
  return !Number.isFinite(node.x) || !Number.isFinite(node.y);
}

export function getWorkflowBounds(nodes: WorkflowNode[]) {
  if (nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + nodeWidth(node)));
  const maxY = Math.max(...nodes.map((node) => node.y + nodeHeight(node)));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function hasLayoutProblems(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  if (nodes.length <= 1) return nodes.some(hasInvalidPosition);

  if (nodes.some(hasInvalidPosition)) return true;

  const nearOriginCount = nodes.filter((node) => Math.abs(node.x) < 24 && Math.abs(node.y) < 24).length;
  if (nearOriginCount >= Math.max(2, Math.ceil(nodes.length * 0.6))) return true;

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (intersects(nodes[i], nodes[j], 8)) return true;
    }
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let reverseEdgeCount = 0;
  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (source && target && target.x + 32 < source.x) reverseEdgeCount += 1;
  }
  return reverseEdgeCount >= Math.max(1, Math.ceil(edges.length * 0.35));
}

export function autoLayoutWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  if (nodes.length <= 1) {
    return nodes.map((node) => ({ ...node, x: X_START, y: Y_START, width: nodeWidth(node), height: nodeHeight(node) }));
  }

  const order = nodes.map((node) => node.id);
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const parents = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target) || edge.source === edge.target) continue;
    children.get(edge.source)?.push(edge.target);
    parents.get(edge.target)?.push(edge.source);
  }

  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const resolveColumn = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parentIds = parents.get(id) || [];
    const column = parentIds.length === 0 ? 0 : Math.max(...parentIds.map(resolveColumn)) + 1;
    visiting.delete(id);
    memo.set(id, column);
    return column;
  };

  for (const node of nodes) resolveColumn(node.id);

  const columns = new Map<number, WorkflowNode[]>();
  for (const node of nodes) {
    const column = memo.get(node.id) || 0;
    columns.set(column, [...(columns.get(column) || []), node]);
  }

  const laidOut: WorkflowNode[] = [];
  const placedById = new Map<string, WorkflowNode>();
  const sortedColumns = [...columns.keys()].sort((a, b) => a - b);

  for (const column of sortedColumns) {
    const columnNodes = [...(columns.get(column) || [])].sort((a, b) => {
      const aParents = parents.get(a.id) || [];
      const bParents = parents.get(b.id) || [];
      const aParentY = aParents.length
        ? aParents.reduce((sum, id) => sum + (placedById.get(id)?.y ?? 0), 0) / aParents.length
        : 0;
      const bParentY = bParents.length
        ? bParents.reduce((sum, id) => sum + (placedById.get(id)?.y ?? 0), 0) / bParents.length
        : 0;
      if (aParentY !== bParentY) return aParentY - bParentY;
      const priorityDelta = (TYPE_PRIORITY[a.type] ?? 20) - (TYPE_PRIORITY[b.type] ?? 20);
      if (priorityDelta !== 0) return priorityDelta;
      return (orderIndex.get(a.id) || 0) - (orderIndex.get(b.id) || 0);
    });

    const totalHeight = (columnNodes.length - 1) * Y_GAP + NODE_HEIGHT;
    const yBase = Math.max(Y_START, Y_START + Math.round((Math.max(0, 3 - columnNodes.length) * Y_GAP) / 2));
    const centeredYBase = columnNodes.length > 1 ? Math.max(Y_START, Y_START + Math.round((NODE_HEIGHT * 3 - totalHeight) / 2)) : yBase;

    columnNodes.forEach((node, index) => {
      let y = centeredYBase + index * Y_GAP;
      const parentIds = parents.get(node.id) || [];
      if (parentIds.length > 0) {
        const parentY =
          parentIds.reduce((sum, id) => sum + (placedById.get(id)?.y ?? centeredYBase), 0) / parentIds.length;
        y = Math.max(Y_START, Math.round(parentY + (index - (columnNodes.length - 1) / 2) * Y_GAP));
      }

      const nextNode: WorkflowNode = {
        ...node,
        width: nodeWidth(node),
        height: nodeHeight(node),
        x: X_START + column * X_GAP,
        y,
      };

      while (laidOut.some((placed) => intersects(nextNode, placed))) {
        nextNode.y += Y_GAP;
      }

      laidOut.push(nextNode);
      placedById.set(nextNode.id, nextNode);
    });
  }

  const minY = Math.min(...laidOut.map((node) => node.y));
  return laidOut.map((node) => ({ ...node, y: node.y - minY + Y_START }));
}
