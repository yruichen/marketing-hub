from django.apps import AppConfig
from django.db.models.signals import post_migrate


def create_demo_user_and_config(sender, **kwargs):
    import os

    from django.contrib.auth.models import User

    from ai_gateway.services import AGNES_DEFAULT_BASE_URL, AGNES_DEFAULT_MODEL
    from api.models import AIConfiguration

    # Create demo ROOT user
    if not User.objects.filter(username='ROOT').exists():
        User.objects.create_superuser('ROOT', 'root@marketinghub.local', '123')
        print("--- Demo Superuser 'ROOT' with password '123' created. ---")

    # Create Default AI Configuration if not exists
    if not AIConfiguration.objects.filter(provider='mock').exists():
        AIConfiguration.objects.create(
            provider='mock',
            api_key='',
            base_url='',
            model_name='gpt-mock-agent',
            billing_mode='platform',
            is_active=True,
        )
        print('--- Default Mock AI Configuration initialized. ---')

    agnes_key = os.getenv('AGNES_API_KEY', '').strip()
    if agnes_key:
        auto_activate = os.getenv('AGNES_AUTO_ACTIVATE', 'true').lower() == 'true'
        config, _ = AIConfiguration.objects.update_or_create(
            provider='agnes',
            organization=None,
            defaults={
                'api_key': agnes_key,
                'base_url': os.getenv('AGNES_BASE_URL', AGNES_DEFAULT_BASE_URL).strip(),
                'model_name': os.getenv('AGNES_MODEL', AGNES_DEFAULT_MODEL).strip(),
                'billing_mode': 'platform',
                'is_active': auto_activate,
            },
        )
        if auto_activate:
            AIConfiguration.objects.exclude(id=config.id).update(is_active=False)
        print('--- Agnes AI configuration synced from environment. ---')

class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        post_migrate.connect(create_demo_user_and_config, sender=self)
