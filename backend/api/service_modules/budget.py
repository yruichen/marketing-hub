from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import APIException, Throttled, ValidationError

from api.models import CreditLedgerEntry, GenerationTask, Organization, UsageEvent


class PaymentRequired(APIException):
    status_code = 402
    default_detail = 'Generation budget exceeded.'
    default_code = 'payment_required'


@dataclass(frozen=True)
class BudgetDecision:
    allowed: bool
    reason: str = ''
    retry_after_seconds: int | None = None


TASK_ESTIMATED_COST_CENTS = {
    'copy': 1,
    'image_prompt': 1,
    'storyboard': 2,
    'review': 1,
    'custom_agent': 2,
    'brainstorm': 2,
    'rag_search': 1,
    'audio': 5,
    'image': 10,
    'video': 100,
}


def _payload_size_bytes(payload: dict[str, Any]) -> int:
    return len(json.dumps(payload or {}, ensure_ascii=False).encode('utf-8'))


def _daily_usage_cents(organization: Organization) -> int:
    today = timezone.localdate()
    total = UsageEvent.objects.filter(
        organization=organization,
        created_at__date=today,
    ).aggregate(total=Sum('cost_usd'))['total'] or Decimal('0')
    return int(total * Decimal('100'))


def _credit_balance_cents(organization: Organization) -> int:
    return CreditLedgerEntry.objects.filter(organization=organization).aggregate(
        total=Sum('delta_cents')
    )['total'] or 0


def _validate_payload(task_type: str, payload: dict[str, Any]) -> None:
    max_payload_bytes = int(getattr(settings, 'GENERATION_MAX_PAYLOAD_BYTES', 64 * 1024))
    if _payload_size_bytes(payload) > max_payload_bytes:
        raise ValidationError({'payload': f'payload must be {max_payload_bytes} bytes or fewer.'})

    if task_type == 'copy' and len(str(payload.get('product_description') or '')) > 8000:
        raise ValidationError({'product_description': 'product_description must be 8000 characters or fewer.'})
    if task_type in {'image', 'image_prompt'} and len(str(payload.get('prompt') or payload.get('subject') or '')) > 3000:
        raise ValidationError({'prompt': 'prompt must be 3000 characters or fewer.'})
    if task_type == 'audio' and len(str(payload.get('text') or '')) > 5000:
        raise ValidationError({'text': 'text must be 5000 characters or fewer.'})
    if task_type in {'storyboard', 'video'}:
        try:
            duration = int(payload.get('duration') or payload.get('duration_seconds') or 30)
        except (TypeError, ValueError):
            raise ValidationError({'duration': 'duration must be an integer.'})
        max_duration = int(getattr(settings, 'GENERATION_MAX_VIDEO_SECONDS', 180 if task_type == 'storyboard' else 60))
        if duration < 1 or duration > max_duration:
            raise ValidationError({'duration': f'duration must be between 1 and {max_duration} seconds.'})


def assert_generation_allowed(
    *,
    organization: Organization,
    task_type: str,
    payload: dict[str, Any],
    estimated_cost_cents: int | None = None,
) -> BudgetDecision:
    _validate_payload(task_type, payload)

    suspended_until = getattr(organization, 'generation_suspended_until', None)
    if suspended_until and suspended_until > timezone.now():
        raise Throttled(detail='Generation is temporarily suspended for this organization.')

    running_count = GenerationTask.objects.filter(
        organization=organization,
        status='running',
    ).count()
    max_running = int(getattr(settings, 'GENERATION_MAX_RUNNING_TASKS_DEFAULT', 5))
    if running_count >= max_running:
        raise Throttled(detail='Too many running generation tasks.')

    queued_count = GenerationTask.objects.filter(
        organization=organization,
        status='queued',
    ).count()
    max_queued = int(getattr(settings, 'GENERATION_MAX_QUEUED_TASKS_DEFAULT', 50))
    if queued_count >= max_queued:
        raise Throttled(detail='Too many queued generation tasks.')

    estimated = estimated_cost_cents if estimated_cost_cents is not None else TASK_ESTIMATED_COST_CENTS.get(task_type, 2)
    daily_cap = int(getattr(settings, 'GENERATION_DAILY_BUDGET_CENTS_DEFAULT', 5000))
    if daily_cap >= 0 and _daily_usage_cents(organization) + estimated > daily_cap:
        raise PaymentRequired('Daily generation budget exceeded.')

    if getattr(settings, 'GENERATION_REQUIRE_CREDIT_BALANCE', False):
        if _credit_balance_cents(organization) < estimated:
            raise PaymentRequired('Insufficient generation credits.')

    return BudgetDecision(allowed=True)


def assert_global_queue_capacity(task_type: str) -> BudgetDecision:
    max_depth = int(getattr(settings, 'GENERATION_QUEUE_MAX_DEPTH', 500))
    if max_depth < 0:
        return BudgetDecision(allowed=True)
    queued_count = GenerationTask.objects.filter(status='queued').count()
    if queued_count >= max_depth:
        raise Throttled(detail='Generation queue is temporarily full.')
    task_type_depth = int(getattr(settings, f'GENERATION_QUEUE_MAX_DEPTH_{task_type.upper()}', max_depth))
    if task_type_depth >= 0:
        task_type_count = GenerationTask.objects.filter(status='queued', task_type=task_type).count()
        if task_type_count >= task_type_depth:
            raise Throttled(detail=f'{task_type} generation queue is temporarily full.')
    return BudgetDecision(allowed=True)


def expire_stale_generation_tasks() -> dict[str, int]:
    queued_ttl_seconds = int(getattr(settings, 'GENERATION_QUEUED_TTL_SECONDS', 30 * 60))
    running_timeout_seconds = int(getattr(settings, 'GENERATION_RUNNING_TIMEOUT_SECONDS', 30 * 60))
    now = timezone.now()
    queued_cutoff = now - timezone.timedelta(seconds=queued_ttl_seconds)
    running_cutoff = now - timezone.timedelta(seconds=running_timeout_seconds)

    queued = GenerationTask.objects.filter(status='queued', created_at__lt=queued_cutoff).update(
        status='failed',
        error_message='Generation task expired before a worker picked it up.',
        completed_at=now,
    )
    running = GenerationTask.objects.filter(status='running', updated_at__lt=running_cutoff).update(
        status='failed',
        error_message='Generation task timed out while running.',
        completed_at=now,
    )
    return {'queued_expired': queued, 'running_timed_out': running}
