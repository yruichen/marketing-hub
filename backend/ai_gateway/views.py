from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView

from api.audit import record_audit_log
from api.models import AIConfiguration
from api.permissions import CanManageOrganization
from api.scope import get_scope
from api.serializers import AIConfigurationSerializer


class AIConfigView(APIView):
    permission_classes = [CanManageOrganization]

    def get(self, request):
        _, org, _, _ = get_scope(request)
        configs = AIConfiguration.objects.filter(Q(organization__isnull=True) | Q(organization=org))
        return Response(AIConfigurationSerializer(configs.order_by('-is_active', '-updated_at'), many=True).data)

    def post(self, request):
        user, org, _, _ = get_scope(request)
        provider = request.data.get('provider', 'mock')
        api_key = request.data.get('api_key', '').strip()
        base_url = request.data.get('base_url', '').strip()
        model_name = request.data.get('model_name', '').strip()
        billing_mode = request.data.get('billing_mode', 'platform')
        billing_mode = billing_mode if billing_mode in {'platform', 'byok'} else 'platform'
        organization = org if billing_mode == 'byok' else None

        config, _ = AIConfiguration.objects.get_or_create(provider=provider, organization=organization)
        if api_key and not api_key.startswith('...') and not api_key.startswith('***'):
            config.api_key = api_key
        config.base_url = base_url
        config.model_name = model_name
        config.billing_mode = billing_mode
        config.is_active = True
        config.save()
        AIConfiguration.objects.filter(organization=organization).exclude(id=config.id).update(is_active=False)

        record_audit_log(
            action='key_change',
            actor=user,
            organization=org,
            target_type='ai_configuration',
            target_id=str(config.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'provider': provider, 'billing_mode': billing_mode, 'model_name': model_name},
        )

        return Response({
            'message': f'Successfully activated configuration for {config.get_provider_display()}',
            'config': AIConfigurationSerializer(config).data,
        })
