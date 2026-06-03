from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db.models import Q

from ai_gateway.prompts import (
    aspect_ratio_to_size,
    build_copy_messages,
    build_image_generation_prompt,
    build_storyboard_messages,
    normalize_copy_result,
    normalize_image_result,
    normalize_storyboard_result,
)
from api.models import AIConfiguration, Organization
from api.rbac import role_rank


AGNES_DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com/v1'
AGNES_DEFAULT_MODEL = 'agnes-2.0-flash'
AGNES_DEFAULT_IMAGE_MODEL = 'agnes-image-2.0-flash'

CAPABILITY_REGISTRY = {
    'openai': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
    'agnes': {'text', 'vision', 'image', 'function_calling'},
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
    'marketing.copy.system': {'version': '2026-05-31', 'template': 'You are a marketing copywriter.'},
    'marketing.storyboard.system': {'version': '2026-05-31', 'template': 'You are a storyboard director.'},
    'marketing.image.system': {'version': '2026-05-31', 'template': 'You are an art director.'},
    'marketing.audio.system': {'version': '2026-05-31', 'template': 'You are a voiceover director.'},
}

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
TEXT_TASK_TYPES = frozenset({'copy', 'storyboard'})
IMAGE_TASK_TYPES = frozenset({'image'})
AUDIO_TASK_TYPES = frozenset({'audio'})


def task_lane(task_type: str) -> str:
    if task_type in IMAGE_TASK_TYPES:
        return 'image'
    if task_type in AUDIO_TASK_TYPES:
        return 'audio'
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
                        f"在{payload.get('tone', '爆款活泼')}风格下，整个创作流程都顺了，效率直接拉满。",
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
        if task_type == 'audio':
            return {
                'text': payload.get('text', ''),
                'voice_id': payload.get('voice_id', 'female_warm'),
                'speed': payload.get('speed', 1.0),
                'audio_url': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
                'text_length': len(payload.get('text', '')),
                'estimated_audio_duration_seconds': 10,
            }
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
            {'role': 'system', 'content': 'You are a helpful assistant that always outputs JSON.'},
            {'role': 'user', 'content': prompt},
        ]
        request_payload: dict[str, Any] = {
            'model': model_name or self.default_model,
            'messages': chat_messages,
            'temperature': 0.7,
            'max_tokens': 2048,
        }
        if task_type in {'copy', 'storyboard'}:
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
            return f"Storyboard task: {payload}"
        if task_type == 'audio':
            return f"Audio task: {payload}"
        return json.dumps(payload, ensure_ascii=False)

    @classmethod
    def _build_messages(cls, task_type: str, payload: dict[str, Any], prompt_key: str) -> list[dict[str, str]] | None:
        if task_type == 'copy' and prompt_key == 'marketing.copy.system':
            return build_copy_messages(payload)
        if task_type == 'storyboard' and prompt_key == 'marketing.storyboard.system':
            return build_storyboard_messages(payload)
        return None

    @classmethod
    def _post_process(cls, task_type: str, result: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        if task_type == 'copy':
            return normalize_copy_result(result, payload)
        if task_type == 'storyboard':
            return normalize_storyboard_result(result, payload)
        if task_type == 'image':
            return normalize_image_result(result, payload)
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
