from __future__ import annotations

import json
import urllib.error
from typing import Any

from pydantic import ValidationError

from api.models import AIConfiguration, Organization
from api.redaction import redact_text
from harness.adapters.providers import (
    AgnesAdapter,
    AgnesImageAdapter,
    AgnesVideoAdapter,
    AnthropicAdapter,
    GeminiAdapter,
    LocalProxyAdapter,
    OpenAIAdapter,
)
from harness.adapters.providers.constants import (
    AGNES_DEFAULT_IMAGE_MODEL,
    AGNES_DEFAULT_MODEL,
    AGNES_DEFAULT_VIDEO_MODEL,
    JSON_RESPONSE_TASK_TYPES,
)
from harness.adapters.django.routing import CostCalculator, ModelPolicy, SafetyPolicy, task_lane
from harness.contracts import GatewayResponse
from harness.ports.provider import (
    ChatCompletionResult,
    NonRetryableProviderError,
    RetryableProviderError,
)

NonRetryableGatewayError = NonRetryableProviderError
RetryableGatewayError = RetryableProviderError
from harness.contracts import RunRequest
from harness.prompts import get_prompt_asset
from harness.prompts.repository import CAPABILITY_REGISTRY
from harness.capabilities.api import (
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
    build_workflow_edit_messages,
    normalize_audio_result,
    normalize_brainstorm_result,
    normalize_copy_result,
    normalize_custom_agent_result,
    normalize_image_prompt_result,
    normalize_image_result,
    normalize_review_result,
    normalize_storyboard_result,
    normalize_video_result,
    normalize_workflow_edit_result,
    snap_agnes_num_frames,
)

class DjangoGenerationGateway:
    ADAPTERS = {
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
        try:
            return cls.ADAPTERS[provider]
        except KeyError as exc:
            raise NonRetryableGatewayError(f'Unsupported AI provider: {provider}.') from exc

    @classmethod
    def _resolve_model_name(cls, provider: str, task_type: str, config: AIConfiguration | None) -> str:
        if task_type == 'image':
            if config and getattr(config, 'image_model_name', '').strip():
                return config.image_model_name.strip()
            if provider == 'local_proxy' and config and config.model_name.strip():
                return config.model_name.strip()
            image_defaults = {
                'agnes': AGNES_DEFAULT_IMAGE_MODEL,
                'openai': 'dall-e-3',
            }
            return image_defaults.get(provider, '')

        if task_type == 'video':
            if config and getattr(config, 'video_model_name', '').strip():
                return config.video_model_name.strip()
            if provider == 'local_proxy' and config and config.model_name.strip():
                return config.model_name.strip()
            video_defaults = {
                'agnes': AGNES_DEFAULT_VIDEO_MODEL,
            }
            return video_defaults.get(provider, '')

        if config and config.model_name:
            return config.model_name.strip()

        text_defaults = {
            'openai': 'gpt-4o-mini',
            'agnes': AGNES_DEFAULT_MODEL,
            'anthropic': 'claude-3-5-sonnet',
            'gemini': 'gemini-2.0-flash',
        }
        return text_defaults.get(provider, '')

    @classmethod
    def _build_prompt(cls, task_type: str, payload: dict[str, Any]) -> str:
        if task_type == 'copy':
            return json.dumps(payload, ensure_ascii=False)
        if task_type == 'image':
            return build_image_generation_prompt(payload)
        if task_type == 'storyboard':
            return f"Storyboard task: {json.dumps(payload, ensure_ascii=False)}"
        if task_type == 'audio':
            return f"Voiceover task: {json.dumps(payload, ensure_ascii=False)}"
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
            return build_brainstorm_messages(
                payload.get('idea', ''), payload.get('brand_context_hint', {}), payload
            )
        if task_type == 'workflow_edit' and prompt_key == 'marketing.workflow_edit.system':
            return build_workflow_edit_messages(payload)
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
        if task_type == 'workflow_edit':
            return normalize_workflow_edit_result(result, payload)
        return result

    @staticmethod
    def _validate_provider_output(prompt_key: str, task_type: str, result: dict[str, Any]) -> None:
        if task_type not in JSON_RESPONSE_TASK_TYPES:
            return
        spec = CAPABILITY_REGISTRY.for_prompt(prompt_key)
        if spec.output_model is None:
            return
        try:
            spec.output_model.model_validate(result)
        except ValidationError as exc:
            raise NonRetryableGatewayError(
                f'Provider output does not satisfy {spec.name} contract: {exc.errors()}'
            ) from exc

    @staticmethod
    def _validate_capability_result(prompt_key: str, task_type: str, result: dict[str, Any]) -> None:
        spec = CAPABILITY_REGISTRY.for_prompt(prompt_key)
        result_model = spec.result_model or spec.output_model
        if result_model is None:
            return
        try:
            result_model.model_validate(result)
        except ValidationError as exc:
            raise NonRetryableGatewayError(
                f'Normalized output does not satisfy {spec.name} result contract: {exc.errors()}'
            ) from exc

    @classmethod
    def execute(
        cls,
        *,
        organization: Organization | None,
        role: str | None,
        task_type: str,
        payload: dict[str, Any],
        prompt_key: str,
    ) -> GatewayResponse:
        prompt_asset = get_prompt_asset(
            prompt_key,
            version=str(payload.get('prompt_version') or '') or None,
            locale=str(payload.get('prompt_locale') or '') or None,
        )
        if prompt_asset is None:
            raise NonRetryableGatewayError(f'Unknown prompt asset or version: {prompt_key}')
        messages = cls._build_messages(task_type, payload, prompt_key)
        prompt = f"{prompt_asset.template}\n{json.dumps(payload, ensure_ascii=False)}"
        if messages:
            prompt = '\n'.join(message['content'] for message in messages)
        SafetyPolicy.validate(prompt)
        config = ModelPolicy.select_configuration(organization=organization, task_type=task_type, role=role)
        if config is None:
            raise NonRetryableGatewayError(
                f'AI_PROVIDER_NOT_CONFIGURED: Configure an active {task_lane(task_type)} provider in AI Settings before running this capability.'
            )
        provider = config.provider
        if provider == 'local_proxy':
            if not config.base_url.strip() or not config.model_name.strip():
                raise NonRetryableGatewayError(
                    'AI_PROVIDER_INCOMPLETE: Local proxy requires both base URL and model name.'
                )
        elif not config.has_api_key():
            raise NonRetryableGatewayError(
                f'AI_PROVIDER_CREDENTIALS_MISSING: Add credentials for {provider} in AI Settings.'
            )
        model_name = cls._resolve_model_name(provider, task_type, config)
        if not model_name:
            raise NonRetryableGatewayError(
                f'AI_PROVIDER_MODEL_MISSING: Select a {task_lane(task_type)} model for {provider} in AI Settings.'
            )
        adapter_cls = cls._resolve_adapter(provider, task_type)
        adapter = adapter_cls(config)

        logs = [
            f'gateway:provider={provider}',
            f'gateway:model={model_name}',
            f'gateway:prompt_key={prompt_key}',
        ]
        logs.extend([
            f'gateway:prompt_version={prompt_asset.version}',
            f'gateway:prompt_locale={prompt_asset.locale}',
            f'gateway:prompt_checksum={prompt_asset.checksum[:12]}',
            f'gateway:prompt_eval={prompt_asset.evaluation_profile}',
            f'gateway:prompt_owner={prompt_asset.owner}',
            f'gateway:prompt_risk={prompt_asset.risk}',
        ])
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
            scenes = payload.get('scenes') if isinstance(payload.get('scenes'), list) else []
            references = payload.get('reference_images') if isinstance(payload.get('reference_images'), list) else []
            logs.append('gateway:video_api=agnes-videos')
            logs.append(f'gateway:video_mode={payload.get("creative_mode") or "single_shot"}')
            logs.append(f'gateway:video_scenes={len(scenes)}')
            logs.append(f'gateway:video_references={len(references)}')
            logs.append(f'gateway:video_size={width}x{height}')
            logs.append(f'gateway:video_frames={num_frames}@{frame_rate}fps')
        prompt_tokens = 0
        completion_tokens = 0
        try:
            raw = adapter.invoke(prompt, model_name=model_name, task_type=task_type, payload=payload, messages=messages)
            if isinstance(raw, ChatCompletionResult):
                cls._validate_provider_output(prompt_key, task_type, raw.payload)
                result = cls._post_process(task_type, raw.payload, payload)
                prompt_tokens = raw.prompt_tokens
                completion_tokens = raw.completion_tokens
            else:
                cls._validate_provider_output(prompt_key, task_type, raw)
                result = cls._post_process(task_type, raw, payload)
            cls._validate_capability_result(prompt_key, task_type, result)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, RetryableGatewayError, json.JSONDecodeError, KeyError, IndexError) as exc:
            if isinstance(exc, urllib.error.HTTPError):
                detail = redact_text(exc.read().decode('utf-8', errors='replace'))[:240]
                logs.append(f'gateway:error=http_{exc.code}')
                logs.append(f'gateway:error_detail={detail}')
            else:
                logs.append(f'gateway:error={redact_text(str(exc))[:240]}')
            raise RetryableGatewayError(
                f'{provider} provider request failed. Verify the provider configuration and retry.'
            ) from exc

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
            fallback_used=False,
            cost_usd=cost,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            prompt_key=prompt_asset.key,
            prompt_version=prompt_asset.version,
            prompt_locale=prompt_asset.locale,
            prompt_checksum=prompt_asset.checksum,
            evaluation_profile=prompt_asset.evaluation_profile,
        )


class DjangoGenerationExecutionAdapter:
    """Django composition adapter implementing the pure runtime execution port."""

    def execute(self, request: RunRequest) -> GatewayResponse:
        organization = None
        if request.context.organization_id is not None:
            organization = Organization.objects.filter(pk=request.context.organization_id).first()
        spec = CAPABILITY_REGISTRY.get(request.capability)
        try:
            payload = (
                spec.input_model.model_validate(request.input).model_dump()
                if spec.input_model is not None
                else dict(request.input)
            )
        except ValidationError as exc:
            raise NonRetryableGatewayError(
                f'CAPABILITY_INPUT_INVALID: {spec.name} input does not satisfy its contract: {exc.errors()}'
            ) from exc
        if spec.output_model is not None and spec.strict_output and spec.task_type in JSON_RESPONSE_TASK_TYPES:
            payload['_harness_output_schema'] = spec.output_model.model_json_schema()
        payload['output_locale'] = request.context.output_locale
        payload['prompt_locale'] = request.prompt_locale
        if request.prompt_version:
            payload['prompt_version'] = request.prompt_version
        return DjangoGenerationGateway.execute(
            organization=organization,
            role=request.context.role,
            task_type=spec.task_type,
            payload=payload,
            prompt_key=spec.prompt_key,
        )


__all__ = ['DjangoGenerationExecutionAdapter', 'DjangoGenerationGateway']
