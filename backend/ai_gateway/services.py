from __future__ import annotations

import http.client
import json
import os
import ssl
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db.models import Q

from ai_gateway.prompts import (
    AGNES_VIDEO_DEFAULT_FRAME_RATE,
    aspect_ratio_to_size,
    aspect_ratio_to_video_dimensions,
    build_audio_messages,
    build_brainstorm_messages,
    build_copy_messages,
    build_custom_agent_messages,
    build_image_generation_prompt,
    build_image_prompt_messages,
    build_review_messages,
    build_storyboard_messages,
    build_video_generation_prompt,
    extract_agnes_video_url,
    normalize_audio_result,
    normalize_brainstorm_result,
    normalize_copy_result,
    normalize_custom_agent_result,
    normalize_image_prompt_result,
    normalize_image_result,
    normalize_review_result,
    normalize_storyboard_result,
    normalize_video_result,
    snap_agnes_num_frames,
)
from api.models import AIConfiguration, Organization
from api.rbac import role_rank


AGNES_DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com/v1'
AGNES_DEFAULT_MODEL = 'agnes-2.0-flash'
AGNES_DEFAULT_IMAGE_MODEL = 'agnes-image-2.0-flash'
AGNES_DEFAULT_VIDEO_MODEL = 'agnes-video-v2.0'

CAPABILITY_REGISTRY = {
    'openai': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
    'agnes': {'text', 'vision', 'image', 'video', 'function_calling'},
    'anthropic': {'text', 'vision', 'function_calling'},
    'gemini': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
    'mock': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
    'local_proxy': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
}

MODEL_CAPABILITIES = {
    'gpt-4o-mini': {'provider': 'openai', 'capabilities': CAPABILITY_REGISTRY['openai']},
    'agnes-2.0-flash': {'provider': 'agnes', 'capabilities': CAPABILITY_REGISTRY['agnes']},
    'agnes-image-2.0-flash': {'provider': 'agnes', 'capabilities': CAPABILITY_REGISTRY['agnes']},
    'claude-3-5-sonnet': {'provider': 'anthropic', 'capabilities': CAPABILITY_REGISTRY['anthropic']},
    'gemini-2.0-flash': {'provider': 'gemini', 'capabilities': CAPABILITY_REGISTRY['gemini']},
    'mock': {'provider': 'mock', 'capabilities': CAPABILITY_REGISTRY['mock']},
}

PROMPT_REGISTRY = {
    'marketing.copy.system': {'version': '2026-06-12', 'template': '营销文案生成'},
    'marketing.storyboard.system': {'version': '2026-06-12', 'template': '短视频分镜策划'},
    'marketing.image.system': {'version': '2026-06-12', 'template': '营销配图生成'},
    'marketing.image_prompt.system': {'version': '2026-06-12', 'template': '文生图提示词工程'},
    'marketing.review.system': {'version': '2026-06-12', 'template': '内容合规审核'},
    'marketing.audio.system': {'version': '2026-06-12', 'template': '配音脚本优化'},
    'marketing.video.system': {'version': '2026-06-12', 'template': '营销视频生成'},
    'marketing.custom_agent.system': {'version': '2026-06-12', 'template': '自定义营销智能体'},
    'marketing.brainstorm.system': {'version': '2026-06-12', 'template': '工作流灵感风暴'},
}

JSON_RESPONSE_TASK_TYPES = frozenset({
    'copy', 'storyboard', 'custom_agent', 'brainstorm', 'image_prompt', 'review', 'audio',
})

SAFETY_BLOCKLIST = {'illegal', 'copyright infringement', 'weapon instruction'}


@dataclass(slots=True)
class GatewayResponse:
    payload: dict[str, Any]
    logs: list[str]
    provider: str
    model_name: str
    fallback_used: bool = False
    cost_usd: Decimal = Decimal('0')
    prompt_tokens: int = 0
    completion_tokens: int = 0


class RetryableGatewayError(RuntimeError):
    pass


class NonRetryableGatewayError(RuntimeError):
    pass


class SafetyPolicy:
    @staticmethod
    def validate(text: str) -> None:
        lowered = text.lower()
        for token in SAFETY_BLOCKLIST:
            if token in lowered:
                raise NonRetryableGatewayError(f'Prompt blocked by safety policy: {token}')


class CostCalculator:
    @staticmethod
    def calculate(provider: str, model_name: str, *, prompt_tokens: int, completion_tokens: int, media_seconds: int = 0) -> Decimal:
        total_tokens = prompt_tokens + completion_tokens
        token_rate = {
            'openai': Decimal('0.00002'),
            'agnes': Decimal('0.000015'),
            'anthropic': Decimal('0.000025'),
            'gemini': Decimal('0.000018'),
            'mock': Decimal('0.00001'),
            'local_proxy': Decimal('0.00001'),
        }.get(provider, Decimal('0.00002'))
        media_rate = Decimal(media_seconds) * Decimal('0.002')
        return (Decimal(total_tokens) * token_rate) + media_rate

    @staticmethod
    def calculate_image(provider: str, *, generated_images: int = 1) -> Decimal:
        per_image = {
            'agnes': Decimal('0.003'),
            'openai': Decimal('0.04'),
            'mock': Decimal('0.001'),
            'local_proxy': Decimal('0.001'),
        }.get(provider, Decimal('0.01'))
        return per_image * max(generated_images, 0)


IMAGE_RUNTIME_PROVIDERS = frozenset({'mock', 'agnes'})
VIDEO_RUNTIME_PROVIDERS = frozenset({'mock', 'agnes'})
TEXT_TASK_TYPES = frozenset({'copy', 'storyboard'})
IMAGE_TASK_TYPES = frozenset({'image'})
AUDIO_TASK_TYPES = frozenset({'audio'})
VIDEO_TASK_TYPES = frozenset({'video'})


def task_lane(task_type: str) -> str:
    if task_type in IMAGE_TASK_TYPES:
        return 'image'
    if task_type in AUDIO_TASK_TYPES:
        return 'audio'
    if task_type in VIDEO_TASK_TYPES:
        return 'video'
    return 'text'


def config_serves_lane(config: AIConfiguration, lane: str) -> bool:
    scope = getattr(config, 'config_scope', 'all') or 'all'
    if scope == 'all':
        return True
    return scope == lane


def config_lane_priority(config: AIConfiguration, lane: str) -> int:
    scope = getattr(config, 'config_scope', 'all') or 'all'
    if scope == lane:
        return 0
    if scope == 'all':
        return 1
    return 2


def provider_supports_task(provider: str, task_type: str) -> bool:
    if task_type in IMAGE_TASK_TYPES:
        return provider in IMAGE_RUNTIME_PROVIDERS
    if task_type in AUDIO_TASK_TYPES:
        return provider in {'mock', 'openai', 'local_proxy'}
    if task_type in VIDEO_TASK_TYPES:
        return provider in VIDEO_RUNTIME_PROVIDERS | {'local_proxy'}
    caps = CAPABILITY_REGISTRY.get(provider, CAPABILITY_REGISTRY['mock'])
    return 'text' in caps


class ModelPolicy:
    @staticmethod
    def select_configuration(*, organization: Organization | None, task_type: str, role: str | None = None) -> AIConfiguration | None:
        lane = task_lane(task_type)
        if organization is not None:
            candidates = AIConfiguration.objects.filter(
                is_active=True,
            ).filter(
                Q(organization=organization) | Q(organization__isnull=True)
            ).order_by('-updated_at')
        else:
            candidates = AIConfiguration.objects.filter(is_active=True, organization__isnull=True).order_by('-updated_at')

        candidates = list(candidates)
        candidates.sort(key=lambda item: (config_lane_priority(item, lane), -item.updated_at.timestamp()))

        for candidate in candidates:
            if not config_serves_lane(candidate, lane):
                continue
            if not provider_supports_task(candidate.provider, task_type):
                continue
            if task_type == 'audio' and role_rank(role) < role_rank('creator'):
                return None
            return candidate
        return None


class ProviderAdapter:
    provider_name = 'mock'

    def __init__(self, config: AIConfiguration | None = None):
        self._config = config

    def invoke(
        self,
        prompt: str,
        *,
        model_name: str,
        task_type: str,
        payload: dict[str, Any],
        messages: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError


class MockProviderAdapter(ProviderAdapter):
    provider_name = 'mock'

    def invoke(
        self,
        prompt: str,
        *,
        model_name: str,
        task_type: str,
        payload: dict[str, Any],
        messages: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        time.sleep(0.05)
        if task_type == 'copy':
            return normalize_copy_result(
                {
                    'title': f"✨ {payload.get('brand_name', 'Marketing Hub')} 真的绝了！",
                    'paragraphs': [
                        f"家人们！今天必须安利【{payload.get('brand_name', 'Marketing Hub')}】——{payload.get('product_description', 'AI 营销助手')}。",
                        '用过才知道，从选题到成稿一路顺畅，效率真的能打满。',
                        '姐妹们听我的，闭眼入不踩雷！',
                    ],
                    'tags': ['好物分享', '营销工具', payload.get('platform', 'Xiaohongshu'), '种草'],
                    'call_to_action': f"👉 立即体验 {payload.get('brand_name', 'Marketing Hub')}",
                },
                payload,
            )
        if task_type == 'image':
            return normalize_image_result(
                {
                    'image_url': 'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=800&q=80',
                    'generated_images': 1,
                },
                payload,
            )
        if task_type == 'storyboard':
            return normalize_storyboard_result({'scenes': []}, payload)
        if task_type == 'image_prompt':
            subject = str(payload.get('subject') or payload.get('upstream_text') or 'marketing visual')
            return normalize_image_prompt_result(
                {
                    'prompt': f'{subject}, professional marketing photography, high detail',
                    'prompt_zh': subject,
                    'negative_prompt': payload.get('negative_prompt', ''),
                },
                payload,
            )
        if task_type == 'review':
            return normalize_review_result(
                {
                    'passed': True,
                    'brand_consistency_score': 85,
                    'sensitive_word_issues': [],
                    'channel_rule_issues': [],
                    'summary': '（演示）内容审核通过，未发现明显违规。',
                    'revised_suggestions': [],
                },
                payload,
            )
        if task_type == 'audio':
            return normalize_audio_result({}, payload)
        if task_type == 'video':
            return normalize_video_result({}, payload)
        if task_type == 'brainstorm':
            idea = str(payload.get('idea', 'Marketing campaign'))
            return normalize_brainstorm_result(
                {
                    'workflow_name': f'Campaign: {idea[:40]}',
                    'brand_context': {
                        'brand_name': idea.split()[0] if idea.split() else 'Brand',
                        'audience': 'Digital creators and marketers',
                        'tone': 'Professional yet approachable',
                        'selling_points': idea[:100],
                        'visual_style': 'minimalist',
                        'campaign_goal': f'Execute marketing idea: {idea[:60]}',
                    },
                    'nodes': [
                        {
                            'id': 'context-1', 'type': 'context', 'label': 'Brand Context',
                            'x': 80, 'y': 120, 'width': 260, 'height': 166,
                            'config': {'summary': f'Campaign brief: {idea[:100]}'},
                        },
                        {
                            'id': 'copy-1', 'type': 'copy', 'label': 'Marketing Copy',
                            'x': 400, 'y': 120, 'width': 260, 'height': 166,
                            'config': {'tone': 'Professional yet approachable', 'platform': 'Xiaohongshu'},
                        },
                        {
                            'id': 'image-1', 'type': 'image', 'label': 'Campaign Visual',
                            'x': 720, 'y': 120, 'width': 260, 'height': 166,
                            'config': {'style_skill': 'minimal_flat', 'aspect_ratio': '1:1'},
                        },
                    ],
                    'edges': [
                        {'id': 'edge-context-copy', 'source': 'context-1', 'target': 'copy-1'},
                        {'id': 'edge-copy-image', 'source': 'copy-1', 'target': 'image-1'},
                    ],
                    'summary': f'Generated a 3-step marketing workflow for: {idea[:80]}',
                },
                idea,
            )
        return {'response': prompt, 'metadata': {'model_name': model_name, 'task_type': task_type}}


@dataclass(slots=True)
class ChatCompletionResult:
    payload: dict[str, Any]
    prompt_tokens: int = 0
    completion_tokens: int = 0


class ChatCompletionsAdapter(ProviderAdapter):
    default_base_url = 'https://api.openai.com/v1'
    default_model = 'gpt-4o-mini'
    request_timeout = 60

    def __init__(self, config: AIConfiguration):
        self._config = config

    def _chat_completions_url(self) -> str:
        base = (self._config.base_url or self.default_base_url).rstrip('/')
        if base.endswith('/chat/completions'):
            return base
        return f'{base}/chat/completions'

    def invoke(
        self,
        prompt: str,
        *,
        model_name: str,
        task_type: str,
        payload: dict[str, Any],
        messages: list[dict[str, str]] | None = None,
    ) -> ChatCompletionResult:
        chat_messages = messages or [
            {'role': 'system', 'content': '你是 Marketing-Hub 助手，只输出合法 JSON。'},
            {'role': 'user', 'content': prompt},
        ]
        request_payload: dict[str, Any] = {
            'model': model_name or self.default_model,
            'messages': chat_messages,
            'temperature': 0.7,
            'max_tokens': 2048,
        }
        if task_type in JSON_RESPONSE_TASK_TYPES:
            request_payload['response_format'] = {'type': 'json_object'}

        req = urllib.request.Request(
            self._chat_completions_url(),
            data=json.dumps(request_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {self._config.api_key}'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=self.request_timeout) as response:
            body = json.loads(response.read().decode('utf-8'))
            content = body['choices'][0]['message']['content']
            usage = body.get('usage') or {}
            parsed = json.loads(content) if isinstance(content, str) else content
            return ChatCompletionResult(
                payload=parsed if isinstance(parsed, dict) else {'response': parsed},
                prompt_tokens=int(usage.get('prompt_tokens') or 0),
                completion_tokens=int(usage.get('completion_tokens') or 0),
            )


class OpenAIAdapter(ChatCompletionsAdapter):
    provider_name = 'openai'


class AgnesAdapter(ChatCompletionsAdapter):
    provider_name = 'agnes'
    default_base_url = AGNES_DEFAULT_BASE_URL
    default_model = AGNES_DEFAULT_MODEL


class AgnesImageAdapter(ProviderAdapter):
    provider_name = 'agnes'
    default_base_url = AGNES_DEFAULT_BASE_URL
    default_model = AGNES_DEFAULT_IMAGE_MODEL
    request_timeout = 180

    def __init__(self, config: AIConfiguration):
        self._config = config

    def _images_generations_url(self) -> str:
        base = (self._config.base_url or self.default_base_url).rstrip('/')
        if base.endswith('/images/generations'):
            return base
        return f'{base}/images/generations'

    def invoke(
        self,
        prompt: str,
        *,
        model_name: str,
        task_type: str,
        payload: dict[str, Any],
        messages: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        image_prompt = build_image_generation_prompt(payload)
        size = aspect_ratio_to_size(str(payload.get('aspect_ratio') or payload.get('aspectRatio') or '1:1'))
        request_payload: dict[str, Any] = {
            'model': model_name or self.default_model,
            'prompt': image_prompt,
            'size': size,
            'extra_body': {
                'response_format': 'url',
            },
        }

        reference_images = payload.get('reference_images') or payload.get('input_images') or payload.get('images') or []
        if isinstance(reference_images, str):
            reference_images = [reference_images]
        if isinstance(reference_images, list):
            reference_images = [str(item).strip() for item in reference_images if str(item).strip()]
        if reference_images:
            request_payload['tags'] = ['img2img']
            request_payload['extra_body']['image'] = reference_images

        seed = payload.get('seed')
        if seed is not None and str(seed).strip():
            request_payload['seed'] = int(seed)

        req = urllib.request.Request(
            self._images_generations_url(),
            data=json.dumps(request_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {self._config.api_key}'},
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=self.request_timeout) as response:
                body = json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode('utf-8', errors='replace')
            raise RetryableGatewayError(f'Agnes image API error {exc.code}: {detail}') from exc

        data = body.get('data') or []
        if not data or not isinstance(data[0], dict) or not data[0].get('url'):
            raise RetryableGatewayError('Agnes image API returned no image URL')

        usage = body.get('usage') or {}
        generated_images = int(usage.get('generated_images') or len(data) or 1)
        return normalize_image_result(
            {
                'image_url': data[0]['url'],
                'revised_prompt': image_prompt,
                'generated_images': generated_images,
            },
            payload,
        )


class AgnesVideoAdapter(ProviderAdapter):
    provider_name = 'agnes'
    default_base_url = AGNES_DEFAULT_BASE_URL
    default_model = AGNES_DEFAULT_VIDEO_MODEL
    request_timeout = 90
    poll_interval = 4
    max_wait = 1800
    max_create_retries = 8
    max_request_retries = 6

    def __init__(self, config: AIConfiguration):
        self._config = config

    def _videos_root(self) -> str:
        base = (self._config.base_url or self.default_base_url).rstrip('/')
        if base.endswith('/videos'):
            return base
        return f'{base}/videos'

    def _auth_headers(self) -> dict[str, str]:
        return {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self._config.api_key}',
        }

    def _ssl_context(self) -> ssl.SSLContext:
        return ssl.create_default_context()

    def _request_json(
        self,
        url: str,
        *,
        method: str = 'GET',
        payload: dict[str, Any] | None = None,
        timeout: int | None = None,
    ) -> dict[str, Any]:
        data = json.dumps(payload).encode('utf-8') if payload is not None else None
        req = urllib.request.Request(url, data=data, headers=self._auth_headers(), method=method)
        opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=self._ssl_context()),
        )
        last_error: Exception | None = None
        for attempt in range(self.max_request_retries):
            try:
                with opener.open(req, timeout=timeout or self.request_timeout) as response:
                    body = json.loads(response.read().decode('utf-8'))
                if not isinstance(body, dict):
                    raise RetryableGatewayError('Agnes video API returned non-object JSON')
                return body
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode('utf-8', errors='replace')
                if exc.code in {429, 503} and attempt + 1 < self.max_request_retries:
                    time.sleep(min(2 ** attempt, 8))
                    continue
                raise RetryableGatewayError(f'Agnes video API error {exc.code}: {detail}') from exc
            except (urllib.error.URLError, TimeoutError, ConnectionResetError, http.client.RemoteDisconnected, OSError) as exc:
                last_error = exc
                if attempt + 1 >= self.max_request_retries:
                    break
                time.sleep(min(2 ** attempt, 8))
        raise RetryableGatewayError(
            f'Agnes video API connection error after {self.max_request_retries} attempts: {last_error}'
        ) from last_error

    def _create_video_task(self, request_payload: dict[str, Any]) -> str:
        last_error: Exception | None = None
        for attempt in range(self.max_create_retries):
            try:
                body = self._request_json(self._videos_root(), method='POST', payload=request_payload)
                task_id = str(body.get('id') or body.get('task_id') or '').strip()
                if task_id:
                    return task_id
                raise RetryableGatewayError(f'Agnes video API returned no task id: {body}')
            except RetryableGatewayError as exc:
                last_error = exc
                if attempt + 1 >= self.max_create_retries:
                    break
                time.sleep(min(4 * (attempt + 1), 20))
        raise RetryableGatewayError(str(last_error or 'Agnes video task creation failed'))

    def _poll_video_task(self, task_id: str) -> dict[str, Any]:
        deadline = time.time() + self.max_wait
        last_body: dict[str, Any] = {}
        while time.time() < deadline:
            try:
                last_body = self._request_json(f'{self._videos_root()}/{task_id}')
            except RetryableGatewayError:
                time.sleep(self.poll_interval)
                continue

            status = str(last_body.get('status') or '').lower()
            if status in {'completed', 'succeeded', 'success'}:
                return last_body
            if status in {'failed', 'error', 'cancelled', 'canceled'}:
                message = str(last_body.get('error') or last_body.get('message') or last_body.get('error_message') or 'Agnes video task failed')
                raise RetryableGatewayError(message)
            time.sleep(self.poll_interval)

        raise RetryableGatewayError(f'Agnes video task timed out after {self.max_wait}s (last status={last_body.get("status")})')

    def invoke(
        self,
        prompt: str,
        *,
        model_name: str,
        task_type: str,
        payload: dict[str, Any],
        messages: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        video_prompt = build_video_generation_prompt(payload)
        aspect_ratio = str(payload.get('aspect_ratio') or payload.get('aspectRatio') or '9:16').strip()
        width, height = aspect_ratio_to_video_dimensions(aspect_ratio)
        frame_rate = int(payload.get('frame_rate') or AGNES_VIDEO_DEFAULT_FRAME_RATE)
        try:
            target_seconds = int(payload.get('duration') or payload.get('duration_cap') or 5)
        except (TypeError, ValueError):
            target_seconds = 5
        num_frames = int(payload.get('num_frames') or snap_agnes_num_frames(target_seconds, frame_rate))

        selected_model = (model_name or str(payload.get('model') or '').strip() or self.default_model)
        if selected_model in {'', 'video-default', 'default'}:
            selected_model = self.default_model

        request_payload: dict[str, Any] = {
            'model': selected_model,
            'prompt': video_prompt,
            'width': width,
            'height': height,
            'num_frames': num_frames,
            'frame_rate': frame_rate,
        }

        reference_image = (
            payload.get('image')
            or payload.get('image_url')
            or payload.get('reference_image')
            or payload.get('input_image')
        )
        if isinstance(reference_image, str) and reference_image.strip().startswith('http'):
            request_payload['image'] = reference_image.strip()

        task_id = self._create_video_task(request_payload)
        completed = self._poll_video_task(task_id)
        video_url = extract_agnes_video_url(completed)
        if not video_url:
            raise RetryableGatewayError('Agnes video API completed without a downloadable video URL')

        return normalize_video_result(
            {
                **completed,
                'id': task_id,
                'video_url': video_url,
                'num_frames': num_frames,
                'frame_rate': frame_rate,
                'model': selected_model,
                'aspect_ratio': aspect_ratio,
                'video_topic': payload.get('video_topic'),
            },
            payload,
        )


class GeminiAdapter(ProviderAdapter):
    provider_name = 'gemini'

    def __init__(self, config: AIConfiguration):
        self._config = config

    def invoke(
        self,
        prompt: str,
        *,
        model_name: str,
        task_type: str,
        payload: dict[str, Any],
        messages: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        model = model_name or 'gemini-2.0-flash'
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self._config.api_key}'
        if self._config.base_url:
            url = f'{self._config.base_url.rstrip("/")}/v1beta/models/{model}:generateContent?key={self._config.api_key}'
        request_payload = {'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'responseMimeType': 'application/json'}}
        req = urllib.request.Request(
            url,
            data=json.dumps(request_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            body = json.loads(response.read().decode('utf-8'))
            return json.loads(body['candidates'][0]['content']['parts'][0]['text'])


class AnthropicAdapter(ProviderAdapter):
    provider_name = 'anthropic'

    def __init__(self, config: AIConfiguration):
        self._config = config

    def invoke(
        self,
        prompt: str,
        *,
        model_name: str,
        task_type: str,
        payload: dict[str, Any],
        messages: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        url = 'https://api.anthropic.com/v1/messages'
        if self._config.base_url:
            url = f'{self._config.base_url.rstrip("/")}/v1/messages'
        request_payload = {
            'model': model_name or 'claude-3-5-sonnet',
            'max_tokens': 1024,
            'messages': [{'role': 'user', 'content': prompt}],
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(request_payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'x-api-key': self._config.api_key,
                'anthropic-version': '2023-06-01',
            },
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            body = json.loads(response.read().decode('utf-8'))
            return json.loads(body['content'][0]['text'])


class LocalProxyAdapter(ProviderAdapter):
    provider_name = 'local_proxy'

    def __init__(self, config: AIConfiguration):
        self._config = config

    def invoke(
        self,
        prompt: str,
        *,
        model_name: str,
        task_type: str,
        payload: dict[str, Any],
        messages: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        return MockProviderAdapter().invoke(prompt, model_name=model_name, task_type=task_type, payload=payload, messages=messages)


class AIModelGateway:
    ADAPTERS = {
        'mock': MockProviderAdapter,
        'agnes': AgnesAdapter,
        'openai': OpenAIAdapter,
        'gemini': GeminiAdapter,
        'anthropic': AnthropicAdapter,
        'local_proxy': LocalProxyAdapter,
    }

    @classmethod
    def _resolve_adapter(cls, provider: str, task_type: str):
        if provider == 'agnes' and task_type == 'image':
            return AgnesImageAdapter
        if provider == 'agnes' and task_type == 'video':
            return AgnesVideoAdapter
        return cls.ADAPTERS.get(provider, MockProviderAdapter)

    @classmethod
    def _resolve_model_name(cls, provider: str, task_type: str, config: AIConfiguration | None) -> str:
        if task_type == 'image':
            if config and getattr(config, 'image_model_name', '').strip():
                return config.image_model_name.strip()
            image_defaults = {
                'agnes': AGNES_DEFAULT_IMAGE_MODEL,
                'openai': 'dall-e-3',
                'mock': 'mock-image',
            }
            return image_defaults.get(provider, 'mock-image')

        if task_type == 'video':
            if config and getattr(config, 'video_model_name', '').strip():
                return config.video_model_name.strip()
            video_defaults = {
                'agnes': AGNES_DEFAULT_VIDEO_MODEL,
                'mock': 'mock-video',
            }
            return video_defaults.get(provider, 'mock-video')

        if config and config.model_name:
            return config.model_name.strip()

        text_defaults = {
            'openai': 'gpt-4o-mini',
            'agnes': AGNES_DEFAULT_MODEL,
            'anthropic': 'claude-3-5-sonnet',
            'gemini': 'gemini-2.0-flash',
            'mock': 'mock',
            'local_proxy': 'mock',
        }
        return text_defaults.get(provider, 'mock')

    @classmethod
    def _build_prompt(cls, task_type: str, payload: dict[str, Any]) -> str:
        if task_type == 'copy':
            return json.dumps(payload, ensure_ascii=False)
        if task_type == 'image':
            return build_image_generation_prompt(payload)
        if task_type == 'storyboard':
            return f"分镜任务: {json.dumps(payload, ensure_ascii=False)}"
        if task_type == 'audio':
            return f"配音任务: {json.dumps(payload, ensure_ascii=False)}"
        if task_type == 'image_prompt':
            return json.dumps(payload, ensure_ascii=False)
        if task_type == 'review':
            return json.dumps(payload, ensure_ascii=False)
        if task_type == 'video':
            return build_video_generation_prompt(payload)
        return json.dumps(payload, ensure_ascii=False)

    @classmethod
    def _build_messages(cls, task_type: str, payload: dict[str, Any], prompt_key: str) -> list[dict[str, str]] | None:
        if task_type == 'copy' and prompt_key == 'marketing.copy.system':
            return build_copy_messages(payload)
        if task_type == 'storyboard' and prompt_key == 'marketing.storyboard.system':
            return build_storyboard_messages(payload)
        if task_type == 'image_prompt' and prompt_key == 'marketing.image_prompt.system':
            return build_image_prompt_messages(payload)
        if task_type == 'review' and prompt_key == 'marketing.review.system':
            return build_review_messages(payload)
        if task_type == 'audio' and prompt_key == 'marketing.audio.system':
            return build_audio_messages(payload)
        if task_type == 'custom_agent' and prompt_key == 'marketing.custom_agent.system':
            return build_custom_agent_messages(payload)
        if task_type == 'brainstorm' and prompt_key == 'marketing.brainstorm.system':
            return build_brainstorm_messages(payload.get('idea', ''), payload.get('brand_context_hint', {}))
        return None

    @classmethod
    def _post_process(cls, task_type: str, result: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        if task_type == 'copy':
            return normalize_copy_result(result, payload)
        if task_type == 'storyboard':
            return normalize_storyboard_result(result, payload)
        if task_type == 'image':
            return normalize_image_result(result, payload)
        if task_type == 'video':
            return normalize_video_result(result, payload)
        if task_type == 'image_prompt':
            return normalize_image_prompt_result(result, payload)
        if task_type == 'review':
            return normalize_review_result(result, payload)
        if task_type == 'audio':
            return normalize_audio_result(result, payload)
        if task_type == 'custom_agent':
            return normalize_custom_agent_result(result, payload)
        if task_type == 'brainstorm':
            return normalize_brainstorm_result(result, payload.get('idea', ''))
        return result

    @classmethod
    def execute(
        cls,
        *,
        organization: Organization | None,
        role: str | None,
        task_type: str,
        payload: dict[str, Any],
        prompt_key: str,
        fallback_provider: str = 'mock',
    ) -> GatewayResponse:
        messages = cls._build_messages(task_type, payload, prompt_key)
        prompt = f"{PROMPT_REGISTRY.get(prompt_key, {}).get('template', '')}\n{json.dumps(payload, ensure_ascii=False)}"
        if messages:
            prompt = '\n'.join(message['content'] for message in messages)
        SafetyPolicy.validate(prompt)
        config = ModelPolicy.select_configuration(organization=organization, task_type=task_type, role=role)
        provider = config.provider if config else fallback_provider
        if (config is None or not config.api_key) and provider not in {'mock', 'local_proxy'}:
            provider = fallback_provider
            config = None
        if config is None and provider == fallback_provider:
            logs_prefix = f'gateway:no_active_config_for_lane={task_lane(task_type)}'
        else:
            logs_prefix = None
        model_name = cls._resolve_model_name(provider, task_type, config)
        adapter_cls = cls._resolve_adapter(provider, task_type)
        adapter = adapter_cls(config) if config is not None else MockProviderAdapter(None)

        logs = [f'gateway:provider={provider}', f'gateway:model={model_name}', f'gateway:prompt_key={prompt_key}']
        if logs_prefix:
            logs.append(logs_prefix)
        if messages:
            if task_type == 'copy':
                logs.append('gateway:copy_structured_prompt=true')
            elif task_type == 'storyboard':
                logs.append('gateway:storyboard_structured_prompt=true')
        if task_type == 'image' and provider == 'agnes':
            logs.append('gateway:image_api=agnes-images')
            logs.append(f'gateway:image_size={aspect_ratio_to_size(str(payload.get("aspect_ratio") or payload.get("aspectRatio") or "1:1"))}')
        if task_type == 'video' and provider == 'agnes':
            width, height = aspect_ratio_to_video_dimensions(str(payload.get('aspect_ratio') or '9:16'))
            frame_rate = int(payload.get('frame_rate') or AGNES_VIDEO_DEFAULT_FRAME_RATE)
            num_frames = snap_agnes_num_frames(int(payload.get('duration') or 5), frame_rate)
            logs.append('gateway:video_api=agnes-videos')
            logs.append(f'gateway:video_size={width}x{height}')
            logs.append(f'gateway:video_frames={num_frames}@{frame_rate}fps')
        fallback_used = False
        prompt_tokens = 0
        completion_tokens = 0
        try:
            raw = adapter.invoke(prompt, model_name=model_name, task_type=task_type, payload=payload, messages=messages)
            if isinstance(raw, ChatCompletionResult):
                result = cls._post_process(task_type, raw.payload, payload)
                prompt_tokens = raw.prompt_tokens
                completion_tokens = raw.completion_tokens
            else:
                result = cls._post_process(task_type, raw, payload)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, RetryableGatewayError, json.JSONDecodeError, KeyError, IndexError) as exc:
            if provider != fallback_provider:
                if task_type == 'video':
                    if isinstance(exc, urllib.error.HTTPError):
                        detail = exc.read().decode('utf-8', errors='replace')[:240]
                        logs.append(f'gateway:error=http_{exc.code}')
                        logs.append(f'gateway:error_detail={detail}')
                    else:
                        logs.append(f'gateway:error={str(exc)[:240]}')
                    raise NonRetryableGatewayError(
                        'Agnes 视频 API 调用失败（已自动重试多次）。'
                        f' 原因：{str(exc)[:200]}。'
                        ' 若 PowerShell 可创建任务但此处失败，多为 Python SSL 链路偶发中断，请稍后重试或配置 HTTPS_PROXY。'
                    ) from exc
                fallback_used = True
                logs.append(f'gateway:fallback={fallback_provider}')
                if isinstance(exc, urllib.error.HTTPError):
                    detail = exc.read().decode('utf-8', errors='replace')[:240]
                    logs.append(f'gateway:error=http_{exc.code}')
                    logs.append(f'gateway:error_detail={detail}')
                else:
                    logs.append(f'gateway:error={str(exc)[:240]}')
                adapter = cls.ADAPTERS[fallback_provider](AIConfiguration(provider='mock'))
                raw = adapter.invoke(prompt, model_name='mock', task_type=task_type, payload=payload, messages=messages)
                result = cls._post_process(task_type, raw if isinstance(raw, dict) else raw.payload, payload)
            else:
                raise NonRetryableGatewayError(str(exc)) from exc

        if not prompt_tokens:
            prompt_tokens = max(40, len(prompt) // 4)
        if not completion_tokens:
            completion_tokens = max(40, len(json.dumps(result, ensure_ascii=False)) // 4)
        if task_type == 'image':
            cost = CostCalculator.calculate_image(provider, generated_images=int(result.get('generated_images') or 1))
        elif task_type == 'video':
            media_seconds = int(result.get('duration_seconds') or max(1, round(int(result.get('num_frames') or 121) / max(int(result.get('frame_rate') or 24), 1))))
            cost = CostCalculator.calculate(provider, model_name, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens, media_seconds=media_seconds)
        else:
            cost = CostCalculator.calculate(provider, model_name, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens)
        return GatewayResponse(
            payload=result,
            logs=logs,
            provider=provider,
            model_name=model_name,
            fallback_used=fallback_used,
            cost_usd=cost,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )
