from django.apps import AppConfig
from django.conf import settings
from django.db.models.signals import post_migrate


def create_demo_user_and_config(sender, **kwargs):
    import os

    from django.contrib.auth.models import User

    from ai_gateway.services import AGNES_DEFAULT_BASE_URL
    from api.models import AIConfiguration, UserProfile
    from api.service_modules.workspace import ensure_demo_workspace

    # Local/dev bootstrap creates separate admin and demo identities.
    if settings.MARKETING_HUB_BOOTSTRAP_DEMO:
        admin_username = settings.MARKETING_HUB_ADMIN_USERNAME
        demo_username = settings.MARKETING_HUB_DEMO_USERNAME
        if not User.objects.filter(username=admin_username).exists():
            User.objects.create_superuser(
                admin_username,
                f'{admin_username.lower()}@marketinghub.local',
                settings.MARKETING_HUB_ADMIN_PASSWORD,
            )
            print(f"--- Admin Superuser '{admin_username}' created. ---")
        demo_user, created = User.objects.get_or_create(
            username=demo_username,
            defaults={
                'email': f'{demo_username.lower()}@marketinghub.local',
                'is_staff': False,
                'is_superuser': False,
            },
        )
        if created:
            demo_user.set_password(settings.MARKETING_HUB_DEMO_PASSWORD)
            demo_user.save(update_fields=['password'])
            print(f"--- Demo User '{demo_username}' created. ---")
        UserProfile.objects.update_or_create(
            user=demo_user,
            defaults={
                'email_verified': True,
                'status': 'active',
                'signup_source': 'local_demo',
            },
        )
        ensure_demo_workspace(demo_username)

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

        post_migrate.connect(create_demo_user_and_config, sender=self)
