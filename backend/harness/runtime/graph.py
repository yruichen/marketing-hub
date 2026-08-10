from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Any, Iterable

from harness.contracts import NonRetryableHarnessError


class GraphValidationError(NonRetryableHarnessError):
    """Raised before execution when a workflow graph is not a valid DAG."""


@dataclass(frozen=True, slots=True)
class GraphPlan:
    ordered_ids: tuple[str, ...]
    parents: dict[str, tuple[str, ...]]
    children: dict[str, tuple[str, ...]]

    def descendants(self, node_id: str) -> tuple[str, ...]:
        if node_id not in self.children:
            raise GraphValidationError(f'Unknown workflow node: {node_id}')
        found: set[str] = set()
        pending = deque(self.children[node_id])
        while pending:
            current = pending.popleft()
            if current in found:
                continue
            found.add(current)
            pending.extend(self.children[current])
        return tuple(node_id for node_id in self.ordered_ids if node_id in found)


def build_graph_plan(nodes: Iterable[dict[str, Any]], edges: Iterable[dict[str, Any]]) -> GraphPlan:
    node_list = list(nodes)
    node_ids = [str(node.get('id') or '').strip() for node in node_list]
    if any(not node_id for node_id in node_ids):
        raise GraphValidationError('Every workflow node requires a non-empty ID.')
    if len(node_ids) != len(set(node_ids)):
        raise GraphValidationError('Workflow node IDs must be unique.')

    known = set(node_ids)
    parents: dict[str, list[str]] = {node_id: [] for node_id in node_ids}
    children: dict[str, list[str]] = {node_id: [] for node_id in node_ids}
    seen_edges: set[tuple[str, str]] = set()
    for edge in edges:
        source = str(edge.get('source') or '').strip()
        target = str(edge.get('target') or '').strip()
        if source not in known or target not in known:
            raise GraphValidationError(f'Workflow edge {source}->{target} references an unknown node.')
        if source == target:
            raise GraphValidationError(f'Workflow node {source} cannot depend on itself.')
        pair = (source, target)
        if pair in seen_edges:
            raise GraphValidationError(f'Duplicate workflow edge: {source}->{target}.')
        seen_edges.add(pair)
        parents[target].append(source)
        children[source].append(target)

    indegree = {node_id: len(parents[node_id]) for node_id in node_ids}
    ready = deque(node_id for node_id in node_ids if indegree[node_id] == 0)
    ordered: list[str] = []
    while ready:
        current = ready.popleft()
        ordered.append(current)
        for target in children[current]:
            indegree[target] -= 1
            if indegree[target] == 0:
                ready.append(target)
    if len(ordered) != len(node_ids):
        raise GraphValidationError('Workflow graph contains a cycle.')

    return GraphPlan(
        ordered_ids=tuple(ordered),
        parents={key: tuple(value) for key, value in parents.items()},
        children={key: tuple(value) for key, value in children.items()},
    )


def ordered_nodes(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    plan = build_graph_plan(nodes, edges)
    by_id = {str(node['id']): node for node in nodes}
    return [by_id[node_id] for node_id in plan.ordered_ids]


def direct_upstream_outputs(
    node_id: str,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    plan = build_graph_plan(nodes, edges)
    if node_id not in plan.parents:
        raise GraphValidationError(f'Unknown workflow node: {node_id}')
    by_id = {str(node['id']): node for node in nodes}
    return [
        by_id[parent_id].get('output', {})
        for parent_id in plan.parents[node_id]
    ]
