from __future__ import annotations

import json
import urllib.error
from typing import Any

from django.conf import settings

from api.models import AIConfiguration, Organization
from api.redaction import redact_text
from ai_gateway.gateway_modules.adapters import (
    AgnesAdapter,
    AgnesImageAdapter,
    AgnesVideoAdapter,
    AnthropicAdapter,
    GeminiAdapter,
    LocalProxyAdapter,
    MockProviderAdapter,
    OpenAIAdapter,
)
from ai_gateway.gateway_modules.constants import (
    AGNES_DEFAULT_IMAGE_MODEL,
    AGNES_DEFAULT_MODEL,
    AGNES_DEFAULT_VIDEO_MODEL,
)
from ai_gateway.gateway_modules.policy import CostCalculator, ModelPolicy, SafetyPolicy, task_lane
from ai_gateway.gateway_modules.types import (
    ChatCompletionResult,
    GatewayResponse,
    NonRetryableGatewayError,
    RetryableGatewayError,
)
from ai_gateway.prompt_catalog import PROMPT_ASSETS
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

class AIModelGateway:
    ADAPTERS = {
        'mock': MockProviderAdapter,
        'agnes': AgnesAdapter,
        'openai': OpenAIAdapter,
        'gemini': GeminiAdapter,
        'anthropic': AnthropicAdapter,
        'local_proxy': LocalProxyAdapter,
    }

    @staticmethod
    def _mock_provider_allowed() -> bool:
        return bool(getattr(settings, 'AI_ALLOW_MOCK_PROVIDER', False))

    @staticmethod
    def _mock_fallback_allowed() -> bool:
        return bool(getattr(settings, 'AI_ALLOW_MOCK_FALLBACK', False))

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
        prompt_asset = PROMPT_ASSETS.get(prompt_key)
        messages = cls._build_messages(task_type, payload, prompt_key)
        prompt = f"{(prompt_asset.template if prompt_asset else '')}\n{json.dumps(payload, ensure_ascii=False)}"
        if messages:
            prompt = '\n'.join(message['content'] for message in messages)
        SafetyPolicy.validate(prompt)
        config = ModelPolicy.select_configuration(organization=organization, task_type=task_type, role=role)
        provider = config.provider if config else fallback_provider
        if (config is None or not config.has_api_key()) and provider not in {'mock', 'local_proxy'}:
            provider = fallback_provider
            config = None
        if provider == 'mock' and not cls._mock_provider_allowed():
            raise NonRetryableGatewayError(
                'No production AI provider is configured for this task lane, and mock provider is disabled.'
            )
        if config is None and provider == fallback_provider:
            logs_prefix = f'gateway:no_active_config_for_lane={task_lane(task_type)}'
        else:
            logs_prefix = None
        model_name = cls._resolve_model_name(provider, task_type, config)
        adapter_cls = cls._resolve_adapter(provider, task_type)
        adapter = adapter_cls(config) if config is not None else MockProviderAdapter(None)

        logs = [
            f'gateway:provider={provider}',
            f'gateway:model={model_name}',
            f'gateway:prompt_key={prompt_key}',
        ]
        if prompt_asset:
            logs.extend([
                f'gateway:prompt_version={prompt_asset.version}',
                f'gateway:prompt_owner={prompt_asset.owner}',
                f'gateway:prompt_risk={prompt_asset.risk}',
            ])
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
                if fallback_provider == 'mock' and not cls._mock_fallback_allowed():
                    raise NonRetryableGatewayError(
                        f'{provider} provider failed and mock fallback is disabled.'
                    ) from exc
                if task_type == 'video':
                    if isinstance(exc, urllib.error.HTTPError):
                        detail = redact_text(exc.read().decode('utf-8', errors='replace'))[:240]
                        logs.append(f'gateway:error=http_{exc.code}')
                        logs.append(f'gateway:error_detail={detail}')
                    else:
                        logs.append(f'gateway:error={redact_text(str(exc))[:240]}')
                    raise NonRetryableGatewayError(
                        'Agnes 视频 API 调用失败（已自动重试多次）。'
                        f' 原因：{redact_text(str(exc))[:200]}。'
                        ' 若 PowerShell 可创建任务但此处失败，多为 Python SSL 链路偶发中断，请稍后重试或配置 HTTPS_PROXY。'
                    ) from exc
                fallback_used = True
                logs.append(f'gateway:fallback={fallback_provider}')
                if isinstance(exc, urllib.error.HTTPError):
                    detail = redact_text(exc.read().decode('utf-8', errors='replace'))[:240]
                    logs.append(f'gateway:error=http_{exc.code}')
                    logs.append(f'gateway:error_detail={detail}')
                else:
                    logs.append(f'gateway:error={redact_text(str(exc))[:240]}')
                adapter = cls.ADAPTERS[fallback_provider](AIConfiguration(provider='mock'))
                raw = adapter.invoke(prompt, model_name='mock', task_type=task_type, payload=payload, messages=messages)
                result = cls._post_process(task_type, raw if isinstance(raw, dict) else raw.payload, payload)
            else:
                raise NonRetryableGatewayError(redact_text(str(exc))) from exc

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
