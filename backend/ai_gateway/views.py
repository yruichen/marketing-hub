from django.db.models import Q
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.response import Response
from rest_framework.views import APIView

from ai_gateway.services import AGNES_DEFAULT_BASE_URL, AGNES_DEFAULT_IMAGE_MODEL, AGNES_DEFAULT_MODEL
from api.audit import record_audit_log
from api.models import AIConfiguration
from api.permissions import CanManageAIConfiguration, resolve_staff_user_from_request
from api.scope import get_scope
from api.serializers import AIConfigurationSerializer


def looks_like_masked_api_key(value: str) -> bool:
    cleaned = (value or '').strip()
    if not cleaned:
        return False
    if cleaned.startswith('...') or cleaned.startswith('***'):
        return True
    return '...' in cleaned


def with_csrf_token(response: Response, request) -> Response:
    response['X-CSRFToken'] = get_token(request)
    return response


def normalize_config_scope(provider: str, config_scope: str) -> str:
    allowed = {'all', 'text', 'image', 'audio'}
    scope = config_scope if config_scope in allowed else 'all'
    if provider == 'anthropic':
        return 'text'
    if provider == 'mock':
        return 'all'
    if scope == 'image' and provider not in {'agnes', 'mock'}:
        return 'text'
    if scope == 'audio' and provider not in {'mock', 'openai'}:
        return 'text'
    return scope


class AIConfigView(APIView):
    permission_classes = [CanManageAIConfiguration]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        _, org, _, _ = get_scope(request)
        configs = AIConfiguration.objects.filter(Q(organization__isnull=True) | Q(organization=org))
        return with_csrf_token(
            Response(AIConfigurationSerializer(configs.order_by('-is_active', '-updated_at'), many=True).data),
            request,
        )

    def post(self, request):
        actor = resolve_staff_user_from_request(request)
        _, org, _, _ = get_scope(request)
        provider = request.data.get('provider', 'mock')
        api_key = request.data.get('api_key', '').strip()
        base_url = request.data.get('base_url', '').strip()
        model_name = request.data.get('model_name', '').strip()
        image_model_name = request.data.get('image_model_name', '').strip()
        config_scope = normalize_config_scope(provider, request.data.get('config_scope', 'all'))
        billing_mode = request.data.get('billing_mode', 'platform')
        billing_mode = billing_mode if billing_mode in {'platform', 'byok'} else 'platform'
        organization = org if billing_mode == 'byok' else None

        if provider == 'agnes':
            base_url = base_url or AGNES_DEFAULT_BASE_URL
            if config_scope in {'text', 'all'} and not model_name:
                model_name = AGNES_DEFAULT_MODEL
            if config_scope in {'image', 'all'} and not image_model_name:
                image_model_name = AGNES_DEFAULT_IMAGE_MODEL

        config, _ = AIConfiguration.objects.update_or_create(
            provider=provider,
            organization=organization,
            config_scope=config_scope,
            defaults={
                'base_url': base_url,
                'model_name': model_name,
                'image_model_name': image_model_name,
                'billing_mode': billing_mode,
                'is_active': True,
            },
        )
        if api_key and not looks_like_masked_api_key(api_key):
            config.api_key = api_key
            config.save(update_fields=['api_key', 'updated_at'])
        AIConfiguration.objects.filter(
            organization=organization,
            config_scope=config_scope,
        ).exclude(id=config.id).update(is_active=False)

        record_audit_log(
            action='key_change',
            actor=actor,
            organization=org,
            target_type='ai_configuration',
            target_id=str(config.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={
                'provider': provider,
                'billing_mode': billing_mode,
                'model_name': model_name,
                'image_model_name': image_model_name,
                'config_scope': config_scope,
            },
        )

        return with_csrf_token(
            Response({
                'message': f'Successfully activated configuration for {config.get_provider_display()}',
                'config': AIConfigurationSerializer(config).data,
            }),
            request,
        )
