from __future__ import annotations

import json
import re
from typing import Any

from ai_gateway.prompt_modules.common import _strip_json_fence

AUDIO_SYSTEM_PROMPT = (
    '你是一位中文营销配音导演。'
    '根据给定文本与音色设定，输出适合 TTS 朗读的优化脚本及元数据。'
    '只输出合法 JSON，不要用 markdown 代码块包裹。'
    'optimized_text 应口语化、停顿自然、适合口播。'
)

AUDIO_JSON_SCHEMA_HINT = """{
  "optimized_text": "优化后的配音脚本",
  "voice_direction": "语气与节奏指导",
  "estimated_duration_seconds": 15,
  "pause_markers": ["停顿位置说明"]
}"""


def build_audio_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    text = str(payload.get('text') or '').strip()
    voice_id = str(payload.get('voice_id') or 'female_warm').strip()
    try:
        speed = float(payload.get('speed') or 1.0)
    except (TypeError, ValueError):
        speed = 1.0
    feedback = str(payload.get('feedback') or '').strip()
    workflow_context = payload.get('workflow_context')

    user_lines = [
        '请优化以下配音脚本：',
        f'- 原始文本：\n{text or "（空）"}',
        f'- 音色 ID：{voice_id}',
        f'- 语速倍率：{speed}',
        f'- 输出 JSON 结构：\n{AUDIO_JSON_SCHEMA_HINT}',
    ]
    if workflow_context:
        user_lines.append(f'- 品牌上下文：{workflow_context}')
    if feedback:
        user_lines.append(f'- 修改意见：{feedback}')

    return [
        {'role': 'system', 'content': AUDIO_SYSTEM_PROMPT},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def normalize_audio_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {'optimized_text': result}
    if not isinstance(result, dict):
        result = {}

    original_text = str(payload.get('text') or '').strip()
    optimized = str(result.get('optimized_text') or original_text).strip()
    voice_id = str(payload.get('voice_id') or result.get('voice_id') or 'female_warm').strip()
    try:
        speed = float(payload.get('speed') or result.get('speed') or 1.0)
    except (TypeError, ValueError):
        speed = 1.0

    try:
        duration = int(result.get('estimated_duration_seconds') or max(5, len(optimized) // 4))
    except (TypeError, ValueError):
        duration = max(5, len(optimized) // 4)

    audio_url = str(result.get('audio_url') or '').strip()
    if not audio_url:
        audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'

    return {
        'text': optimized,
        'original_text': original_text,
        'voice_id': voice_id,
        'speed': speed,
        'voice_direction': str(result.get('voice_direction') or '').strip(),
        'audio_url': audio_url,
        'text_length': len(optimized),
        'estimated_audio_duration_seconds': duration,
    }
