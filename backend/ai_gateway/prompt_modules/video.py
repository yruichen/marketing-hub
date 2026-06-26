from __future__ import annotations

import json
import re
from typing import Any

from ai_gateway.prompt_modules.common import _strip_json_fence, compact_text, platform_strategy

MOCK_VIDEO_URL = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
MOCK_VIDEO_THUMBNAIL = 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?auto=format&fit=crop&w=640&q=80'
AGNES_VIDEO_ALLOWED_FRAMES = (81, 121, 161, 241, 441)
AGNES_VIDEO_DEFAULT_FRAME_RATE = 24


def snap_agnes_num_frames(target_seconds: int, frame_rate: int = AGNES_VIDEO_DEFAULT_FRAME_RATE) -> int:
    """Agnes Video v2.0 requires num_frames = 8n+1, max 441."""
    try:
        seconds = max(1, int(target_seconds))
    except (TypeError, ValueError):
        seconds = 5
    target_frames = seconds * max(1, int(frame_rate))
    for value in AGNES_VIDEO_ALLOWED_FRAMES:
        if value >= target_frames:
            return value
    return AGNES_VIDEO_ALLOWED_FRAMES[-1]


def aspect_ratio_to_video_dimensions(aspect_ratio: str) -> tuple[int, int]:
    """Map aspect ratio to Agnes `(width, height)` pixel dimensions."""
    ratio = (aspect_ratio or '9:16').strip()
    mapping = {
        '16:9': (1152, 648),
        '9:16': (768, 1365),
        '1:1': (1024, 1024),
        '4:5': (896, 1120),
        '4:3': (1152, 864),
        '3:4': (864, 1152),
    }
    return mapping.get(ratio, mapping['9:16'])


def build_video_generation_prompt(payload: dict[str, Any]) -> str:
    """
    Build an Agnes-friendly cinematic prompt.
    See: https://agnes-ai.com/doc/agnes-video-v20
    """
    explicit = str(payload.get('prompt') or payload.get('expanded_prompt') or '').strip()
    if explicit:
        return explicit

    video_topic = str(payload.get('video_topic') or '').strip()
    platform = str(payload.get('platform') or '').strip()
    aspect_ratio = str(payload.get('aspect_ratio') or '9:16').strip()
    scenes = payload.get('scenes') or []
    parts: list[str] = []

    if video_topic:
        parts.append(f"Marketing video about {video_topic}.")
    parts.append(f"Aspect ratio {aspect_ratio}; compose for social-feed viewing and safe crop.")
    if platform:
        parts.append(f"Platform pacing: {platform_strategy(platform)}")

    if isinstance(scenes, list):
        for index, scene in enumerate(scenes[:8], 1):
            if not isinstance(scene, dict):
                continue
            visual = str(scene.get('visual_description') or scene.get('visual') or scene.get('description') or '').strip()
            narration = str(scene.get('audio_narration') or scene.get('voiceover') or scene.get('narration') or '').strip()
            if visual:
                parts.append(f"Shot {index}: {visual}")
            if narration:
                parts.append(f"Voiceover cue: {narration}")

    workflow_context = str(payload.get('workflow_context') or '').strip()
    if workflow_context:
        parts.append(f"Brand context: {compact_text(workflow_context, max_chars=700)}")

    feedback = str(payload.get('feedback') or '').strip()
    if feedback:
        parts.append(f"Revision notes: {compact_text(feedback, max_chars=700)}")

    if not parts:
        return (
            '电影感品牌营销短片：清晰主体、平滑运镜、专业布光、'
            '浅景深、高细节、广告级构图，无文字叠加，无水印。'
        )

    return (
        ' '.join(parts)
        + ' Continuous narrative, clear subject continuity, cinematic but realistic camera movement, '
        'professional lighting, controlled depth of field, high detail, advertising-grade composition, '
        'no overlaid text, no watermark, no random logos, no distorted anatomy.'
    ).strip()


def extract_agnes_video_url(body: Any) -> str:
    if not isinstance(body, dict):
        return ''
    for key in ('video_url', 'remixed_from_video_id', 'url', 'output_url', 'download_url'):
        value = body.get(key)
        if isinstance(value, str) and value.strip().startswith('http'):
            return value.strip()
    nested = body.get('data') or body.get('result') or body.get('output')
    if isinstance(nested, dict):
        return extract_agnes_video_url(nested)
    return ''


def normalize_video_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        result = {}

    scenes = payload.get('scenes') or result.get('scenes') or []
    if not isinstance(scenes, list):
        scenes = []

    try:
        duration = int(payload.get('duration') or result.get('duration_seconds') or 30)
    except (TypeError, ValueError):
        duration = 30

    video_topic = str(payload.get('video_topic') or result.get('video_topic') or 'Marketing video').strip()
    aspect_ratio = str(payload.get('aspect_ratio') or result.get('aspect_ratio') or '9:16').strip()
    video_url = extract_agnes_video_url(result) or str(result.get('video_url') or result.get('url') or MOCK_VIDEO_URL).strip()
    thumbnail_url = str(result.get('thumbnail_url') or result.get('poster_url') or MOCK_VIDEO_THUMBNAIL).strip()
    frame_rate = int(result.get('frame_rate') or payload.get('frame_rate') or AGNES_VIDEO_DEFAULT_FRAME_RATE)
    num_frames = int(result.get('num_frames') or payload.get('num_frames') or snap_agnes_num_frames(duration, frame_rate))
    duration_seconds = int(result.get('duration_seconds') or max(1, round(num_frames / max(frame_rate, 1))))

    is_demo_fallback = video_url == MOCK_VIDEO_URL and not str(result.get('id') or result.get('task_id') or '').strip()

    return {
        'video_topic': video_topic,
        'aspect_ratio': aspect_ratio,
        'video_url': video_url,
        'thumbnail_url': thumbnail_url,
        'duration_seconds': duration_seconds,
        'num_frames': num_frames,
        'frame_rate': frame_rate,
        'scenes_count': len(scenes),
        'has_audio': bool(str(payload.get('audio_url') or '').strip()),
        'model': str(payload.get('model') or result.get('model') or 'agnes-video-v2.0'),
        'provider_task_id': str(result.get('id') or result.get('task_id') or ''),
        'is_demo_fallback': is_demo_fallback,
    }
