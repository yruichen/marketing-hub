from __future__ import annotations

import json
import re
from typing import Any


COPY_SYSTEM_PROMPT = (
    'You are a professional marketing copywriting AI. '
    'Generate high-converting social media copy that matches the target platform and tone. '
    'Respond ONLY with valid JSON. Do not wrap the JSON in markdown code fences.'
)

COPY_JSON_SCHEMA_HINT = """{
  "title": "Catchy headline with emojis when appropriate for the platform",
  "paragraphs": [
    "Paragraph 1: engaging hook",
    "Paragraph 2: key value propositions",
    "Paragraph 3: transition toward action"
  ],
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "call_to_action": "Clear call to action"
}"""

PLATFORM_GUIDANCE = {
    'xiaohongshu': 'Use Xiaohongshu style: conversational, emoji-friendly, short punchy lines, hashtag-friendly tags.',
    '小红书': 'Use Xiaohongshu style: conversational, emoji-friendly, short punchy lines, hashtag-friendly tags.',
    'wechat': 'Use WeChat article style: informative, structured paragraphs, trustworthy tone.',
    '微信': 'Use WeChat article style: informative, structured paragraphs, trustworthy tone.',
    'douyin': 'Use Douyin short-video caption style: hook-first, spoken rhythm, strong CTA.',
    '抖音': 'Use Douyin short-video caption style: hook-first, spoken rhythm, strong CTA.',
}


def _platform_hint(platform: str) -> str:
    key = (platform or '').strip().lower()
    return PLATFORM_GUIDANCE.get(key, f'Adapt copy conventions for platform: {platform or "general social media"}.')


def build_copy_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    brand_name = str(payload.get('brand_name') or 'Marketing Hub').strip()
    product_description = str(payload.get('product_description') or '').strip()
    tone = str(payload.get('tone') or '爆款活泼').strip()
    platform = str(payload.get('platform') or 'Xiaohongshu').strip()
    feedback = str(payload.get('feedback') or '').strip()
    workflow_context = payload.get('workflow_context')

    user_lines = [
        'Generate marketing copy with the following inputs:',
        f'- Brand / product name: {brand_name}',
        f'- Product description: {product_description or "Not specified"}',
        f'- Tone: {tone}',
        f'- Target platform: {platform}',
        f'- Platform guidance: {_platform_hint(platform)}',
        f'- Required JSON schema:\n{COPY_JSON_SCHEMA_HINT}',
    ]
    if workflow_context:
        user_lines.append(f'- Workflow / brand context: {workflow_context}')
    if feedback:
        user_lines.append(f'- Revision feedback (apply strictly): {feedback}')

    return [
        {'role': 'system', 'content': COPY_SYSTEM_PROMPT},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def _strip_json_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\s*```$', '', cleaned)
    return cleaned.strip()


def _coerce_paragraphs(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [part.strip() for part in value.split('\n') if part.strip()]
    return []


def _coerce_tags(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip().lstrip('#') for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [part.strip().lstrip('#') for part in re.split(r'[,，\s]+', value) if part.strip()]
    return []


def normalize_copy_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {'title': payload.get('brand_name', 'Generated Copy'), 'paragraphs': [result], 'tags': [], 'call_to_action': ''}
    if not isinstance(result, dict):
        result = {}

    brand_name = str(payload.get('brand_name') or 'Marketing Hub').strip()
    tone = str(payload.get('tone') or '爆款活泼').strip()
    platform = str(payload.get('platform') or 'Xiaohongshu').strip()

    paragraphs = _coerce_paragraphs(result.get('paragraphs') or result.get('body') or result.get('content'))
    if not paragraphs and result.get('title'):
        paragraphs = [str(result.get('title'))]

    title = str(result.get('title') or brand_name).strip() or brand_name
    tags = _coerce_tags(result.get('tags'))
    call_to_action = str(result.get('call_to_action') or result.get('cta') or '').strip()

    if not paragraphs:
        paragraphs = [
            str(product) if (product := payload.get('product_description')) else f'{brand_name} marketing copy draft.',
        ]
    if not tags:
        tags = [platform.replace(' ', ''), tone.replace(' ', ''), brand_name.replace(' ', '')][:4]
    if not call_to_action:
        call_to_action = f'了解更多关于 {brand_name} 的信息。'

    return {
        'title': title,
        'paragraphs': paragraphs,
        'tags': tags,
        'call_to_action': call_to_action,
        'platform': platform,
        'tone': tone,
    }


STORYBOARD_SYSTEM_PROMPT = (
    'You are a professional short-video director and storyboard AI. '
    'Design a compelling scene-by-scene script with visual direction and voiceover narration. '
    'Respond ONLY with valid JSON. Do not wrap the JSON in markdown code fences.'
)

STORYBOARD_JSON_SCHEMA_HINT = """{
  "video_topic": "The video topic or campaign focus",
  "total_duration_seconds": 30,
  "target_audience": "Target audience description",
  "scenes": [
    {
      "scene_number": 1,
      "visual_description": "Detailed visual: shot type, subject, lighting, mood",
      "audio_narration": "Voiceover or narration script read aloud in this scene",
      "duration_seconds": 10
    }
  ]
}"""


def build_storyboard_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    video_topic = str(payload.get('video_topic') or 'Marketing video').strip()
    duration = int(payload.get('duration') or payload.get('total_duration_seconds') or 30)
    target_audience = str(payload.get('target_audience') or 'General audience').strip()
    feedback = str(payload.get('feedback') or '').strip()
    workflow_context = payload.get('workflow_context')
    platform = str(payload.get('platform') or '').strip()

    user_lines = [
        'Generate a storyboard script with the following inputs:',
        f'- Video topic / focus: {video_topic}',
        f'- Target total duration: {duration} seconds',
        f'- Target audience: {target_audience}',
        '- Create between 3 and 6 logical scenes.',
        f'- Ensure scene duration_seconds values sum to exactly {duration} seconds.',
        f'- Required JSON schema:\n{STORYBOARD_JSON_SCHEMA_HINT}',
    ]
    if platform:
        user_lines.insert(4, f'- Distribution platform: {platform} (adapt pacing and style accordingly)')
    if workflow_context:
        user_lines.append(f'- Workflow / brand context: {workflow_context}')
    if feedback:
        user_lines.append(f'- Revision feedback (apply strictly): {feedback}')

    return [
        {'role': 'system', 'content': STORYBOARD_SYSTEM_PROMPT},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def _coerce_scenes(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    scenes: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            continue
        scene_number = int(item.get('scene_number') or index + 1)
        visual = str(item.get('visual_description') or item.get('visual') or '').strip()
        audio = str(item.get('audio_narration') or item.get('narration') or item.get('audio') or '').strip()
        duration = int(item.get('duration_seconds') or item.get('duration') or 0)
        if visual or audio:
            scenes.append({
                'scene_number': scene_number,
                'visual_description': visual or f'Scene {scene_number} visual.',
                'audio_narration': audio or f'Scene {scene_number} narration.',
                'duration_seconds': max(duration, 1),
            })
    return sorted(scenes, key=lambda scene: scene['scene_number'])


def _balance_scene_durations(scenes: list[dict[str, Any]], total_duration: int) -> list[dict[str, Any]]:
    if not scenes:
        return scenes
    total_duration = max(total_duration, len(scenes))
    current = sum(scene['duration_seconds'] for scene in scenes)
    if current == total_duration:
        return scenes
    if current <= 0:
        per_scene = max(1, total_duration // len(scenes))
        for scene in scenes:
            scene['duration_seconds'] = per_scene
        scenes[-1]['duration_seconds'] += total_duration - sum(scene['duration_seconds'] for scene in scenes)
        return scenes
    scale = total_duration / current
    adjusted = []
    for scene in scenes:
        adjusted.append({**scene, 'duration_seconds': max(1, round(scene['duration_seconds'] * scale))})
    delta = total_duration - sum(scene['duration_seconds'] for scene in adjusted)
    adjusted[-1]['duration_seconds'] = max(1, adjusted[-1]['duration_seconds'] + delta)
    return adjusted


def _fallback_storyboard_scenes(video_topic: str, duration: int, target_audience: str) -> list[dict[str, Any]]:
    num_scenes = max(3, min(6, duration // 7 or 3))
    scene_duration = max(1, duration // num_scenes)
    templates = [
        (
            f"Opening shot establishing the theme: {video_topic}.",
            f"Have you ever struggled to create content about {video_topic}?",
        ),
        (
            f"Medium shot showing the core problem for {target_audience}.",
            f"We know what resonates with {target_audience} — authenticity, not hard selling.",
        ),
        (
            'Close-up detail shot highlighting the product or key message.',
            'Here is the turning point — a clear, memorable value proposition.',
        ),
        (
            'Dynamic montage: workflow, results, and social proof in quick cuts.',
            'See how everything comes together in one smooth creative flow.',
        ),
        (
            'Calm hero shot: satisfied creator or customer in a warm setting.',
            'That is the feeling we want viewers to remember.',
        ),
        (
            'Brand end card with logo and call to action on screen.',
            'Start your next video with confidence. Take action today.',
        ),
    ]
    scenes = []
    for index in range(num_scenes):
        visual, audio = templates[index % len(templates)]
        scenes.append({
            'scene_number': index + 1,
            'visual_description': visual,
            'audio_narration': audio,
            'duration_seconds': scene_duration,
        })
    return _balance_scene_durations(scenes, duration)


def normalize_storyboard_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {}
    if not isinstance(result, dict):
        result = {}

    video_topic = str(result.get('video_topic') or payload.get('video_topic') or 'Marketing video').strip()
    target_audience = str(result.get('target_audience') or payload.get('target_audience') or 'General audience').strip()
    total_duration = int(
        result.get('total_duration_seconds')
        or payload.get('duration')
        or payload.get('total_duration_seconds')
        or 30
    )

    scenes = _coerce_scenes(result.get('scenes'))
    if not scenes:
        scenes = _fallback_storyboard_scenes(video_topic, total_duration, target_audience)
    else:
        for index, scene in enumerate(scenes, start=1):
            scene['scene_number'] = index
        scenes = _balance_scene_durations(scenes, total_duration)

    return {
        'video_topic': video_topic,
        'total_duration_seconds': total_duration,
        'target_audience': target_audience,
        'scenes': scenes,
    }


ASPECT_RATIO_SIZE_MAP = {
    '1:1': '1024x1024',
    '4:5': '768x1024',
    '9:16': '768x1024',
    '16:9': '1024x768',
    '3:4': '768x1024',
    '4:3': '1024x768',
}


def aspect_ratio_to_size(aspect_ratio: str) -> str:
    key = (aspect_ratio or '1:1').strip()
    return ASPECT_RATIO_SIZE_MAP.get(key, '1024x1024')


def build_image_generation_prompt(payload: dict[str, Any]) -> str:
    user_prompt = str(payload.get('prompt') or '').strip()
    style = str(payload.get('style') or '').strip()
    aspect_ratio = str(payload.get('aspect_ratio') or payload.get('aspectRatio') or '1:1').strip()
    platform = str(payload.get('platform') or '').strip()

    parts: list[str] = []
    if user_prompt:
        parts.append(user_prompt)
    if style:
        parts.append(f'Artistic style: {style}')
    if platform:
        parts.append(f'Optimized for {platform} social media marketing visual')
    parts.append(
        '[Main subject] + [Scene / background] + [Style] + [Lighting] + [Composition] + [High quality, sharp details]'
    )
    parts.append(f'Composition aspect ratio: {aspect_ratio}')
    return '. '.join(part for part in parts if part)


def normalize_image_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        result = {}

    aspect_ratio = str(
        payload.get('aspect_ratio') or payload.get('aspectRatio') or result.get('aspect_ratio') or '1:1'
    ).strip()
    prompt = str(payload.get('prompt') or result.get('prompt') or '').strip()
    style = str(payload.get('style') or result.get('style') or '').strip()
    revised_prompt = str(result.get('revised_prompt') or build_image_generation_prompt(payload)).strip()
    image_url = str(result.get('image_url') or result.get('url') or '').strip()

    if not image_url and isinstance(result.get('data'), list) and result['data']:
        first = result['data'][0]
        if isinstance(first, dict):
            image_url = str(first.get('url') or '').strip()

    return {
        'prompt': prompt,
        'style': style,
        'aspect_ratio': aspect_ratio,
        'aspectRatio': aspect_ratio,
        'image_url': image_url,
        'revised_prompt': revised_prompt,
        'generated_images': int(result.get('generated_images') or (1 if image_url else 0)),
    }
