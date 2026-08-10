from __future__ import annotations

import http.client
import json
import ssl
import time
import urllib.error
import urllib.request
from typing import Any

from api.redaction import redact_text
from harness.adapters.providers.constants import (
    AGNES_DEFAULT_BASE_URL,
    AGNES_DEFAULT_IMAGE_MODEL,
    AGNES_DEFAULT_MODEL,
    AGNES_DEFAULT_VIDEO_MODEL,
    JSON_RESPONSE_TASK_TYPES,
)
from harness.ports.provider import (
    ChatCompletionResult,
    NonRetryableProviderError,
    ProviderConfig,
    RetryableProviderError,
)
RetryableGatewayError = RetryableProviderError
AGNES_VIDEO_DEFAULT_FRAME_RATE = 24

class ProviderAdapter:
    provider_name = ''

    def __init__(self, config: ProviderConfig | None = None):
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


class ChatCompletionsAdapter(ProviderAdapter):
    default_base_url = 'https://api.openai.com/v1'
    default_model = 'gpt-4o-mini'
    request_timeout = 60

    def __init__(self, config: ProviderConfig):
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
        if task_type in JSON_RESPONSE_TASK_TYPES and not messages:
            raise NonRetryableProviderError(
                f'Capability {task_type!r} must provide versioned system and user prompt assets.'
            )
        chat_messages = messages or [{'role': 'user', 'content': prompt}]
        request_payload: dict[str, Any] = {
            'model': model_name or self.default_model,
            'messages': chat_messages,
            'temperature': 0.7,
            'max_tokens': 2048,
        }
        if task_type in JSON_RESPONSE_TASK_TYPES:
            output_schema = payload.get('_harness_output_schema')
            if self.provider_name == 'openai' and isinstance(output_schema, dict):
                request_payload['response_format'] = {
                    'type': 'json_schema',
                    'json_schema': {
                        'name': f'{task_type}_output',
                        'strict': True,
                        'schema': output_schema,
                    },
                }
            else:
                request_payload['response_format'] = {'type': 'json_object'}

        headers = {'Content-Type': 'application/json'}
        api_key = self._config.get_api_key()
        if api_key:
            headers['Authorization'] = f'Bearer {api_key}'
        req = urllib.request.Request(
            self._chat_completions_url(),
            data=json.dumps(request_payload).encode('utf-8'),
            headers=headers,
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=self.request_timeout) as response:
            body = json.loads(response.read().decode('utf-8'))
            choice = body['choices'][0]
            message = choice['message']
            finish_reason = str(choice.get('finish_reason') or '')
            refusal = str(message.get('refusal') or '')
            if refusal:
                raise NonRetryableProviderError('The provider refused this request.')
            if finish_reason == 'length':
                raise NonRetryableProviderError('The provider response exceeded the completion token limit.')
            content = message.get('content')
            if content in (None, ''):
                raise NonRetryableProviderError('The provider returned an empty response.')
            usage = body.get('usage') or {}
            parsed = json.loads(content) if isinstance(content, str) else content
            return ChatCompletionResult(
                payload=parsed if isinstance(parsed, dict) else {'response': parsed},
                prompt_tokens=int(usage.get('prompt_tokens') or 0),
                completion_tokens=int(usage.get('completion_tokens') or 0),
                finish_reason=finish_reason,
                refusal=refusal,
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

    def __init__(self, config: ProviderConfig):
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
        image_prompt = prompt
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
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {self._config.get_api_key()}'},
            method='POST',
        )
        try:
            with urllib.request.urlopen(req, timeout=self.request_timeout) as response:
                body = json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            detail = redact_text(exc.read().decode('utf-8', errors='replace'))
            raise RetryableGatewayError(f'Agnes image API error {exc.code}: {detail}') from exc

        data = body.get('data') or []
        if not data or not isinstance(data[0], dict) or not data[0].get('url'):
            raise RetryableGatewayError('Agnes image API returned no image URL')

        usage = body.get('usage') or {}
        generated_images = int(usage.get('generated_images') or len(data) or 1)
        return {
                'image_url': data[0]['url'],
                'revised_prompt': image_prompt,
                'generated_images': generated_images,
            }


class AgnesVideoAdapter(ProviderAdapter):
    provider_name = 'agnes'
    default_base_url = AGNES_DEFAULT_BASE_URL
    default_model = AGNES_DEFAULT_VIDEO_MODEL
    request_timeout = 90
    poll_interval = 4
    max_wait = 1800
    max_create_retries = 8
    max_request_retries = 6

    def __init__(self, config: ProviderConfig):
        self._config = config

    def _videos_root(self) -> str:
        base = (self._config.base_url or self.default_base_url).rstrip('/')
        if base.endswith('/videos'):
            return base
        return f'{base}/videos'

    def _auth_headers(self) -> dict[str, str]:
        return {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self._config.get_api_key()}',
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
                detail = redact_text(exc.read().decode('utf-8', errors='replace'))
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
        video_prompt = prompt
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
        reference_images = payload.get('reference_images') or payload.get('keyframes') or []
        if not reference_image and isinstance(reference_images, list):
            for item in reference_images:
                candidate = str(item or '').strip()
                if candidate.startswith('http'):
                    reference_image = candidate
                    break
        if isinstance(reference_image, str) and reference_image.strip().startswith('http'):
            request_payload['image'] = reference_image.strip()

        task_id = self._create_video_task(request_payload)
        completed = self._poll_video_task(task_id)
        video_url = extract_agnes_video_url(completed)
        if not video_url:
            raise RetryableGatewayError('Agnes video API completed without a downloadable video URL')

        return {
                **completed,
                'id': task_id,
                'video_url': video_url,
                'num_frames': num_frames,
                'frame_rate': frame_rate,
                'model': selected_model,
                'aspect_ratio': aspect_ratio,
                'video_topic': payload.get('video_topic'),
            }


class GeminiAdapter(ProviderAdapter):
    provider_name = 'gemini'

    def __init__(self, config: ProviderConfig):
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
        api_key = self._config.get_api_key()
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}'
        if self._config.base_url:
            url = f'{self._config.base_url.rstrip("/")}/v1beta/models/{model}:generateContent?key={api_key}'
        generation_config: dict[str, Any] = {'responseMimeType': 'application/json'}
        output_schema = payload.get('_harness_output_schema')
        if isinstance(output_schema, dict):
            generation_config['responseJsonSchema'] = output_schema
        request_payload = {
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': generation_config,
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(request_payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            body = json.loads(response.read().decode('utf-8'))
            candidate = body['candidates'][0]
            finish_reason = str(candidate.get('finishReason') or '')
            if finish_reason in {'MAX_TOKENS', 'SAFETY', 'RECITATION'}:
                raise NonRetryableProviderError(f'Gemini stopped generation: {finish_reason}.')
            parsed = json.loads(candidate['content']['parts'][0]['text'])
            usage = body.get('usageMetadata') or {}
            return ChatCompletionResult(
                payload=parsed,
                prompt_tokens=int(usage.get('promptTokenCount') or 0),
                completion_tokens=int(usage.get('candidatesTokenCount') or 0),
                finish_reason=finish_reason,
            )


class AnthropicAdapter(ProviderAdapter):
    provider_name = 'anthropic'

    def __init__(self, config: ProviderConfig):
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
        output_schema = payload.get('_harness_output_schema')
        if isinstance(output_schema, dict):
            request_payload['output_config'] = {
                'format': {'type': 'json_schema', 'schema': output_schema},
            }
        req = urllib.request.Request(
            url,
            data=json.dumps(request_payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'x-api-key': self._config.get_api_key(),
                'anthropic-version': '2023-06-01',
            },
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            body = json.loads(response.read().decode('utf-8'))
            stop_reason = str(body.get('stop_reason') or '')
            if stop_reason == 'max_tokens':
                raise NonRetryableProviderError('Anthropic response exceeded the completion token limit.')
            content = body.get('content') or []
            if not content or content[0].get('type') != 'text':
                raise NonRetryableProviderError('Anthropic returned no structured text response.')
            parsed = json.loads(content[0]['text'])
            usage = body.get('usage') or {}
            return ChatCompletionResult(
                payload=parsed,
                prompt_tokens=int(usage.get('input_tokens') or 0),
                completion_tokens=int(usage.get('output_tokens') or 0),
                finish_reason=stop_reason,
            )


class LocalProxyAdapter(ChatCompletionsAdapter):
    provider_name = 'local_proxy'
