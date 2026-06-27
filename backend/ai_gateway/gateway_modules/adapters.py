from __future__ import annotations

import http.client
import json
import ssl
import time
import urllib.error
import urllib.request
from typing import Any

from api.models import AIConfiguration
from api.redaction import redact_text
from ai_gateway.gateway_modules.constants import (
    AGNES_DEFAULT_BASE_URL,
    AGNES_DEFAULT_IMAGE_MODEL,
    AGNES_DEFAULT_MODEL,
    AGNES_DEFAULT_VIDEO_MODEL,
    JSON_RESPONSE_TASK_TYPES,
)
from ai_gateway.gateway_modules.types import ChatCompletionResult, RetryableGatewayError
from ai_gateway.prompts import (
    AGNES_VIDEO_DEFAULT_FRAME_RATE,
    aspect_ratio_to_size,
    aspect_ratio_to_video_dimensions,
    build_image_generation_prompt,
    build_video_generation_prompt,
    extract_agnes_video_url,
    normalize_audio_result,
    normalize_brainstorm_result,
    normalize_copy_result,
    normalize_image_prompt_result,
    normalize_image_result,
    normalize_review_result,
    normalize_storyboard_result,
    normalize_video_result,
    snap_agnes_num_frames,
)

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
            headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {self._config.get_api_key()}'},
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
        api_key = self._config.get_api_key()
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}'
        if self._config.base_url:
            url = f'{self._config.base_url.rstrip("/")}/v1beta/models/{model}:generateContent?key={api_key}'
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
                'x-api-key': self._config.get_api_key(),
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
