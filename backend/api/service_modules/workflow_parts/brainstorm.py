from __future__ import annotations

from typing import Any

from django.contrib.auth.models import User
from django.utils import timezone

from harness.facade import HarnessFacade
from harness.contracts import NonRetryableHarnessError
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
    gateway = HarnessFacade.execute(
        organization=organization,
        role=role,
        task_type='brainstorm',
        payload={
            'idea': idea,
            'brand_context_hint': project.brand_context or {},
            'node_io_schemas': NODE_IO_SCHEMAS,
        },
        prompt_key='marketing.brainstorm.system',
    )
    brainstorm_result = gateway.payload

    nodes = brainstorm_result.get('nodes', [])
    edges = brainstorm_result.get('edges', [])
    errors = validate_workflow_graph(nodes, edges)
    if errors:
        raise NonRetryableHarnessError(
            'Brainstorm output failed workflow validation: ' + '; '.join(errors[:8])
        )

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
