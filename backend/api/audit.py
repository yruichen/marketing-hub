from __future__ import annotations

from typing import Any

from django.contrib.auth.models import User

from api.models import AuditLog, Organization
from api.redaction import redact_mapping
from api.request_context import get_current_request_id


def record_audit_log(
    *,
    action: str,
    actor: User | None = None,
    organization: Organization | None = None,
    target_type: str = '',
    target_id: str = '',
    ip_address: str | None = None,
    user_agent: str = '',
    metadata: dict[str, Any] | None = None,
    request_id: str = '',
) -> AuditLog:
    return AuditLog.objects.create(
        action=action,
        actor=actor,
        organization=organization,
        target_type=target_type,
        target_id=target_id,
        ip_address=ip_address,
        user_agent=user_agent[:255],
        request_id=(request_id or get_current_request_id())[:128],
        metadata=redact_mapping(metadata or {}),
    )
