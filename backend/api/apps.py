from django.apps import AppConfig
from django.db.models.signals import post_migrate

def create_demo_user_and_config(sender, **kwargs):
    from django.contrib.auth.models import User
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
            is_active=True
        )
        print("--- Default Mock AI Configuration initialized. ---")

class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'api'

    def ready(self):
        post_migrate.connect(create_demo_user_and_config, sender=self)
