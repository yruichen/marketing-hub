from __future__ import annotations

import copy
from typing import Any

from django.contrib.auth.models import User

from harness.facade import HarnessFacade
from harness.contracts import NonRetryableHarnessError
from api.audit import record_audit_log
from api.contracts import NODE_IO_SCHEMAS, validate_workflow_graph
from api.models import Organization, WorkspaceDraft
from api.service_modules.workspace import membership_role

def _normalize_node(node: dict[str, Any]) -> dict[str, Any]:
    node_type = str(node.get('type') or 'custom_agent')
    schema = NODE_IO_SCHEMAS.get(node_type, NODE_IO_SCHEMAS['custom_agent'])
    next_node = copy.deepcopy(node)
    next_node.setdefault('config', {})
    if not isinstance(next_node['config'], dict):
        next_node['config'] = {}
    next_node.setdefault('input_schema', schema['input'])
    next_node.setdefault('output_schema', schema['output'])
    next_node.setdefault('status', 'idle')
    next_node.setdefault('output', {})
    next_node.setdefault('width', 320)
    next_node.setdefault('height', 360)
    return next_node


def _constrain_result(
    *,
    mode: str,
    node_id: str,
    original_nodes: list[dict[str, Any]],
    original_edges: list[dict[str, Any]],
    candidate: dict[str, Any],
) -> dict[str, Any]:
    original_by_id = {str(node.get('id')): _normalize_node(node) for node in original_nodes if node.get('id')}
    candidate_nodes = candidate.get('nodes')
    if not isinstance(candidate_nodes, list):
        raise NonRetryableHarnessError('Workflow edit output is missing nodes.')

    next_nodes: list[dict[str, Any]] = []
    changed_node_ids: list[str] = []
    candidate_by_id = {str(node.get('id')): node for node in candidate_nodes if isinstance(node, dict) and node.get('id')}

    for original_id, original in original_by_id.items():
        proposed = candidate_by_id.get(original_id)
        if mode == 'node' and original_id != node_id:
            next_nodes.append(copy.deepcopy(original))
            continue
        if not isinstance(proposed, dict):
            next_nodes.append(copy.deepcopy(original))
            continue
        next_node = copy.deepcopy(original)
        label = proposed.get('label')
        if isinstance(label, str) and label.strip():
            next_node['label'] = label.strip()[:180]
        if isinstance(proposed.get('x'), (int, float)):
            next_node['x'] = proposed['x']
        if isinstance(proposed.get('y'), (int, float)):
            next_node['y'] = proposed['y']
        proposed_config = proposed.get('config')
        if isinstance(proposed_config, dict):
            next_node['config'] = {**(next_node.get('config') or {}), **proposed_config}
        if next_node != original:
            changed_node_ids.append(original_id)
        next_nodes.append(_normalize_node(next_node))

    if mode == 'node':
        next_edges = [copy.deepcopy(edge) for edge in original_edges]
    else:
        proposed_edges = candidate.get('edges')
        next_edges = [copy.deepcopy(edge) for edge in proposed_edges] if isinstance(proposed_edges, list) else [copy.deepcopy(edge) for edge in original_edges]

    errors = validate_workflow_graph(next_nodes, next_edges)
    if errors:
        raise NonRetryableHarnessError(
            'Workflow edit output failed graph validation: ' + '; '.join(errors[:8])
        )

    if mode == 'node' and node_id not in changed_node_ids:
        raise NonRetryableHarnessError('Workflow edit did not modify the selected node.')

    return {
        'nodes': next_nodes,
        'edges': next_edges,
        'summary': str(candidate.get('summary') or '').strip()[:400],
        'changed_node_ids': changed_node_ids,
    }


def ai_edit_workflow(
    draft: WorkspaceDraft,
    *,
    mode: str,
    instruction: str,
    node_id: str = '',
    nodes: list[dict[str, Any]] | None = None,
    edges: list[dict[str, Any]] | None = None,
    brand_context: dict[str, Any] | None = None,
    username: str | None = None,
) -> dict[str, Any]:
    mode = mode if mode in {'node', 'workflow'} else 'node'
    instruction = instruction.strip()
    source_nodes = [_normalize_node(node) for node in (nodes if isinstance(nodes, list) else draft.nodes or []) if isinstance(node, dict)]
    source_edges = [edge for edge in (edges if isinstance(edges, list) else draft.edges or []) if isinstance(edge, dict)]
    if not instruction:
        raise ValueError('Workflow edit instruction is required.')
    if mode == 'node' and not any(str(node.get('id')) == node_id for node in source_nodes):
        raise ValueError('The selected workflow node does not exist.')

    user = User.objects.filter(username=username).first() if username else None
    role = membership_role(user, draft.organization)
    gateway = HarnessFacade.execute(
        organization=draft.organization if isinstance(draft.organization, Organization) else None,
        role=role,
        task_type='workflow_edit',
        prompt_key='marketing.workflow_edit.system',
        payload={
            'mode': mode,
            'node_id': node_id,
            'instruction': instruction,
            'brand_context': brand_context or draft.brand_context or {},
            'workflow': {
                'nodes': source_nodes,
                'edges': source_edges,
            },
        },
    )
    candidate = gateway.payload if isinstance(gateway.payload, dict) else {}

    result = _constrain_result(
        mode=mode,
        node_id=node_id,
        original_nodes=source_nodes,
        original_edges=source_edges,
        candidate=candidate,
    )
    record_audit_log(
        action='assistant_step',
        actor=user,
        organization=draft.organization,
        target_type='workspace_draft',
        target_id=str(draft.id),
        metadata={'mode': mode, 'node_id': node_id, 'changed_node_ids': result.get('changed_node_ids', [])},
    )
    return result
