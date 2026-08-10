from django.apps import AppConfig
from django.conf import settings
from django.db.models.signals import post_migrate


def sync_provider_config_from_environment(sender, **kwargs):
    import os

    from harness.adapters.providers.constants import AGNES_DEFAULT_BASE_URL
    from api.models import AIConfiguration

    agnes_key = os.getenv('AGNES_API_KEY', '').strip()
    if agnes_key:
        auto_activate = os.getenv('AGNES_AUTO_ACTIVATE', 'true' if settings.DEBUG else 'false').lower() == 'true'
        config, _ = AIConfiguration.objects.update_or_create(
            provider='agnes',
            organization=None,
            defaults={
                'base_url': os.getenv('AGNES_BASE_URL', AGNES_DEFAULT_BASE_URL).strip(),
                'model_name': os.getenv('AGNES_MODEL', '').strip(),
                'billing_mode': 'platform',
                'is_active': auto_activate,
            },
        )
        config.set_api_key(agnes_key)
        config.save(update_fields=[
            'api_key',
            'api_key_encrypted',
            'api_key_fingerprint',
            'api_key_last4',
            'key_updated_at',
            'updated_at',
        ])
        if auto_activate:
            AIConfiguration.objects.exclude(id=config.id).update(is_active=False)
        print('--- Agnes AI configuration synced from environment. ---')

class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        from api import checks  # noqa: F401

        post_migrate.connect(sync_provider_config_from_environment, sender=self)
