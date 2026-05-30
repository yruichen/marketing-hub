from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import AIConfiguration


class AIConfigView(APIView):
    def get(self, request):
        configs = AIConfiguration.objects.all().order_by('-is_active')
        serialized = []
        for config in configs:
            masked_key = ''
            if config.api_key:
                masked_key = f"{config.api_key[:4]}...{config.api_key[-4:]}" if len(config.api_key) > 8 else '****'
            serialized.append({
                'id': config.id,
                'provider': config.provider,
                'provider_display': config.get_provider_display(),
                'api_key': masked_key,
                'base_url': config.base_url,
                'model_name': config.model_name,
                'billing_mode': config.billing_mode,
                'is_active': config.is_active,
            })
        return Response(serialized)

    def post(self, request):
        provider = request.data.get('provider', 'mock')
        api_key = request.data.get('api_key', '').strip()
        base_url = request.data.get('base_url', '').strip()
        model_name = request.data.get('model_name', '').strip()
        billing_mode = request.data.get('billing_mode', 'platform')

        config, _ = AIConfiguration.objects.get_or_create(provider=provider)
        if api_key and not api_key.startswith('...') and not api_key.startswith('***'):
            config.api_key = api_key
        config.base_url = base_url
        config.model_name = model_name
        config.billing_mode = billing_mode if billing_mode in {'platform', 'byok'} else 'platform'
        config.is_active = True
        config.save()
        AIConfiguration.objects.exclude(id=config.id).update(is_active=False)

        return Response({
            'message': f'Successfully activated configuration for {config.get_provider_display()}',
            'config': {
                'provider': config.provider,
                'model_name': config.model_name,
                'billing_mode': config.billing_mode,
                'is_active': config.is_active,
            },
        })

