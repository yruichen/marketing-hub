import json
import hashlib
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from django.contrib.auth.models import User
from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone

from api.contracts import NODE_IO_SCHEMAS, NODE_TYPE_ALIASES, PLAN_LIMITS, normalize_schema, validate_workflow_graph
from api.image_style_skills import DEFAULT_IMAGE_STYLE_SKILL_ID, resolve_style_skill
from harness.facade import HarnessFacade
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

from api.service_modules.workspace import membership_role
from api.service_modules.budget import assert_generation_allowed, assert_global_queue_capacity

def estimate_tokens(payload: dict[str, Any], result: dict[str, Any]) -> int:
    payload_size = len(json.dumps(payload, ensure_ascii=False))
    result_size = len(json.dumps(result, ensure_ascii=False))
    return max(120, int((payload_size + result_size) / 3))


def estimate_cost(tokens: int) -> Decimal:
    return Decimal(tokens) * Decimal('0.00002')


def persist_usage(task: GenerationTask, result: dict[str, Any], provider: str = 'unreported', model_name: str = '') -> UsageEvent:
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


def source_inputs_digest(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload or {}, ensure_ascii=False, sort_keys=True).encode('utf-8')
    return hashlib.sha256(encoded).hexdigest()


def generation_metadata(task: GenerationTask, result: dict[str, Any], *, provider: str = '', model_name: str = '', prompt_key: str = '') -> dict[str, Any]:
    return {
        'ai_generated': True,
        'generation_task_id': task.id,
        'task_type': task.task_type,
        'provider': provider,
        'model_name': model_name,
        'prompt_key': prompt_key,
        'prompt_version': str(result.get('prompt_version') or ''),
        'prompt_locale': str(result.get('prompt_locale') or ''),
        'prompt_checksum': str(result.get('prompt_checksum') or ''),
        'prompt_evaluation_profile': str(result.get('prompt_evaluation_profile') or ''),
        'harness_version': 'generation-service-v1',
        'generated_at': timezone.now().isoformat(),
        'user_id': task.requested_by_id,
        'organization_id': task.organization_id,
        'project_id': task.project_id,
        'source_inputs_digest': source_inputs_digest(task.payload),
        'ai_disclaimer': 'AI generated draft. Human review is required before publishing.',
        'result': result,
    }


GATEWAY_TASK_PROMPTS = {
    'copy': 'marketing.copy.system',
    'image': 'marketing.image.system',
    'storyboard': 'marketing.storyboard.system',
    'audio': 'marketing.audio.system',
    'video': 'marketing.video.system',
    'custom_agent': 'marketing.custom_agent.system',
    'image_prompt': 'marketing.image_prompt.system',
    'review': 'marketing.review.system',
}


def _claim_generation_task(task_id: int) -> UUID | None:
    """Atomically claim a queued/failed task and return this attempt's fencing token."""
    with transaction.atomic():
        task = GenerationTask.objects.select_for_update().get(pk=task_id)
        if task.status in {'running', 'succeeded'}:
            return None
        execution_id = uuid4()
        task.status = 'running'
        task.execution_id = execution_id
        task.attempt_count += 1
        task.started_at = timezone.now()
        task.completed_at = None
        task.error_message = ''
        task.save(update_fields=[
            'status',
            'execution_id',
            'attempt_count',
            'started_at',
            'completed_at',
            'error_message',
            'updated_at',
        ])
        return execution_id


def _execute_generation(task: GenerationTask):
    payload = task.payload or {}
    if task.task_type in GATEWAY_TASK_PROMPTS:
        gateway = HarnessFacade.execute(
            organization=task.organization,
            role=membership_role(task.requested_by, task.organization),
            task_type=task.task_type,
            payload=payload,
            prompt_key=GATEWAY_TASK_PROMPTS[task.task_type],
        )
        return (
            gateway.payload,
            gateway.logs,
            gateway.provider,
            gateway.model_name,
            gateway.prompt_tokens,
            gateway.completion_tokens,
            gateway.cost_usd,
            gateway.fallback_used,
            gateway.prompt_version,
            gateway.prompt_locale,
            gateway.prompt_checksum,
            gateway.evaluation_profile,
        )

    if task.task_type == 'rag_search':
        query = payload.get('query', '').strip()
        results = []
        if query:
            creations = CommunityCreation.objects.filter(moderation_status='visible').filter(
                Q(visibility='public') | Q(visibility='organization', organization=task.organization)
            )
            for item in creations:
                haystack = f"{item.title} {item.content} {' '.join(item.tags)}".lower()
                score = sum(1 for term in query.split() if term.lower() in haystack)
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
        logs = ['Semantic retrieval used the built-in keyword index.']
        return {'query': query, 'results': results, 'rag_logs': logs}, logs, 'internal_search', 'keyword-v1', 0, 0, Decimal('0'), False, '', '', '', ''

    raise ValueError(f'Unsupported task type: {task.task_type}')


def run_generation_task(task: GenerationTask, auto_save: bool = True) -> GenerationTask:
    execution_id = _claim_generation_task(task.id)
    task.refresh_from_db()
    if execution_id is None:
        return task

    try:
        (
            result,
            logs,
            provider,
            model_name,
            prompt_tokens,
            completion_tokens,
            cost_usd,
            fallback_used,
            prompt_version,
            prompt_locale,
            prompt_checksum,
            prompt_evaluation_profile,
        ) = _execute_generation(task)
        if isinstance(result, dict):
            result = {
                **result,
                'ai_generated': True,
                'provider': provider,
                'model_name': model_name,
                'prompt_version': prompt_version,
                'prompt_locale': prompt_locale,
                'prompt_checksum': prompt_checksum,
                'prompt_evaluation_profile': prompt_evaluation_profile,
                'harness_version': 'generation-service-v1',
                'source_inputs_digest': source_inputs_digest(task.payload),
            }

        with transaction.atomic():
            persisted = GenerationTask.objects.select_for_update().select_related(
                'organization', 'project', 'campaign', 'requested_by'
            ).get(pk=task.id)
            if persisted.status != 'running' or persisted.execution_id != execution_id:
                task.refresh_from_db()
                return task

            asset = create_asset_from_task_result(
                persisted,
                result,
                provider=provider,
                model_name=model_name,
            ) if auto_save else None
            if isinstance(result, dict) and asset is not None:
                result = {**result, 'asset_id': asset.id}

            persisted.result = {'data': result, 'logs': logs}
            persisted.status = 'succeeded'
            persisted.completed_at = timezone.now()
            persisted.error_message = ''
            persisted.token_count = max(prompt_tokens + completion_tokens, estimate_tokens(persisted.payload, result))
            persisted.cost_usd = cost_usd if cost_usd else estimate_cost(persisted.token_count)
            persisted.save(update_fields=[
                'result',
                'status',
                'completed_at',
                'error_message',
                'token_count',
                'cost_usd',
                'updated_at',
            ])
            usage_event = UsageEvent.objects.create(
                organization=persisted.organization,
                project=persisted.project,
                campaign=persisted.campaign,
                generation_task=persisted,
                provider=provider,
                model_name=model_name,
                prompt_tokens=prompt_tokens or max(40, persisted.token_count // 2),
                completion_tokens=completion_tokens or max(40, persisted.token_count // 2),
                total_tokens=persisted.token_count,
                cost_usd=persisted.cost_usd,
            )
            persist_credit_debit(usage_event)
        task.refresh_from_db()
        return task
    except Exception as exc:
        with transaction.atomic():
            persisted = GenerationTask.objects.select_for_update().get(pk=task.id)
            if persisted.status == 'running' and persisted.execution_id == execution_id:
                persisted.status = 'failed'
                persisted.error_message = redact_text(str(exc))
                persisted.completed_at = timezone.now()
                persisted.save(update_fields=['status', 'error_message', 'completed_at', 'updated_at'])
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
    auto_save: bool = True,
) -> GenerationTask:
    if organization is None or project is None or campaign is None:
        raise ValueError('A complete organization, project, and campaign scope is required.')
    user = User.objects.filter(username=username).first() if username else None
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
            run_generation_task(task, auto_save=auto_save)
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


def create_asset_from_task_result(task: GenerationTask, result: dict[str, Any], *, provider: str = '', model_name: str = '') -> Asset:
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
            **generation_metadata(
                task,
                result,
                provider=provider or str(result.get('provider') or ''),
                model_name=model_name or str(result.get('model_name') or ''),
                prompt_key=f'marketing.{task.task_type}.system',
            ),
        },
    )


def queue_generation_task(task: GenerationTask):
    from api.tasks import process_generation_task

    assert_global_queue_capacity(task.task_type)
    async_result = process_generation_task.delay(task.id)
    task.celery_task_id = async_result.id
    task.save(update_fields=['celery_task_id', 'updated_at'])
    return async_result


def schedule_generation_task(task: GenerationTask):
    """Submit work through Celery in every environment.

    Eager mode is intentionally synchronous; development must not emulate a
    durable queue with an untracked daemon thread.
    """
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
