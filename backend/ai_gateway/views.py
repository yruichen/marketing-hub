from __future__ import annotations

import asyncio
import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db.models import Q
from django.http import StreamingHttpResponse
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from harness.adapters.django.assistant import LlmUpstreamError, build_assistant_agent
from harness.adapters.providers.constants import AGNES_DEFAULT_BASE_URL
from harness.adapters.tools import ToolContext
from api.audit import record_audit_log
from api.entitlements import can_use_feature, feature_denied_payload
from api.models import AIConfiguration, AssistantMessage, AssistantSession
from api.permissions import CanManageAIConfiguration, resolve_staff_user_from_request
from api.image_style_skills import list_image_style_skills
from api.scope import get_scope
from api.access import require_role
from api.redaction import redact_text
from api.throttles import ExpensiveEndpointThrottle
from api.serializers import (
    AIConfigurationSerializer,
    AssistantMessageSerializer,
    AssistantSessionSerializer,
)

logger = logging.getLogger(__name__)

PROVIDER_BASE_URLS = {
    'agnes': AGNES_DEFAULT_BASE_URL,
    'openai': 'https://api.openai.com/v1',
    'gemini': 'https://generativelanguage.googleapis.com/v1beta',
    'anthropic': 'https://api.anthropic.com/v1',
}


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
    allowed = {'all', 'text', 'image', 'audio', 'video'}
    scope = config_scope if config_scope in allowed else 'all'
    if provider == 'anthropic':
        return 'text'
    if scope == 'image' and provider not in {'agnes', 'local_proxy'}:
        return 'text'
    if scope == 'video' and provider not in {'agnes', 'local_proxy'}:
        return 'text'
    if scope == 'audio' and provider != 'local_proxy':
        return 'text'
    return scope


def _model_id(item) -> str:
    if isinstance(item, str):
        return item.strip()
    if not isinstance(item, dict):
        return ''
    raw = item.get('id') or item.get('name') or item.get('model') or ''
    value = str(raw).strip()
    if value.startswith('models/'):
        return value.split('/', 1)[1]
    return value


def _infer_capabilities(provider: str, model_id: str, item: dict | None = None) -> list[str]:
    if isinstance(item, dict):
        raw_capabilities = (
            item.get('capabilities')
            or item.get('supported_capabilities')
            or item.get('modalities')
            or item.get('supported_modalities')
            or []
        )
        if isinstance(raw_capabilities, str):
            raw_capabilities = [raw_capabilities]
        normalized = {str(value).lower() for value in raw_capabilities if str(value).strip()}
        inferred = []
        if normalized & {'text', 'chat', 'completion', 'completions', 'vision'}:
            inferred.append('text')
        if normalized & {'image', 'images', 'image_generation'}:
            inferred.append('image')
        if normalized & {'video', 'videos', 'video_generation'}:
            inferred.append('video')
        if normalized & {'audio', 'speech', 'transcription'}:
            inferred.append('audio')
        model_type = str(item.get('type') or '').lower()
        if model_type in {'text', 'image', 'video', 'audio'} and model_type not in inferred:
            inferred.append(model_type)
        if inferred:
            return inferred

    lowered = model_id.lower()
    methods = set(item.get('supportedGenerationMethods') or []) if isinstance(item, dict) else set()
    if provider == 'agnes':
        if 'video' in lowered:
            return ['video']
        if 'image' in lowered or 'img' in lowered:
            return ['image']
        return ['text']
    if provider == 'openai':
        if lowered.startswith(('dall-e', 'gpt-image')):
            return ['image']
        if 'tts' in lowered or 'transcribe' in lowered or 'whisper' in lowered:
            return ['audio']
        return ['text']
    if provider == 'gemini':
        if 'generateContent' in methods or 'streamGenerateContent' in methods:
            return ['text']
        return ['text']
    return ['text']


def _model_defaults_from_options(models: list[dict]) -> dict[str, str]:
    defaults = {'model_name': '', 'image_model_name': '', 'video_model_name': ''}
    field_by_capability = {
        'text': 'model_name',
        'image': 'image_model_name',
        'video': 'video_model_name',
    }
    for capability, field in field_by_capability.items():
        selected = next(
            (model for model in models if capability in model.get('capabilities', [])),
            None,
        )
        if selected:
            defaults[field] = selected.get('id', '')
    return defaults


def _provider_env_key(provider: str) -> str:
    return {
        'agnes': 'AGNES_API_KEY',
        'openai': 'OPENAI_API_KEY',
        'gemini': 'GEMINI_API_KEY',
        'anthropic': 'ANTHROPIC_API_KEY',
    }.get(provider, '')


def _request_json(url: str, *, headers: dict[str, str], timeout: int = 20) -> dict:
    req = urllib.request.Request(url, headers=headers, method='GET')
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode('utf-8'))


def _fetch_live_models(provider: str, *, api_key: str, base_url: str) -> list[dict]:
    if not api_key:
        raise ValueError('API key is required to fetch model list.')

    if provider in {'agnes', 'openai'}:
        url = f'{base_url.rstrip("/")}/models'
        body = _request_json(url, headers={'Authorization': f'Bearer {api_key}'})
        items = body.get('data') if isinstance(body, dict) else []
    elif provider == 'gemini':
        root = (base_url or PROVIDER_BASE_URLS['gemini']).rstrip('/')
        separator = '&' if '?' in root else '?'
        url = f'{root}/models{separator}{urllib.parse.urlencode({"key": api_key})}'
        body = _request_json(url, headers={})
        items = body.get('models') if isinstance(body, dict) else []
    elif provider == 'anthropic':
        root = (base_url or PROVIDER_BASE_URLS['anthropic']).rstrip('/')
        body = _request_json(
            f'{root}/models',
            headers={
                'x-api-key': api_key,
                'anthropic-version': '2023-06-01',
            },
        )
        items = body.get('data') if isinstance(body, dict) else []
    else:
        items = []

    models = []
    for item in items or []:
        model_id = _model_id(item)
        if not model_id:
            continue
        models.append({
            'id': model_id,
            'label': model_id,
            'capabilities': _infer_capabilities(provider, model_id, item if isinstance(item, dict) else None),
        })
    return models


class AIConfigView(APIView):
    permission_classes = [CanManageAIConfiguration]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        org = None
        if not (request.user.is_staff or request.user.is_superuser):
            user, org, _, _ = get_scope(request)
            require_role(user, org, 'admin')
        configs = AIConfiguration.objects.filter(organization__isnull=True)
        if org is not None:
            configs = AIConfiguration.objects.filter(Q(organization__isnull=True) | Q(organization=org))
        return with_csrf_token(
            Response(AIConfigurationSerializer(configs.order_by('-is_active', '-updated_at'), many=True).data),
            request,
        )

    def post(self, request):
        actor = resolve_staff_user_from_request(request)
        org = None
        if not (request.user.is_staff or request.user.is_superuser):
            user, org, _, _ = get_scope(request)
            require_role(user, org, 'admin')
            if not can_use_feature(user, org, 'ai_config_write'):
                return Response(
                    feature_denied_payload('ai_config_write', 'AI 配置需要 Pro。'),
                    status=status.HTTP_403_FORBIDDEN,
                )
        provider = request.data.get('provider', 'agnes')
        supported_providers = {choice[0] for choice in AIConfiguration.PROVIDER_CHOICES}
        if provider not in supported_providers:
            return Response(
                {'detail': f'Unsupported AI provider: {provider}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        api_key = request.data.get('api_key', '').strip()
        base_url = request.data.get('base_url', '').strip()
        model_name = request.data.get('model_name', '').strip()
        image_model_name = request.data.get('image_model_name', '').strip()
        video_model_name = request.data.get('video_model_name', '').strip()
        config_scope = normalize_config_scope(provider, request.data.get('config_scope', 'all'))
        billing_mode = request.data.get('billing_mode', 'platform')
        billing_mode = billing_mode if billing_mode in {'platform', 'byok'} else 'platform'
        if billing_mode == 'platform' and not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'detail': '平台密钥仅运维人员可配置，请使用「自有 API Key」保存组织密钥。'},
                status=status.HTTP_403_FORBIDDEN,
            )
        organization = org if billing_mode == 'byok' else None
        if billing_mode == 'byok' and organization is None:
            return Response(
                {'detail': 'BYOK AI configuration requires an organization scope.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if provider == 'agnes':
            base_url = base_url or AGNES_DEFAULT_BASE_URL

        config, _ = AIConfiguration.objects.update_or_create(
            provider=provider,
            organization=organization,
            config_scope=config_scope,
            defaults={
                'base_url': base_url,
                'model_name': model_name,
                'image_model_name': image_model_name,
                'video_model_name': video_model_name,
                'billing_mode': billing_mode,
                'is_active': True,
            },
        )
        if api_key and not looks_like_masked_api_key(api_key):
            try:
                config.set_api_key(api_key)
            except ImproperlyConfigured:
                return Response(
                    {
                        'detail': (
                            '服务端未配置 FIELD_ENCRYPTION_KEY，无法加密保存 API Key。'
                            '请在 backend/.env 中设置后重启 backend。'
                        ),
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            config.save(update_fields=[
                'api_key',
                'api_key_encrypted',
                'api_key_fingerprint',
                'api_key_last4',
                'key_updated_at',
                'updated_at',
            ])
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
                'video_model_name': video_model_name,
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


class AIConfigModelsView(APIView):
    permission_classes = [CanManageAIConfiguration]
    throttle_classes = [ExpensiveEndpointThrottle]

    def post(self, request):
        org = None
        if not (request.user.is_staff or request.user.is_superuser):
            user, org, _, _ = get_scope(request)
            require_role(user, org, 'admin')
            if not can_use_feature(user, org, 'ai_config_write'):
                return Response(
                    feature_denied_payload('ai_config_write', '获取外部模型列表需要 Pro。'),
                    status=status.HTTP_403_FORBIDDEN,
                )
        provider = (request.data.get('provider') or 'agnes').strip()
        if provider not in PROVIDER_BASE_URLS:
            return Response(
                {'detail': f'Unsupported provider: {provider}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        billing_mode = request.data.get('billing_mode', 'platform')
        if billing_mode == 'platform' and not (request.user.is_staff or request.user.is_superuser):
            return Response(
                {'detail': '平台密钥仅运维人员可配置，请使用「自有 API Key」保存组织密钥。'},
                status=status.HTTP_403_FORBIDDEN,
            )
        organization = org if billing_mode == 'byok' else None
        config_scope = normalize_config_scope(provider, request.data.get('config_scope', 'all'))
        base_url = (request.data.get('base_url') or '').strip()
        api_key = request.data.get('api_key', '').strip()

        if looks_like_masked_api_key(api_key):
            api_key = ''

        saved_config = AIConfiguration.objects.filter(
            provider=provider,
            organization=organization,
            config_scope=config_scope,
        ).first() or AIConfiguration.objects.filter(
            provider=provider,
            organization=organization,
            is_active=True,
        ).order_by('-updated_at').first()

        if not api_key and saved_config:
            api_key = saved_config.get_api_key()
        if not base_url and saved_config:
            base_url = saved_config.base_url
        base_url = base_url or PROVIDER_BASE_URLS[provider]
        if not api_key:
            env_key = _provider_env_key(provider)
            api_key = os.getenv(env_key, '').strip() if env_key else ''

        try:
            models = _fetch_live_models(provider, api_key=api_key, base_url=base_url)
        except (ValueError, urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            detail = redact_text(str(exc))[:240]
            if isinstance(exc, urllib.error.HTTPError):
                detail = redact_text(exc.read().decode('utf-8', errors='replace'))[:240] or detail
                status_code = exc.code
            else:
                status_code = status.HTTP_400_BAD_REQUEST if isinstance(exc, ValueError) else status.HTTP_502_BAD_GATEWAY
            logger.info('Model fetch failed for provider=%s: %s', provider, detail)
            return with_csrf_token(
                Response({'detail': detail}, status=status_code),
                request,
            )

        if not models:
            detail = 'Provider returned an empty model list.'
            logger.info('Model fetch failed for provider=%s: %s', provider, detail)
            return with_csrf_token(
                Response({'detail': detail}, status=status.HTTP_502_BAD_GATEWAY),
                request,
            )

        return with_csrf_token(
            Response({
                'provider': provider,
                'base_url': base_url,
                'source': 'live',
                'models': models,
                'defaults': _model_defaults_from_options(models),
            }),
            request,
        )


# ================================================================
# Global Assistant views
# ================================================================


def _sse_format(payload: dict) -> str:
    """Wrap a dict as a single SSE data line."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _iter_async_gen_sync(async_gen):
    """
    Drive an async generator to completion and yield each resolved
    value synchronously. asgiref's `async_to_sync` only handles
    awaitables; this is the missing piece for async generators.
    """
    loop = asyncio.new_event_loop()
    try:
        while True:
            try:
                yield loop.run_until_complete(async_gen.__anext__())
            except StopAsyncIteration:
                break
    finally:
        loop.close()


class AssistantChatView(APIView):
    """
    POST /assistant/chat

    Body: { session_id?: int, message: str, page_context?: {tab, projectId, ...} }
    Response: text/event-stream.

    Events (one JSON object per `data:` line):
        {type: 'status',    status_text: str}
        {type: 'text',      delta: str}
        {type: 'tool_call',  name, args}
        {type: 'tool_result',name, result}
        {type: 'done',       usage, session_id}
        {type: 'error',      error, status?}
    """

    # SSE is a long-lived single request; counting it against the
    # default per-view UserRateThrottle bucket made the panel hit 429
    # the moment React re-fired the effect twice in strict mode. The
    # underlying LLM provider has its own quota anyway.
    throttle_classes: list = []
    permission_classes = [IsAuthenticated]

    def post(self, request):
        username, org, _, _ = get_scope(request)
        data = request.data or {}
        user_message = (data.get('message') or '').strip()
        if not user_message:
            return Response(
                {'detail': 'message 不能为空'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        page_context = data.get('page_context') or {}
        session_id = data.get('session_id')

        if session_id:
            session = AssistantSession.objects.filter(
                pk=session_id, organization=org
            ).first()
            if session is None:
                return Response(
                    {'detail': f'session_id={session_id} 不存在'},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            session = AssistantSession.objects.create(
                organization=org,
                user=request.user if request.user.is_authenticated else None,
                title=user_message[:30] or '新对话',
                context_snapshot=page_context,
            )

        # Persist user message immediately.
        AssistantMessage.objects.create(
            session=session, role='user', content=user_message,
        )

        # Compose messages for the agent.
        history = list(
            session.messages.order_by('created_at').values(
                'role', 'content', 'tool_calls', 'tool_name',
            )
        )
        # Resolve a real LLM from AIConfiguration. Missing configuration is a
        # recoverable onboarding state, not a reason to fabricate output.
        try:
            agent = build_assistant_agent(org)
        except RuntimeError:
            logger.info(
                'Assistant provider is unavailable for organization=%s',
                org.pk,
            )
            return Response(
                {
                    'detail': 'The assistant provider is unavailable.',
                    'code': 'AI_PROVIDER_UNAVAILABLE',
                    'action': 'Open AI Settings and configure an active text provider.',
                },
                status=status.HTTP_409_CONFLICT,
            )
        ctx = ToolContext(organization=org, user=request.user, session_id=session.id)
        messages = agent.build_messages(
            history=history,
            page_context=page_context,
            user_message=user_message,
            output_locale=str(request.data.get('output_locale') or 'zh-CN'),
        )

        def event_stream():
            assistant_text_chunks: list[str] = []
            tool_calls_log: list[dict] = []
            try:
                # Drive the agent's async generator step-by-step inside
                # a sync loop so Django's StreamingHttpResponse can yield
                # each event as it's produced.
                gen = agent.run_streaming(messages=messages, ctx=ctx)
                for step in _iter_async_gen_sync(gen):
                    if step.type == 'text':
                        assistant_text_chunks.append(step.delta)
                    elif step.type == 'tool_call':
                        tool_calls_log.append({'name': step.name, 'args': step.args})
                    elif step.type == 'tool_result':
                        if tool_calls_log:
                            tool_calls_log[-1]['result'] = step.result
                    payload = {
                        'type': step.type,
                        'delta': step.delta,
                        'name': step.name,
                        'args': step.args,
                        'result': step.result,
                        'error': step.error,
                        'status_text': step.status_text,
                        'status_code': step.status_code,
                        'finish_reason': step.finish_reason,
                    }
                    # Surface upstream LLM status (e.g. 429) so the UI
                    # can show a specific message instead of "unknown".
                    if step.type == 'error' and getattr(step, 'status', 0):
                        payload['status'] = step.status
                    yield _sse_format(payload)
                    if step.type == 'done':
                        # Persist the assistant turn atomically.
                        AssistantMessage.objects.create(
                            session=session,
                            role='assistant',
                            content=''.join(assistant_text_chunks),
                            tool_calls=tool_calls_log,
                            prompt_tokens=step.usage.get('prompt_tokens', 0),
                            completion_tokens=step.usage.get('completion_tokens', 0),
                        )
                        session.save(update_fields=['updated_at'])
                        yield _sse_format({
                            'type': 'done',
                            'session_id': session.id,
                        })
                        break
            except Exception as exc:
                logger.exception('Assistant stream failed')
                status_code = getattr(exc, 'status', 0)
                yield _sse_format({
                    'type': 'error',
                    'error': redact_text(str(exc)),
                    **({'status': status_code} if status_code else {}),
                })

        response = StreamingHttpResponse(
            event_stream(), content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response


class AssistantSessionListView(APIView):
    """GET /assistant/sessions  (list) / POST /assistant/sessions  (create)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _, org, _, _ = get_scope(request)
        sessions = AssistantSession.objects.filter(
            organization=org, is_archived=False,
        ).order_by('-updated_at')[:50]
        return Response({
            'sessions': AssistantSessionSerializer(sessions, many=True).data,
        })

    def post(self, request):
        _, org, _, _ = get_scope(request)
        title = (request.data.get('title') or '新对话').strip()[:200]
        session = AssistantSession.objects.create(
            organization=org,
            user=request.user if request.user.is_authenticated else None,
            title=title,
        )
        return Response(
            AssistantSessionSerializer(session).data,
            status=status.HTTP_201_CREATED,
        )


class AssistantSessionDetailView(APIView):
    """PATCH/DELETE /assistant/sessions/<pk>."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        _, org, _, _ = get_scope(request)
        session = AssistantSession.objects.filter(pk=pk, organization=org).first()
        if session is None:
            return Response({'detail': 'session 不存在'}, status=status.HTTP_404_NOT_FOUND)
        for field in ('title', 'is_archived'):
            if field in request.data:
                setattr(session, field, request.data[field])
        session.save()
        return Response(AssistantSessionSerializer(session).data)

    def delete(self, request, pk):
        _, org, _, _ = get_scope(request)
        session = AssistantSession.objects.filter(pk=pk, organization=org).first()
        if session is None:
            return Response({'detail': 'session 不存在'}, status=status.HTTP_404_NOT_FOUND)
        session.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssistantSessionMessagesView(APIView):
    """GET /assistant/sessions/<pk>/messages — full history."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        _, org, _, _ = get_scope(request)
        session = AssistantSession.objects.filter(pk=pk, organization=org).first()
        if session is None:
            return Response({'detail': 'session 不存在'}, status=status.HTTP_404_NOT_FOUND)
        messages = session.messages.order_by('created_at')
        return Response({
            'session': AssistantSessionSerializer(session).data,
            'messages': AssistantMessageSerializer(messages, many=True).data,
        })


class ImageStyleSkillsView(APIView):
    """GET /ai/image-style-skills/ — 图片风格 Skill 列表（前后端统一数据源）"""

    def get(self, request):
        return Response({'skills': list_image_style_skills()})
