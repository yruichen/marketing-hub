from __future__ import annotations

from typing import Any

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from api.audit import record_audit_log
from api.contracts import NODE_TYPE_ALIASES
from api.models import Campaign, GenerationTask, Organization, Project, WorkspaceDraft
from api.service_modules.generation import create_generation_task
from api.service_modules.workflow_parts.contracts import node_io_schema, validate_workflow_contract
from api.service_modules.workflow_parts.payloads import (
    _reshape_image_prompt_output,
    build_payload_for_node,
    extract_upstream_text,
    upstream_outputs,
    workflow_execution_order,
)

def run_workflow_node(
    *,
    node: dict[str, Any],
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    brand_context: dict[str, Any],
    organization: Organization,
    project: Project,
    campaign: Campaign | None,
    username: str | None = None,
    feedback: str = '',
) -> tuple[dict[str, Any], GenerationTask | None]:
    node_type = node.get('type')
    task_type = NODE_TYPE_ALIASES.get(node_type, node_type)
    node_id = str(node.get('id'))
    if node_type == 'context':
        output = {
            'summary': node.get('config', {}).get('summary') or project.brief,
            'brand_context': brand_context,
        }
        node['output'] = output
        node['status'] = 'succeeded'
        node['input_schema'] = node_io_schema(node)['input']
        node['output_schema'] = node_io_schema(node)['output']
        return node, None

    if task_type not in dict(GenerationTask.TASK_TYPES):
        output = {
            'message': f'Node type {node_type} is a configuration/pass-through node.',
            'upstream': upstream_outputs(node_id, nodes, edges),
        }
        node['output'] = output
        node['status'] = 'succeeded'
        node['input_schema'] = node_io_schema(node)['input']
        node['output_schema'] = node_io_schema(node)['output']
        return node, None

    payload = build_payload_for_node(
        node,
        brand_context=brand_context,
        upstream=upstream_outputs(node_id, nodes, edges),
        feedback=feedback,
    )
    upstream = upstream_outputs(node_id, nodes, edges)
    upstream_text = extract_upstream_text(upstream)
    task = create_generation_task(
        task_type=task_type,
        payload=payload,
        username=username,
        organization=organization,
        project=project,
        campaign=campaign,
        run_now=True,
    )
    if node_type == 'image_prompt':
        task_data = task.result.get('data', {}) if isinstance(task.result.get('data'), dict) else {}
        node_config = node.get('config') if isinstance(node.get('config'), dict) else {}
        node['output'] = _reshape_image_prompt_output(
            node_config,
            task_data,
            upstream_text=upstream_text,
            brand_context=brand_context,
        )
    else:
        node['output'] = task.result.get('data', {})
    node['task_id'] = task.id
    node['status'] = task.status
    node['error_message'] = task.error_message
    node['input_schema'] = node_io_schema(node)['input']
    node['output_schema'] = node_io_schema(node)['output']
    return node, task


def run_workspace_workflow(draft: WorkspaceDraft, username: str | None = None) -> tuple[WorkspaceDraft, list[GenerationTask]]:
    nodes = [dict(node, status='queued') for node in draft.nodes]
    edges = draft.edges
    brand_context = draft.brand_context or draft.project.brand_context or {}
    tasks: list[GenerationTask] = []

    draft.status = 'running'
    draft.nodes = nodes
    draft.save(update_fields=['status', 'nodes', 'updated_at'])

    try:
        order = workflow_execution_order(nodes, edges)
        schema_warnings = validate_workflow_contract(nodes, edges)
        by_id = {str(node.get('id')): node for node in nodes}
        failed_node_ids: list[str] = []

        for ordered_node in order:
            node = by_id[str(ordered_node.get('id'))]
            node['status'] = 'running'
            draft.nodes = nodes
            draft.save(update_fields=['nodes', 'updated_at'])
            try:
                with transaction.atomic():
                    updated_node, task = run_workflow_node(
                        node=node,
                        nodes=nodes,
                        edges=edges,
                        brand_context=brand_context,
                        organization=draft.organization,
                        project=draft.project,
                        campaign=draft.campaign,
                        username=username,
                    )
                    by_id[str(updated_node.get('id'))] = updated_node
                    if task:
                        tasks.append(task)
            except Exception as node_exc:
                node['status'] = 'failed'
                node['error_message'] = str(node_exc)
                failed_node_ids.append(str(node.get('id')))
            draft.nodes = nodes
            draft.save(update_fields=['nodes', 'updated_at'])

        draft.nodes = nodes
        all_failed = len(failed_node_ids) == len(order)
        draft.status = 'failed' if all_failed else 'completed'
        draft.last_run_summary = {
            'task_ids': [task.id for task in tasks],
            'failed_node_ids': failed_node_ids,
            'node_count': len(nodes),
            'schema_warnings': schema_warnings,
            'completed_at': timezone.now().isoformat(),
        }
        draft.save(update_fields=['nodes', 'status', 'last_run_summary', 'updated_at'])
        record_audit_log(
            action='workflow_run',
            organization=draft.organization,
            actor=User.objects.filter(username=username).first() if username else None,
            target_type='workspace_draft',
            target_id=str(draft.id),
            metadata={'task_ids': [task.id for task in tasks], 'node_count': len(nodes)},
        )
        return draft, tasks
    except Exception as exc:
        draft.nodes = nodes
        draft.status = 'failed'
        draft.last_run_summary = {'error': str(exc), 'failed_at': timezone.now().isoformat()}
        draft.save(update_fields=['nodes', 'status', 'last_run_summary', 'updated_at'])
        raise


def retry_workspace_node(draft: WorkspaceDraft, node_id: str, feedback: str, username: str | None = None) -> tuple[WorkspaceDraft, GenerationTask | None]:
    nodes = [dict(node) for node in draft.nodes]
    edges = draft.edges
    target = next((node for node in nodes if str(node.get('id')) == str(node_id)), None)
    if not target:
        raise ValueError('Node not found in workflow draft.')

    brand_context = draft.brand_context or draft.project.brand_context or {}
    by_id = {str(node.get('id')): node for node in nodes}

    # Retry the target node
    target['status'] = 'running'
    target['feedback'] = feedback
    try:
        with transaction.atomic():
            updated_node, task = run_workflow_node(
                node=target,
                nodes=nodes,
                edges=edges,
                brand_context=brand_context,
                organization=draft.organization,
                project=draft.project,
                campaign=draft.campaign,
                username=username,
                feedback=feedback,
            )
            target.update(updated_node)
    except Exception as exc:
        target['status'] = 'failed'
        target['error_message'] = str(exc)
        draft.nodes = nodes
        draft.status = 'failed'
        draft.last_run_summary = {
            **(draft.last_run_summary or {}),
            'last_retry_node_id': node_id,
            'last_retry_at': timezone.now().isoformat(),
            'last_retry_error': str(exc),
        }
        draft.save(update_fields=['nodes', 'status', 'last_run_summary', 'updated_at'])
        raise

    # Cascade: re-execute downstream nodes in topological order
    order = workflow_execution_order(nodes, edges)
    target_idx = next((i for i, n in enumerate(order) if str(n.get('id')) == str(node_id)), -1)
    downstream_nodes = order[target_idx + 1:] if target_idx >= 0 else []
    tasks: list[GenerationTask] = [task] if task else []
    failed_downstream: list[str] = []

    for ds_node in downstream_nodes:
        node = by_id[str(ds_node.get('id'))]
        node['status'] = 'running'
        try:
            with transaction.atomic():
                updated, ds_task = run_workflow_node(
                    node=node,
                    nodes=nodes,
                    edges=edges,
                    brand_context=brand_context,
                    organization=draft.organization,
                    project=draft.project,
                    campaign=draft.campaign,
                    username=username,
                )
                node.update(updated)
                if ds_task:
                    tasks.append(ds_task)
        except Exception:
            node['status'] = 'failed'
            failed_downstream.append(str(node.get('id')))

    draft.nodes = nodes
    draft.status = 'completed' if not failed_downstream else 'failed'
    draft.last_run_summary = {
        **(draft.last_run_summary or {}),
        'last_retry_node_id': node_id,
        'last_retry_task_id': task.id if task else None,
        'last_retry_at': timezone.now().isoformat(),
        'cascade_task_ids': [t.id for t in tasks],
        'cascade_failed_node_ids': failed_downstream,
    }
    draft.save(update_fields=['nodes', 'status', 'last_run_summary', 'updated_at'])
    record_audit_log(
        action='workflow_retry',
        organization=draft.organization,
        actor=User.objects.filter(username=username).first() if username else None,
        target_type='workspace_draft',
        target_id=str(draft.id),
        metadata={'last_retry_node_id': node_id, 'task_id': task.id if task else None},
    )
    return draft, task
