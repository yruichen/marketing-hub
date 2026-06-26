import json
from decimal import Decimal
from typing import Any

from django.contrib.auth.models import User
from django.db import models, transaction
from django.utils import timezone

from api.contracts import NODE_IO_SCHEMAS, NODE_TYPE_ALIASES, PLAN_LIMITS, normalize_schema, validate_workflow_graph
from api.image_style_skills import DEFAULT_IMAGE_STYLE_SKILL_ID, resolve_style_skill
from ai_gateway.services import AIModelGateway
from api.audit import record_audit_log
from api.redaction import redact_text
from api.serializers import (
    AssetSerializer,
    CampaignSerializer,
    CommunityCreationSerializer,
    FolderSerializer,
    OrganizationSerializer,
    ProjectSerializer,
    TaskSerializer,
    WorkflowTemplateSerializer,
    WorkspaceDraftSerializer,
)
from api.models import (
    AIConfiguration,
    Asset,
    Campaign,
    CommunityCreation,
    Folder,
    GenerationTask,
    Membership,
    Organization,
    Project,
    CreditLedgerEntry,
    UsageEvent,
    WorkflowTemplate,
    WorkspaceDraft,
)

from api.service_modules.workspace import ensure_demo_workspace, membership_role
from api.service_modules.budget import assert_generation_allowed, assert_global_queue_capacity

def estimate_tokens(payload: dict[str, Any], result: dict[str, Any]) -> int:
    payload_size = len(json.dumps(payload, ensure_ascii=False))
    result_size = len(json.dumps(result, ensure_ascii=False))
    return max(120, int((payload_size + result_size) / 3))


def estimate_cost(tokens: int) -> Decimal:
    return Decimal(tokens) * Decimal('0.00002')


def persist_usage(task: GenerationTask, result: dict[str, Any], provider: str = 'mock', model_name: str = '') -> UsageEvent:
    total_tokens = estimate_tokens(task.payload, result)
    cost = estimate_cost(total_tokens)
    event = UsageEvent.objects.create(
        organization=task.organization,
        project=task.project,
        campaign=task.campaign,
        generation_task=task,
        provider=provider,
        model_name=model_name,
        prompt_tokens=max(40, total_tokens // 2),
        completion_tokens=max(40, total_tokens // 2),
        total_tokens=total_tokens,
        cost_usd=cost,
    )
    task.token_count = total_tokens
    task.cost_usd = cost
    task.save(update_fields=['token_count', 'cost_usd', 'updated_at'])
    persist_credit_debit(event)
    return event


def persist_credit_debit(event: UsageEvent) -> CreditLedgerEntry:
    delta_cents = -int((event.cost_usd or Decimal('0')) * Decimal('100'))
    balance = CreditLedgerEntry.objects.filter(organization=event.organization).aggregate(total=models.Sum('delta_cents'))['total'] or 0
    return CreditLedgerEntry.objects.create(
        organization=event.organization,
        source='usage',
        delta_cents=delta_cents,
        balance_after_cents=balance + delta_cents,
        usage_event=event,
        metadata={
            'generation_task_id': event.generation_task_id,
            'provider': event.provider,
            'model_name': event.model_name,
        },
    )


def run_generation_task(task: GenerationTask) -> GenerationTask:
    task.status = 'running'
    task.save(update_fields=['status', 'updated_at'])

    try:
        payload = task.payload or {}
        provider = 'mock'
        model_name = ''
        prompt_tokens = 0
        completion_tokens = 0
        cost_usd = Decimal('0')
        fallback_used = False
        if task.task_type == 'copy':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='copy',
                payload=payload,
                prompt_key='marketing.copy.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
            fallback_used = gateway.fallback_used
        elif task.task_type == 'image':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='image',
                payload=payload,
                prompt_key='marketing.image.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
            fallback_used = gateway.fallback_used
        elif task.task_type == 'storyboard':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='storyboard',
                payload=payload,
                prompt_key='marketing.storyboard.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
            fallback_used = gateway.fallback_used
        elif task.task_type == 'audio':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='audio',
                payload=payload,
                prompt_key='marketing.audio.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
            fallback_used = gateway.fallback_used
        elif task.task_type == 'video':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='video',
                payload=payload,
                prompt_key='marketing.video.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
            fallback_used = gateway.fallback_used
        elif task.task_type == 'rag_search':
            query = payload.get('query', '').strip()
            results = []
            if query:
                creations = CommunityCreation.objects.all()
                for item in creations:
                    score = 0
                    haystack = f"{item.title} {item.content} {' '.join(item.tags)}"
                    for term in query.split():
                        if term.lower() in haystack.lower():
                            score += 1
                    if score:
                        results.append({
                            'id': item.id,
                            'title': item.title,
                            'creation_type': item.creation_type,
                            'creation_type_display': item.get_creation_type_display(),
                            'similarity_score': round(min(0.99, 0.45 + score * 0.12), 3),
                            'content': item.get_content_dict(),
                        })
                results.sort(key=lambda item: item['similarity_score'], reverse=True)
            result = {'query': query, 'results': results, 'rag_logs': ['Semantic retrieval used local keyword fallback because no vector backend is configured.']}
            logs = result['rag_logs']
        elif task.task_type == 'custom_agent':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='custom_agent',
                payload=payload,
                prompt_key='marketing.custom_agent.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
            fallback_used = gateway.fallback_used
        elif task.task_type == 'image_prompt':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='image_prompt',
                payload=payload,
                prompt_key='marketing.image_prompt.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
            fallback_used = gateway.fallback_used
        elif task.task_type == 'review':
            gateway = AIModelGateway.execute(
                organization=task.organization,
                role=membership_role(task.requested_by, task.organization),
                task_type='review',
                payload=payload,
                prompt_key='marketing.review.system',
            )
            result, logs = gateway.payload, gateway.logs
            provider, model_name = gateway.provider, gateway.model_name
            prompt_tokens, completion_tokens, cost_usd = gateway.prompt_tokens, gateway.completion_tokens, gateway.cost_usd
            fallback_used = gateway.fallback_used
        else:
            raise ValueError(f'Unsupported task type: {task.task_type}')

        if fallback_used:
            logs = [*logs, 'gateway:warning=使用了演示数据，非真实 API 生成结果']
            if isinstance(result, dict):
                result = {**result, 'is_demo_fallback': True}
        asset = create_asset_from_task_result(task, result)
        if isinstance(result, dict) and asset is not None:
            result = {**result, 'asset_id': asset.id}
        task.result = {'data': result, 'logs': logs}
        task.status = 'succeeded'
        task.completed_at = timezone.now()
        task.error_message = ''
        task.token_count = max(prompt_tokens + completion_tokens, estimate_tokens(task.payload, result))
        task.cost_usd = cost_usd if cost_usd else estimate_cost(task.token_count)
        task.save(update_fields=['result', 'status', 'completed_at', 'error_message', 'token_count', 'cost_usd', 'updated_at'])
        usage_event = UsageEvent.objects.create(
            organization=task.organization,
            project=task.project,
            campaign=task.campaign,
            generation_task=task,
            provider=provider,
            model_name=model_name,
            prompt_tokens=prompt_tokens or max(40, task.token_count // 2),
            completion_tokens=completion_tokens or max(40, task.token_count // 2),
            total_tokens=task.token_count,
            cost_usd=task.cost_usd,
        )
        persist_credit_debit(usage_event)
        return task
    except Exception as exc:
        task.status = 'failed'
        task.error_message = redact_text(str(exc))
        task.completed_at = timezone.now()
        task.save(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
        raise


def create_generation_task(
    *,
    task_type: str,
    payload: dict[str, Any],
    username: str | None = None,
    organization: Organization | None = None,
    project: Project | None = None,
    campaign: Campaign | None = None,
    run_now: bool = True,
) -> GenerationTask:
    workspace = None
    if organization is None or project is None or campaign is None:
        workspace = ensure_demo_workspace(username)
    organization = organization or workspace['organization']
    project = project or workspace['project']
    campaign = campaign or workspace['campaign']
    user = workspace['user'] if workspace else (User.objects.filter(username=username).first() if username else None)
    payload = payload or {}

    assert_generation_allowed(
        organization=organization,
        task_type=task_type,
        payload=payload,
    )
    assert_global_queue_capacity(task_type)

    task = GenerationTask.objects.create(
        organization=organization,
        project=project,
        campaign=campaign,
        requested_by=user,
        task_type=task_type,
        payload=payload,
    )

    if run_now:
        try:
            run_generation_task(task)
        except Exception:
            task.refresh_from_db()
    record_audit_log(
        action='generation_create',
        actor=user,
        organization=organization,
        target_type='generation_task',
        target_id=str(task.id),
        metadata={'task_type': task_type, 'run_now': run_now},
    )

    return task


def create_asset_from_task_result(task: GenerationTask, result: dict[str, Any]) -> Asset:
    asset_type = 'document'
    source_url = ''
    title = f'{task.get_task_type_display()} #{task.id}'
    tags = []

    if task.task_type == 'copy':
        title = result.get('title') or title
        tags = result.get('tags', [])
    elif task.task_type == 'image':
        asset_type = 'image'
        title = result.get('revised_prompt') or result.get('prompt') or title
        source_url = result.get('image_url', '')
    elif task.task_type == 'storyboard':
        title = result.get('video_topic') or title
    elif task.task_type == 'audio':
        asset_type = 'audio'
        title = result.get('text', title)[:120]
        source_url = result.get('audio_url', '')
    elif task.task_type == 'video':
        asset_type = 'video'
        title = result.get('video_topic') or title
        source_url = result.get('video_url', '')

    if not isinstance(tags, list):
        tags = []

    return Asset.objects.create(
        organization=task.organization,
        # 仅当 task 有关联 project 时才带 project_id：兼容历史数据，
        # 同时让无项目上下文的 task 也能入库（例如 brainstorm 触发的）。
        project=task.project if task.project_id else None,
        campaign=task.campaign,
        asset_type=asset_type,
        title=title[:255],
        source_url=source_url,
        tags=tags,
        metadata={
            'source': 'generation',
            'generation_task_id': task.id,
            'task_type': task.task_type,
            'result': result,
        },
    )


def queue_generation_task(task: GenerationTask):
    from api.tasks import process_generation_task

    assert_global_queue_capacity(task.task_type)
    async_result = process_generation_task.delay(task.id)
    task.celery_task_id = async_result.id
    task.save(update_fields=['celery_task_id', 'updated_at'])
    return async_result


def _run_generation_task_by_id(task_id: int) -> None:
    from api.models import GenerationTask

    task = GenerationTask.objects.filter(pk=task_id).first()
    if not task:
        return
    try:
        run_generation_task(task)
    except Exception:
        # run_generation_task persists failed status before re-raising
        return


def schedule_generation_task(task: GenerationTask):
    """Queue work without blocking the HTTP response when Celery runs eagerly."""
    from django.conf import settings

    assert_global_queue_capacity(task.task_type)
    if getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', True):
        import threading

        threading.Thread(target=_run_generation_task_by_id, args=(task.id,), daemon=True).start()
        return None
    return queue_generation_task(task)


def create_asset_from_payload(
    organization: Organization,
    payload: dict[str, Any],
    *,
    project: Project | None = None,
    campaign: Campaign | None = None,
) -> Asset:
    title = payload.get('title') or payload.get('name') or 'Untitled Asset'
    return Asset.objects.create(
        organization=organization,
        project=project,
        campaign=campaign,
        asset_type=payload.get('asset_type', 'document'),
        title=title,
        source_url=payload.get('source_url', ''),
        tags=payload.get('tags', []),
        metadata=payload.get('metadata', {}),
    )
