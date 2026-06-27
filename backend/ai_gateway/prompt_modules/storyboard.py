from __future__ import annotations

import json
import re
from typing import Any

from ai_gateway.prompt_modules.common import (
    _strip_json_fence,
    append_context_lines,
    append_feedback_line,
    fact_guardrail_block,
    json_contract_block,
    platform_strategy,
    quality_bar_block,
)

STORYBOARD_SYSTEM_PROMPT = (
    '你是一位短视频营销导演与分镜策划，擅长把品牌卖点转成可拍摄、可配音、可剪辑的镜头脚本。'
    'visual_description 用中文描述具体镜头动作、主体、景别、运镜、光线和情绪；audio_narration 必须是可直接朗读的中文口播。'
    f'{fact_guardrail_block()}'
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
    platform = str(payload.get('platform') or '').strip()

    quality_bar = quality_bar_block((
        '第 1 个场景必须在前 3 秒给出注意力钩子，不能慢热。',
        '每个场景必须有具体可拍摄动作，不要只写抽象情绪或营销概念。',
        '旁白要口语化、短句、可念读，并与画面动作同步。',
        '场景之间要有问题、转折、证明、行动承接的逻辑推进。',
        f'各场景 duration_seconds 之和必须等于 {duration} 秒。',
    ))

    user_lines = [
        '任务：根据以下输入生成短视频分镜脚本。',
        f'- 视频主题：{video_topic}',
        f'- 目标总时长：{duration} 秒',
        f'- 目标受众：{target_audience}',
        '- 场景数量：3 到 6 个，逻辑连贯。',
        f'- {quality_bar}',
        f'- {json_contract_block(STORYBOARD_JSON_SCHEMA_HINT)}',
    ]
    if platform:
        user_lines.insert(5, f'- 发布平台：{platform}；{platform_strategy(platform)}')
    append_context_lines(user_lines, payload)
    append_feedback_line(user_lines, feedback)

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
