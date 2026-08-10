from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from api.audit import record_audit_log
from api.contracts import NODE_TYPE_ALIASES
from api.models import Asset, Campaign, GenerationTask, Organization, Project, WorkflowNodeRun, WorkflowRun, WorkflowRunEvent, WorkspaceDraft
from api.redaction import redact_text
from api.service_modules.generation import create_generation_task
from api.service_modules.workflow_parts.contracts import node_io_schema, validate_workflow_contract
from api.service_modules.workflow_parts.payloads import (
    _reshape_image_prompt_output,
    build_payload_for_node,
    extract_upstream_text,
    upstream_outputs,
    workflow_execution_order,
)
from harness.graph import build_graph_plan


def _workflow_user(username: str | None) -> User | None:
    return User.objects.filter(username=username).first() if username else None


def _summarize_output(output: Any, max_chars: int = 600) -> dict[str, Any]:
    if not isinstance(output, dict):
        return {'value': str(output)[:max_chars]} if output not in (None, '') else {}
    summary: dict[str, Any] = {}
    for key in ('title', 'body', 'prompt', 'video_topic', 'audio_url', 'image_url', 'video_url', 'summary', 'response'):
        value = output.get(key)
        if value not in (None, '', [], {}):
            summary[key] = str(value)[:max_chars] if not isinstance(value, (int, float, bool)) else value
    for key in ('tags', 'paragraphs', 'scenes', 'results', 'issues'):
        value = output.get(key)
        if isinstance(value, list):
            summary[f'{key}_count'] = len(value)
    if not summary:
        summary['keys'] = list(output.keys())[:12]
    return summary


def record_workflow_event(
    workflow_run: WorkflowRun | None,
    event_type: str,
    *,
    node_run: WorkflowNodeRun | None = None,
    node_id: str = '',
    payload: dict[str, Any] | None = None,
) -> None:
    if not workflow_run:
        return
    WorkflowRunEvent.objects.create(
        workflow_run=workflow_run,
        node_run=node_run,
        event_type=event_type,
        node_id=node_id,
        payload=payload or {},
    )


def _asset_ids_for_task(task: GenerationTask | None) -> list[int]:
    if not task:
        return []
    result = task.result.get('data') if isinstance(task.result, dict) else {}
    asset_id = result.get('asset_id') if isinstance(result, dict) else None
    asset_ids: list[int] = []
    if isinstance(asset_id, int):
        asset_ids.append(asset_id)
    elif isinstance(asset_id, str) and asset_id.isdigit():
        asset_ids.append(int(asset_id))
    stored_ids = list(
        Asset.objects
        .filter(organization=task.organization, metadata__generation_task_id=task.id)
        .values_list('id', flat=True)
    )
    for stored_id in stored_ids:
        if stored_id not in asset_ids:
            asset_ids.append(stored_id)
    return asset_ids


def _review_summary(output: Any) -> dict[str, Any]:
    if not isinstance(output, dict):
        return {}
    issues = output.get('issues')
    risk_count = len(issues) if isinstance(issues, list) else 0
    verdict = output.get('verdict') or output.get('status') or output.get('summary') or ''
    return {
        'risk_count': risk_count,
        'verdict': str(verdict)[:240] if verdict else '',
        'requires_revision': risk_count > 0,
    }


def annotate_task_assets_for_workflow(
    *,
    task: GenerationTask | None,
    workflow_run: WorkflowRun,
    node_run: WorkflowNodeRun | None,
    node: dict[str, Any],
) -> list[int]:
    asset_ids = _asset_ids_for_task(task)
    if not task or not asset_ids:
        return []
    workflow_metadata = {
        'source': 'workflow',
        'workflow_run_id': workflow_run.id,
        'workflow_draft_id': workflow_run.draft_id,
        'workflow_node_run_id': node_run.id if node_run else None,
        'workflow_node_id': str(node.get('id') or ''),
        'workflow_node_type': str(node.get('type') or ''),
        'workflow_node_label': str(node.get('label') or node.get('type') or node.get('id') or ''),
        'project_id': workflow_run.project_id,
        'campaign_id': workflow_run.campaign_id,
    }
    if str(node.get('type')) == 'review' or task.task_type == 'review':
        workflow_metadata['review'] = _review_summary(node.get('output'))

    updated_ids: list[int] = []
    for asset in Asset.objects.filter(pk__in=asset_ids, organization=workflow_run.organization):
        asset.metadata = {
            **(asset.metadata or {}),
            **workflow_metadata,
        }
        asset.save(update_fields=['metadata'])
        updated_ids.append(asset.id)
        record_workflow_event(
            workflow_run,
            'asset_saved',
            node_run=node_run,
            node_id=str(node.get('id') or ''),
            payload={
                'asset_id': asset.id,
                'task_id': task.id,
                'asset_type': asset.asset_type,
                'review': workflow_metadata.get('review'),
            },
        )
    return updated_ids


def create_workflow_run(
    draft: WorkspaceDraft,
    *,
    username: str | None = None,
    idempotency_key: str = '',
    summary: dict[str, Any] | None = None,
) -> WorkflowRun:
    nodes = draft.nodes or []
    edges = draft.edges or []
    run = WorkflowRun.objects.create(
        draft=draft,
        organization=draft.organization,
        project=draft.project,
        campaign=draft.campaign,
        requested_by=_workflow_user(username),
        idempotency_key=idempotency_key,
        total_nodes=len(nodes),
        input_snapshot={
            'draft_id': draft.id,
            'draft_name': draft.name,
            'brand_context': draft.brand_context or draft.project.brand_context or {},
            'nodes': nodes,
            'edges': edges,
        },
        summary=summary or {},
    )
    for node in nodes:
        WorkflowNodeRun.objects.create(
            workflow_run=run,
            node_id=str(node.get('id', '')),
            node_type=str(node.get('type', '')),
            node_label=str(node.get('label') or node.get('type') or node.get('id') or ''),
            status='queued',
            input_snapshot={
                'config': node.get('config') if isinstance(node.get('config'), dict) else {},
                'input_schema': node.get('input_schema') if isinstance(node.get('input_schema'), dict) else {},
            },
        )
    record_workflow_event(run, 'run_created', payload={'node_count': len(nodes)})
    return run


def run_workflow_run_by_id(workflow_run_id: int, username: str | None = None) -> tuple[WorkspaceDraft | None, list[GenerationTask]]:
    execution_id = _claim_workflow_run(workflow_run_id)
    workflow_run = WorkflowRun.objects.select_related('draft', 'organization', 'project', 'campaign').filter(pk=workflow_run_id).first()
    if not workflow_run:
        return None, []
    if execution_id is None:
        task_ids = workflow_run.summary.get('task_ids', []) if isinstance(workflow_run.summary, dict) else []
        tasks = list(GenerationTask.objects.filter(pk__in=task_ids).order_by('created_at')) if task_ids else []
        return workflow_run.draft, tasks
    return run_workspace_workflow(workflow_run.draft, username=username, workflow_run=workflow_run)


def _claim_workflow_run(workflow_run_id: int) -> UUID | None:
    """Claim a workflow run once so broker redelivery cannot execute the DAG twice."""
    terminal_statuses = {'succeeded', 'failed', 'partial_success', 'cancelled'}
    with transaction.atomic():
        workflow_run = WorkflowRun.objects.select_for_update().filter(pk=workflow_run_id).first()
        if workflow_run is None or workflow_run.status == 'running' or workflow_run.status in terminal_statuses:
            return None
        execution_id = uuid4()
        workflow_run.status = 'running'
        workflow_run.execution_id = execution_id
        workflow_run.attempt_count += 1
        workflow_run.started_at = timezone.now()
        workflow_run.save(update_fields=['status', 'execution_id', 'attempt_count', 'started_at', 'updated_at'])
        return execution_id


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


def run_workspace_workflow(
    draft: WorkspaceDraft,
    username: str | None = None,
    workflow_run: WorkflowRun | None = None,
) -> tuple[WorkspaceDraft, list[GenerationTask]]:
    nodes = [dict(node, status='queued') for node in draft.nodes]
    edges = draft.edges
    brand_context = draft.brand_context or draft.project.brand_context or {}
    tasks: list[GenerationTask] = []
    workflow_run = workflow_run or create_workflow_run(draft, username=username)

    draft.status = 'running'
    draft.nodes = nodes
    draft.save(update_fields=['status', 'nodes', 'updated_at'])
    workflow_run.status = 'running'
    workflow_run.started_at = workflow_run.started_at or timezone.now()
    workflow_run.total_nodes = len(nodes)
    workflow_run.save(update_fields=['status', 'started_at', 'total_nodes', 'updated_at'])
    record_workflow_event(workflow_run, 'run_started', payload={'node_count': len(nodes)})

    try:
        order = workflow_execution_order(nodes, edges)
        schema_warnings = validate_workflow_contract(nodes, edges)
        by_id = {str(node.get('id')): node for node in nodes}
        failed_node_ids: list[str] = []
        workflow_asset_ids: list[int] = []

        for ordered_node in order:
            node = by_id[str(ordered_node.get('id'))]
            node['status'] = 'running'
            draft.nodes = nodes
            draft.save(update_fields=['nodes', 'updated_at'])
            node_run = WorkflowNodeRun.objects.filter(workflow_run=workflow_run, node_id=str(node.get('id')), attempt=1).first()
            node_started_at = timezone.now()
            if node_run:
                node_run.status = 'running'
                node_run.started_at = node_started_at
                node_run.error_code = ''
                node_run.error_message = ''
                node_run.save(update_fields=['status', 'started_at', 'error_code', 'error_message', 'updated_at'])
            record_workflow_event(workflow_run, 'node_started', node_run=node_run, node_id=str(node.get('id')), payload={'node_type': node.get('type')})
            try:
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
                if updated_node.get('status') == 'failed':
                    failed_node_ids.append(str(updated_node.get('id')))
                if node_run:
                    node_completed_at = timezone.now()
                    node_run.status = 'succeeded' if updated_node.get('status') == 'succeeded' else str(updated_node.get('status') or 'failed')
                    node_run.completed_at = node_completed_at
                    node_run.duration_ms = max(0, int((node_completed_at - node_started_at).total_seconds() * 1000))
                    node_run.generation_task = task
                    node_run.output_summary = _summarize_output(updated_node.get('output'))
                    node_run.error_message = str(updated_node.get('error_message') or '')
                    node_run.save(update_fields=['status', 'completed_at', 'duration_ms', 'generation_task', 'output_summary', 'error_message', 'updated_at'])
                if task and updated_node.get('status') == 'succeeded':
                    workflow_asset_ids.extend(annotate_task_assets_for_workflow(
                        task=task,
                        workflow_run=workflow_run,
                        node_run=node_run,
                        node=updated_node,
                    ))
                record_workflow_event(
                    workflow_run,
                    'node_succeeded' if updated_node.get('status') == 'succeeded' else 'node_finished',
                    node_run=node_run,
                    node_id=str(node.get('id')),
                    payload={'task_id': task.id if task else None, 'status': updated_node.get('status')},
                )
            except Exception as node_exc:
                node['status'] = 'failed'
                node['error_message'] = str(node_exc)
                failed_node_ids.append(str(node.get('id')))
                if node_run:
                    node_completed_at = timezone.now()
                    node_run.status = 'failed'
                    node_run.completed_at = node_completed_at
                    node_run.duration_ms = max(0, int((node_completed_at - node_started_at).total_seconds() * 1000))
                    node_run.error_code = 'node_exception'
                    node_run.error_message = str(node_exc)
                    node_run.save(update_fields=['status', 'completed_at', 'duration_ms', 'error_code', 'error_message', 'updated_at'])
                record_workflow_event(workflow_run, 'node_failed', node_run=node_run, node_id=str(node.get('id')), payload={'error': str(node_exc)})
            draft.nodes = nodes
            draft.save(update_fields=['nodes', 'updated_at'])

        draft.nodes = nodes
        all_failed = len(failed_node_ids) == len(order)
        draft.status = 'failed' if all_failed else 'completed'
        completed_at = timezone.now()
        completed_count = WorkflowNodeRun.objects.filter(workflow_run=workflow_run, status='succeeded').count()
        failed_count = WorkflowNodeRun.objects.filter(workflow_run=workflow_run, status='failed').count()
        total_cost = sum((task.cost_usd or Decimal('0')) for task in tasks)
        token_count = sum((task.token_count or 0) for task in tasks)
        workflow_run.status = 'failed' if all_failed else ('partial_success' if failed_node_ids else 'succeeded')
        workflow_run.completed_nodes = completed_count
        workflow_run.failed_nodes = failed_count
        workflow_run.token_count = token_count
        workflow_run.actual_cost_usd = total_cost
        workflow_run.completed_at = completed_at
        workflow_run.summary = {
            'task_ids': [task.id for task in tasks],
            'failed_node_ids': failed_node_ids,
            'asset_ids': workflow_asset_ids,
            'node_count': len(nodes),
            'schema_warnings': schema_warnings,
            'completed_at': completed_at.isoformat(),
        }
        workflow_run.save(update_fields=['status', 'completed_nodes', 'failed_nodes', 'token_count', 'actual_cost_usd', 'completed_at', 'summary', 'updated_at'])
        draft.last_run_summary = {
            'workflow_run_id': workflow_run.id,
            'task_ids': [task.id for task in tasks],
            'failed_node_ids': failed_node_ids,
            'asset_ids': workflow_asset_ids,
            'node_count': len(nodes),
            'schema_warnings': schema_warnings,
            'completed_at': completed_at.isoformat(),
        }
        draft.save(update_fields=['nodes', 'status', 'last_run_summary', 'updated_at'])
        record_workflow_event(workflow_run, 'run_completed', payload={'status': workflow_run.status, 'task_ids': [task.id for task in tasks]})
        record_audit_log(
            action='workflow_run',
            organization=draft.organization,
            actor=_workflow_user(username),
            target_type='workspace_draft',
            target_id=str(draft.id),
            metadata={'workflow_run_id': workflow_run.id, 'task_ids': [task.id for task in tasks], 'node_count': len(nodes)},
        )
        return draft, tasks
    except Exception as exc:
        failed_at = timezone.now()
        error_message = redact_text(str(exc))
        draft.nodes = nodes
        draft.status = 'failed'
        draft.last_run_summary = {'workflow_run_id': workflow_run.id, 'error': error_message, 'failed_at': failed_at.isoformat()}
        draft.save(update_fields=['nodes', 'status', 'last_run_summary', 'updated_at'])
        workflow_run.status = 'failed'
        workflow_run.failed_nodes = WorkflowNodeRun.objects.filter(workflow_run=workflow_run, status='failed').count()
        workflow_run.completed_at = failed_at
        workflow_run.summary = {'error': error_message, 'failed_at': failed_at.isoformat()}
        workflow_run.save(update_fields=['status', 'failed_nodes', 'completed_at', 'summary', 'updated_at'])
        record_workflow_event(workflow_run, 'run_failed', payload={'error': error_message})
        raise


def retry_workspace_node(
    draft: WorkspaceDraft,
    node_id: str,
    feedback: str,
    username: str | None = None,
    idempotency_key: str = '',
) -> tuple[WorkspaceDraft, GenerationTask | None, WorkflowRun]:
    nodes = [dict(node) for node in draft.nodes]
    edges = draft.edges
    target = next((node for node in nodes if str(node.get('id')) == str(node_id)), None)
    if not target:
        raise ValueError('Node not found in workflow draft.')

    brand_context = draft.brand_context or draft.project.brand_context or {}
    by_id = {str(node.get('id')): node for node in nodes}
    workflow_run = create_workflow_run(
        draft,
        username=username,
        idempotency_key=idempotency_key,
        summary={'mode': 'retry', 'retry_node_id': node_id},
    )
    _claim_workflow_run(workflow_run.id)
    workflow_run.refresh_from_db()
    WorkflowNodeRun.objects.filter(workflow_run=workflow_run).exclude(node_id=str(node_id)).update(status='skipped')
    node_run = WorkflowNodeRun.objects.filter(workflow_run=workflow_run, node_id=str(node_id), attempt=1).first()
    node_started_at = timezone.now()
    if node_run:
        node_run.status = 'running'
        node_run.started_at = node_started_at
        node_run.input_snapshot = {
            **(node_run.input_snapshot or {}),
            'feedback': feedback,
            'mode': 'retry',
        }
        node_run.save(update_fields=['status', 'started_at', 'input_snapshot', 'updated_at'])
    record_workflow_event(workflow_run, 'retry_started', node_run=node_run, node_id=str(node_id), payload={'feedback': feedback})

    # Retry the target node
    target['status'] = 'running'
    target['feedback'] = feedback
    workflow_asset_ids: list[int] = []
    try:
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
        if node_run:
            completed_at = timezone.now()
            node_run.status = 'succeeded' if updated_node.get('status') == 'succeeded' else str(updated_node.get('status') or 'failed')
            node_run.completed_at = completed_at
            node_run.duration_ms = max(0, int((completed_at - node_started_at).total_seconds() * 1000))
            node_run.generation_task = task
            node_run.output_summary = _summarize_output(updated_node.get('output'))
            node_run.error_message = str(updated_node.get('error_message') or '')
            node_run.save(update_fields=['status', 'completed_at', 'duration_ms', 'generation_task', 'output_summary', 'error_message', 'updated_at'])
        if task and updated_node.get('status') == 'succeeded':
            workflow_asset_ids.extend(annotate_task_assets_for_workflow(
                task=task,
                workflow_run=workflow_run,
                node_run=node_run,
                node=updated_node,
            ))
        record_workflow_event(workflow_run, 'retry_node_succeeded', node_run=node_run, node_id=str(node_id), payload={'task_id': task.id if task else None})
    except Exception as exc:
        error_message = redact_text(str(exc))
        target['status'] = 'failed'
        target['error_message'] = error_message
        failed_at = timezone.now()
        if node_run:
            node_run.status = 'failed'
            node_run.completed_at = failed_at
            node_run.duration_ms = max(0, int((failed_at - node_started_at).total_seconds() * 1000))
            node_run.error_code = 'retry_exception'
            node_run.error_message = error_message
            node_run.save(update_fields=['status', 'completed_at', 'duration_ms', 'error_code', 'error_message', 'updated_at'])
        workflow_run.status = 'failed'
        workflow_run.failed_nodes = 1
        workflow_run.completed_at = failed_at
        workflow_run.summary = {'mode': 'retry', 'retry_node_id': node_id, 'error': error_message, 'failed_at': failed_at.isoformat()}
        workflow_run.save(update_fields=['status', 'failed_nodes', 'completed_at', 'summary', 'updated_at'])
        record_workflow_event(workflow_run, 'retry_failed', node_run=node_run, node_id=str(node_id), payload={'error': error_message})
        draft.nodes = nodes
        draft.status = 'failed'
        draft.last_run_summary = {
            **(draft.last_run_summary or {}),
            'last_retry_workflow_run_id': workflow_run.id,
            'last_retry_node_id': node_id,
            'last_retry_at': failed_at.isoformat(),
            'last_retry_error': error_message,
        }
        draft.save(update_fields=['nodes', 'status', 'last_run_summary', 'updated_at'])
        raise

    # Cascade: re-execute downstream nodes in topological order
    graph_plan = build_graph_plan(nodes, edges)
    descendant_ids = set(graph_plan.descendants(str(node_id)))
    downstream_nodes = [
        by_id[ordered_id] for ordered_id in graph_plan.ordered_ids if ordered_id in descendant_ids
    ]
    tasks: list[GenerationTask] = [task] if task else []
    failed_downstream: list[str] = []

    for ds_node in downstream_nodes:
        node = by_id[str(ds_node.get('id'))]
        node['status'] = 'running'
        ds_node_run = WorkflowNodeRun.objects.filter(workflow_run=workflow_run, node_id=str(node.get('id')), attempt=1).first()
        ds_started_at = timezone.now()
        if ds_node_run:
            ds_node_run.status = 'running'
            ds_node_run.started_at = ds_started_at
            ds_node_run.save(update_fields=['status', 'started_at', 'updated_at'])
        record_workflow_event(workflow_run, 'cascade_node_started', node_run=ds_node_run, node_id=str(node.get('id')), payload={'source_retry_node_id': node_id})
        try:
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
            if ds_node_run:
                ds_completed_at = timezone.now()
                ds_node_run.status = 'succeeded' if updated.get('status') == 'succeeded' else str(updated.get('status') or 'failed')
                ds_node_run.completed_at = ds_completed_at
                ds_node_run.duration_ms = max(0, int((ds_completed_at - ds_started_at).total_seconds() * 1000))
                ds_node_run.generation_task = ds_task
                ds_node_run.output_summary = _summarize_output(updated.get('output'))
                ds_node_run.error_message = str(updated.get('error_message') or '')
                ds_node_run.save(update_fields=['status', 'completed_at', 'duration_ms', 'generation_task', 'output_summary', 'error_message', 'updated_at'])
            if ds_task and updated.get('status') == 'succeeded':
                workflow_asset_ids.extend(annotate_task_assets_for_workflow(
                    task=ds_task,
                    workflow_run=workflow_run,
                    node_run=ds_node_run,
                    node=updated,
                ))
            record_workflow_event(workflow_run, 'cascade_node_succeeded', node_run=ds_node_run, node_id=str(node.get('id')), payload={'task_id': ds_task.id if ds_task else None})
        except Exception:
            node['status'] = 'failed'
            failed_downstream.append(str(node.get('id')))
            if ds_node_run:
                ds_completed_at = timezone.now()
                ds_node_run.status = 'failed'
                ds_node_run.completed_at = ds_completed_at
                ds_node_run.duration_ms = max(0, int((ds_completed_at - ds_started_at).total_seconds() * 1000))
                ds_node_run.error_code = 'cascade_exception'
                ds_node_run.error_message = str(node.get('error_message') or 'Downstream node failed')
                ds_node_run.save(update_fields=['status', 'completed_at', 'duration_ms', 'error_code', 'error_message', 'updated_at'])
            record_workflow_event(workflow_run, 'cascade_node_failed', node_run=ds_node_run, node_id=str(node.get('id')))

    draft.nodes = nodes
    draft.status = 'completed' if not failed_downstream else 'failed'
    completed_at = timezone.now()
    workflow_run.status = 'failed' if failed_downstream else 'succeeded'
    workflow_run.completed_nodes = WorkflowNodeRun.objects.filter(workflow_run=workflow_run, status='succeeded').count()
    workflow_run.failed_nodes = WorkflowNodeRun.objects.filter(workflow_run=workflow_run, status='failed').count()
    workflow_run.token_count = sum((item.token_count or 0) for item in tasks)
    workflow_run.actual_cost_usd = sum((item.cost_usd or Decimal('0')) for item in tasks)
    workflow_run.completed_at = completed_at
    workflow_run.summary = {
        'mode': 'retry',
        'retry_node_id': node_id,
        'task_ids': [t.id for t in tasks],
        'failed_node_ids': failed_downstream,
        'asset_ids': workflow_asset_ids,
        'completed_at': completed_at.isoformat(),
    }
    workflow_run.save(update_fields=['status', 'completed_nodes', 'failed_nodes', 'token_count', 'actual_cost_usd', 'completed_at', 'summary', 'updated_at'])
    draft.last_run_summary = {
        **(draft.last_run_summary or {}),
        'last_retry_workflow_run_id': workflow_run.id,
        'last_retry_node_id': node_id,
        'last_retry_task_id': task.id if task else None,
        'last_retry_at': completed_at.isoformat(),
        'cascade_task_ids': [t.id for t in tasks],
        'cascade_failed_node_ids': failed_downstream,
        'cascade_asset_ids': workflow_asset_ids,
    }
    draft.save(update_fields=['nodes', 'status', 'last_run_summary', 'updated_at'])
    record_audit_log(
        action='workflow_retry',
        organization=draft.organization,
        actor=_workflow_user(username),
        target_type='workspace_draft',
        target_id=str(draft.id),
        metadata={'workflow_run_id': workflow_run.id, 'last_retry_node_id': node_id, 'task_id': task.id if task else None},
    )
    record_workflow_event(workflow_run, 'retry_completed', payload={'status': workflow_run.status, 'task_ids': [t.id for t in tasks]})
    return draft, task, workflow_run
