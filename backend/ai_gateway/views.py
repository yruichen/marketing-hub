from __future__ import annotations

import asyncio
import json
import logging

from django.db.models import Q
from django.http import StreamingHttpResponse
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from ai_gateway.agent import LlmUpstreamError, build_assistant_agent
from ai_gateway.services import (
    AGNES_DEFAULT_BASE_URL,
    AGNES_DEFAULT_IMAGE_MODEL,
    AGNES_DEFAULT_MODEL,
    AGNES_DEFAULT_VIDEO_MODEL,
)
from ai_gateway.tools import ToolContext
from api.audit import record_audit_log
from api.models import AIConfiguration, AssistantMessage, AssistantSession
from api.permissions import CanManageAIConfiguration, resolve_staff_user_from_request
from api.image_style_skills import list_image_style_skills
from api.scope import get_scope
from api.serializers import (
    AIConfigurationSerializer,
    AssistantMessageSerializer,
    AssistantSessionSerializer,
)

logger = logging.getLogger(__name__)


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
    if provider == 'mock':
        return 'all'
    if scope == 'image' and provider not in {'agnes', 'mock'}:
        return 'text'
    if scope == 'video' and provider not in {'agnes', 'mock'}:
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
        video_model_name = request.data.get('video_model_name', '').strip()
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
            if config_scope in {'video', 'all'} and not video_model_name:
                video_model_name = AGNES_DEFAULT_VIDEO_MODEL

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
        # Resolve the LLM from AIConfiguration (text lane). The factory
        # falls back to mock when no key is configured, so this stays
        # usable in dev/tests.
        agent = build_assistant_agent(org)
        ctx = ToolContext(organization=org, user=request.user, session_id=session.id)
        messages = agent.build_messages(
            history=history,
            page_context=page_context,
            user_message=user_message,
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
                    'error': str(exc),
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
