from __future__ import annotations

from django.conf import settings
from django.core.checks import Error, Tags, register


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

    return errors
