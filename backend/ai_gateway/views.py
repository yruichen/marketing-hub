from django.db.models import Q
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
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


# ================================================================
# Global Assistant views
# ================================================================


import json
import logging

from asgiref.sync import async_to_sync
from django.http import StreamingHttpResponse

from .agent import AssistantAgent
from .tools import ToolContext
from api.models import AssistantMessage, AssistantSession
from api.serializers import AssistantMessageSerializer, AssistantSessionSerializer
from api.scope import get_scope

logger = logging.getLogger(__name__)


def _sse_format(payload: dict) -> str:
    """Wrap a dict as a single SSE data line."""
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


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
        {type: 'error',      error}
    """

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
        agent = AssistantAgent()
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
                # async_to_sync wraps an async generator; for each event
                # we await it synchronously and yield to the SSE response.
                gen = agent.run_streaming(messages=messages, ctx=ctx)
                for step in async_to_sync_iter(gen):
                    if step.type == 'text':
                        assistant_text_chunks.append(step.delta)
                    elif step.type == 'tool_call':
                        tool_calls_log.append({'name': step.name, 'args': step.args})
                    elif step.type == 'tool_result':
                        if tool_calls_log:
                            tool_calls_log[-1]['result'] = step.result
                    yield _sse_format({
                        'type': step.type,
                        'delta': step.delta,
                        'name': step.name,
                        'args': step.args,
                        'result': step.result,
                        'error': step.error,
                    })
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
                yield _sse_format({'type': 'error', 'error': str(exc)})

        response = StreamingHttpResponse(
            event_stream(), content_type='text/event-stream',
        )
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response


def async_to_sync_iter(async_gen):
    """
    Helper: drive an async generator to completion, yielding each
    resolved value synchronously. Equivalent to `asgiref.sync.async_to_sync`
    but for generators.
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


import asyncio  # noqa: E402  (placed after other imports intentionally)


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
