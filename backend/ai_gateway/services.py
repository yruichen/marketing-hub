from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from api.models import AIConfiguration, Organization
from api.rbac import role_rank


CAPABILITY_REGISTRY = {
    'openai': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
    'anthropic': {'text', 'vision', 'function_calling'},
    'gemini': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
    'mock': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
    'local_proxy': {'text', 'vision', 'image', 'audio', 'embedding', 'function_calling'},
}

MODEL_CAPABILITIES = {
    'gpt-4o-mini': {'provider': 'openai', 'capabilities': CAPABILITY_REGISTRY['openai']},
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
            'anthropic': Decimal('0.000025'),
            'gemini': Decimal('0.000018'),
            'mock': Decimal('0.00001'),
            'local_proxy': Decimal('0.00001'),
        }.get(provider, Decimal('0.00002'))
        media_rate = Decimal(media_seconds) * Decimal('0.002')
        return (Decimal(total_tokens) * token_rate) + media_rate


class ModelPolicy:
    @staticmethod
    def select_configuration(*, organization: Organization | None, task_type: str, role: str | None = None) -> AIConfiguration | None:
        if organization is not None:
            candidate = AIConfiguration.objects.filter(is_active=True, organization=organization).order_by('-updated_at').first()
            if candidate is None:
                candidate = AIConfiguration.objects.filter(is_active=True, organization__isnull=True).order_by('-updated_at').first()
        else:
            candidate = AIConfiguration.objects.filter(is_active=True, organization__isnull=True).order_by('-updated_at').first()
        if candidate and task_type == 'audio' and role_rank(role) < role_rank('creator'):
            return None
        return candidate


class ProviderAdapter:
    provider_name = 'mock'

    def __init__(self, config: AIConfiguration | None = None):
        self._config = config

    def invoke(self, prompt: str, *, model_name: str, task_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class MockProviderAdapter(ProviderAdapter):
    provider_name = 'mock'

    def invoke(self, prompt: str, *, model_name: str, task_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        time.sleep(0.05)
        if task_type == 'copy':
            return {
                'title': payload.get('brand_name', 'Marketing Hub'),
                'paragraphs': [payload.get('product_description', ''), payload.get('tone', ''), payload.get('platform', '')],
                'tags': ['mock', 'marketing'],
                'call_to_action': 'Learn more now',
            }
        if task_type == 'image':
            return {
                'prompt': payload.get('prompt', ''),
                'style': payload.get('style', ''),
                'aspect_ratio': payload.get('aspect_ratio', '1:1'),
                'image_url': 'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=800&q=80',
                'revised_prompt': payload.get('prompt', ''),
            }
        if task_type == 'storyboard':
            duration = int(payload.get('duration', 30))
            return {
                'video_topic': payload.get('video_topic', ''),
                'total_duration_seconds': duration,
                'target_audience': payload.get('target_audience', ''),
                'scenes': [{'scene_number': 1, 'visual_description': payload.get('video_topic', ''), 'audio_narration': 'Mock narration', 'duration_seconds': duration}],
            }
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


class OpenAIAdapter(ProviderAdapter):
    provider_name = 'openai'

    def invoke(self, prompt: str, *, model_name: str, task_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        config = self._config
        url = 'https://api.openai.com/v1/chat/completions'
        if config.base_url:
            url = f'{config.base_url.rstrip("/")}/chat/completions'
        request_payload = {
            'model': model_name or 'gpt-4o-mini',
            'messages': [
                {'role': 'system', 'content': 'You are a helpful assistant that always outputs JSON.'},
                {'role': 'user', 'content': prompt},
            ],
            'response_format': {'type': 'json_object'},
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(request_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {config.api_key}'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            body = json.loads(response.read().decode('utf-8'))
            return json.loads(body['choices'][0]['message']['content'])

    def __init__(self, config: AIConfiguration):
        self._config = config


class GeminiAdapter(ProviderAdapter):
    provider_name = 'gemini'

    def __init__(self, config: AIConfiguration):
        self._config = config

    def invoke(self, prompt: str, *, model_name: str, task_type: str, payload: dict[str, Any]) -> dict[str, Any]:
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

    def invoke(self, prompt: str, *, model_name: str, task_type: str, payload: dict[str, Any]) -> dict[str, Any]:
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

    def invoke(self, prompt: str, *, model_name: str, task_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        return MockProviderAdapter().invoke(prompt, model_name=model_name, task_type=task_type, payload=payload)


class AIModelGateway:
    ADAPTERS = {
        'mock': MockProviderAdapter,
        'openai': OpenAIAdapter,
        'gemini': GeminiAdapter,
        'anthropic': AnthropicAdapter,
        'local_proxy': LocalProxyAdapter,
    }

    @classmethod
    def _build_prompt(cls, task_type: str, payload: dict[str, Any]) -> str:
        if task_type == 'copy':
            return f"Copy task: {payload}"
        if task_type == 'image':
            return f"Image task: {payload}"
        if task_type == 'storyboard':
            return f"Storyboard task: {payload}"
        if task_type == 'audio':
            return f"Audio task: {payload}"
        return json.dumps(payload, ensure_ascii=False)

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
        prompt = f"{PROMPT_REGISTRY.get(prompt_key, {}).get('template', '')}\n{json.dumps(payload, ensure_ascii=False)}"
        SafetyPolicy.validate(prompt)
        config = ModelPolicy.select_configuration(organization=organization, task_type=task_type, role=role)
        provider = config.provider if config else fallback_provider
        if config and provider not in {'mock', 'local_proxy'} and not config.api_key:
            provider = fallback_provider
            config = None
        model_name = (config.model_name if config else '') or {
            'openai': 'gpt-4o-mini',
            'anthropic': 'claude-3-5-sonnet',
            'gemini': 'gemini-2.0-flash',
            'mock': 'mock',
            'local_proxy': 'mock',
        }.get(provider, 'mock')
        adapter_cls = cls.ADAPTERS.get(provider, MockProviderAdapter)
        adapter = adapter_cls(config)

        logs = [f'gateway:provider={provider}', f'gateway:model={model_name}', f'gateway:prompt_key={prompt_key}']
        fallback_used = False
        try:
            result = adapter.invoke(prompt, model_name=model_name, task_type=task_type, payload=payload)
        except (urllib.error.URLError, TimeoutError, RetryableGatewayError, json.JSONDecodeError, KeyError, IndexError) as exc:
            if provider != fallback_provider:
                fallback_used = True
                logs.append(f'gateway:fallback={fallback_provider}')
                adapter = cls.ADAPTERS[fallback_provider](AIConfiguration(provider='mock'))
                result = adapter.invoke(prompt, model_name='mock', task_type=task_type, payload=payload)
            else:
                raise NonRetryableGatewayError(str(exc)) from exc

        prompt_tokens = max(40, len(prompt) // 4)
        completion_tokens = max(40, len(json.dumps(result, ensure_ascii=False)) // 4)
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
