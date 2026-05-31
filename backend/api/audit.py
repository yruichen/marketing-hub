from __future__ import annotations

from typing import Any

from django.contrib.auth.models import User

from api.models import AuditLog, Organization


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
) -> AuditLog:
    return AuditLog.objects.create(
        action=action,
        actor=actor,
        organization=organization,
        target_type=target_type,
        target_id=target_id,
        ip_address=ip_address,
        user_agent=user_agent[:255],
        metadata=metadata or {},
    )

