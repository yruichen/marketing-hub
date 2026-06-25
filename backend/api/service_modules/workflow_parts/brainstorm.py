from __future__ import annotations

from typing import Any

from django.contrib.auth.models import User
from django.utils import timezone

from ai_gateway.services import AIModelGateway
from api.audit import record_audit_log
from api.contracts import NODE_IO_SCHEMAS, validate_workflow_graph
from api.models import Campaign, Organization, Project, WorkspaceDraft
from api.service_modules.workspace import membership_role

def brainstorm_workflow(
    idea: str,
    *,
    organization: Organization,
    project: Project,
    campaign: Campaign | None = None,
    username: str | None = None,
) -> tuple[WorkspaceDraft, dict[str, Any]]:
    role = membership_role(
        User.objects.filter(username=username).first() if username else None,
        organization,
    )
    gateway = AIModelGateway.execute(
        organization=organization,
        role=role,
        task_type='brainstorm',
        payload={'idea': idea, 'brand_context_hint': project.brand_context or {}},
        prompt_key='marketing.brainstorm.system',
    )
    brainstorm_result = gateway.payload

    nodes = brainstorm_result.get('nodes', [])
    edges = brainstorm_result.get('edges', [])
    errors = validate_workflow_graph(nodes, edges)
    if errors:
        brainstorm_result = _fallback_brainstorm(idea)
        nodes = brainstorm_result['nodes']
        edges = brainstorm_result['edges']
        from ai_gateway.prompts import _layout_brainstorm_nodes
        _layout_brainstorm_nodes(nodes, edges)

    for node in nodes:
        node.setdefault('status', 'idle')
        node_type = node.get('type', 'context')
        io = NODE_IO_SCHEMAS.get(node_type, {'input': {}, 'output': {}})
        node.setdefault('input_schema', io.get('input', {}))
        node.setdefault('output_schema', io.get('output', {}))

    workflow_name = brainstorm_result.get('workflow_name', idea[:40])
    base_name = workflow_name[:120]
    existing = WorkspaceDraft.objects.filter(
        project=project, campaign=campaign, name=base_name,
    ).exists()
    if existing:
        workflow_name = f'{base_name} - {timezone.now().strftime("%H%M%S")}'

    draft = WorkspaceDraft.objects.create(
        organization=organization,
        project=project,
        campaign=campaign,
        name=workflow_name,
        brand_context=brainstorm_result.get('brand_context', {}),
        nodes=nodes,
        edges=edges,
        viewport={'x': 0, 'y': 0, 'zoom': 1},
        status='draft',
    )
    record_audit_log(
        action='brainstorm',
        actor=User.objects.filter(username=username).first() if username else None,
        organization=organization,
        target_type='workspace_draft',
        target_id=str(draft.id),
        metadata={'idea': idea[:200], 'node_count': len(nodes)},
    )
    return draft, brainstorm_result


def _fallback_brainstorm(idea: str) -> dict[str, Any]:
    return {
        'workflow_name': f'Campaign: {idea[:40]}',
        'brand_context': {
            'brand_name': idea.split()[0] if idea.split() else 'Brand',
            'audience': 'General audience',
            'tone': 'Professional',
            'selling_points': idea[:100],
            'visual_style': 'modern',
            'campaign_goal': idea[:80],
        },
        'nodes': [
            {
                'id': 'context-1', 'type': 'context', 'label': 'Brand Context',
                'x': 0, 'y': 0, 'width': 260, 'height': 166,
                'config': {'summary': idea[:200]},
            },
            {
                'id': 'copy-1', 'type': 'copy', 'label': 'Marketing Copy',
                'x': 0, 'y': 0, 'width': 260, 'height': 166,
                'config': {'tone': 'Professional', 'platform': 'Xiaohongshu'},
            },
        ],
        'edges': [{'id': 'edge-ctx-copy', 'source': 'context-1', 'target': 'copy-1'}],
        'summary': f'Fallback workflow for: {idea[:80]}',
    }
