from __future__ import annotations

from django.conf import settings
from django.core.checks import Error, Tags, register
from django.db import OperationalError, ProgrammingError


@register(Tags.security, deploy=True)
def production_security_settings_check(app_configs, **kwargs):
    if settings.DEBUG:
        return []

    errors = []
    dangerous_flags = [
        ('ALLOW_UNAUTHENTICATED_API', 'ALLOW_UNAUTHENTICATED_API cannot be true when DEBUG=False.'),
        ('MARKETING_HUB_BOOTSTRAP_DEMO', 'MARKETING_HUB_BOOTSTRAP_DEMO cannot be true when DEBUG=False.'),
        ('AI_ALLOW_MOCK_FALLBACK', 'AI_ALLOW_MOCK_FALLBACK cannot be true when DEBUG=False.'),
        ('CORS_ALLOW_ALL_ORIGINS', 'CORS_ALLOW_ALL_ORIGINS cannot be true when DEBUG=False.'),
    ]
    for setting_name, message in dangerous_flags:
        if getattr(settings, setting_name, False):
            errors.append(Error(message, id=f'api.E{len(errors) + 1:03d}'))

    if not settings.SESSION_COOKIE_SECURE:
        errors.append(Error('SESSION_COOKIE_SECURE must be true when DEBUG=False.', id='api.E010'))
    if not settings.CSRF_COOKIE_SECURE:
        errors.append(Error('CSRF_COOKIE_SECURE must be true when DEBUG=False.', id='api.E011'))
    if not getattr(settings, 'FIELD_ENCRYPTION_KEY', ''):
        errors.append(Error('FIELD_ENCRYPTION_KEY must be set when DEBUG=False.', id='api.E012'))

    try:
        from api.models import PolicyDocument

        active_types = set(
            PolicyDocument.objects.filter(is_active=True, policy_type__in=['terms', 'privacy']).values_list('policy_type', flat=True)
        )
        missing_types = {'terms', 'privacy'} - active_types
        if missing_types:
            errors.append(Error(f'Active legal policy documents are required when DEBUG=False: {", ".join(sorted(missing_types))}.', id='api.E020'))
    except (OperationalError, ProgrammingError):
        errors.append(Error('PolicyDocument table is unavailable; run migrations before production deploy.', id='api.E021'))

    return errors
