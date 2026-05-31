from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from django.db import transaction

from api.models import IdempotencyKey, Organization


def _stable_json(payload: Any) -> str:
    try:
        return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    except TypeError:
        return json.dumps(str(payload), ensure_ascii=False, separators=(',', ':'))


def request_hash(request) -> str:
    body = getattr(request, 'data', {}) or {}
    raw = f'{request.method}:{request.path}:{_stable_json(body)}'
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


@dataclass(slots=True)
class IdempotencyResult:
    replayed: bool
    record: IdempotencyKey | None


def claim_idempotency_key(
    *,
    request,
    organization: Organization | None,
    user=None,
) -> IdempotencyResult:
    key = request.headers.get('Idempotency-Key') or request.headers.get('Idempotency-Key'.lower())
    if not key or organization is None:
        return IdempotencyResult(False, None)

    digest = request_hash(request)
    record, created = IdempotencyKey.objects.get_or_create(
        organization=organization,
        key=key,
        defaults={
            'user': user if getattr(user, 'pk', None) else None,
            'request_hash': digest,
            'request_path': request.path,
            'status': 'processing',
        },
    )
    if not created and record.request_hash != digest:
        raise ValueError('Idempotency-Key reuse detected for a different request payload.')
    if not created and record.status == 'processing':
        raise ValueError('Idempotent request is already being processed.')
    return IdempotencyResult(not created and record.status == 'completed', record)


def finish_idempotency_key(
    record: IdempotencyKey | None,
    *,
    response_status: int,
    response_body: dict[str, Any],
    status: str = 'completed',
    resource_type: str = '',
    resource_id: str = '',
) -> None:
    if not record:
        return
    record.status = status
    record.response_status = response_status
    record.response_body = response_body
    record.resource_type = resource_type
    record.resource_id = resource_id
    record.save(update_fields=['status', 'response_status', 'response_body', 'resource_type', 'resource_id', 'updated_at'])
