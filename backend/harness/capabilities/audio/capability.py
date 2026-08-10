from __future__ import annotations

from typing import Any

from harness.prompts import get_prompt_schema, get_prompt_text
from harness.capabilities._shared import (
    context_template_values,
    json_contract_block,
    quality_bar_block,
    output_locale_instruction,
    render_user_prompt,
    resolve_prompt_asset,
)

AUDIO_SYSTEM_PROMPT = get_prompt_text('marketing.audio.system')
AUDIO_JSON_SCHEMA_HINT = get_prompt_schema('marketing.audio.system')


def build_audio_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    text = str(payload.get('text') or '').strip()
    if not text:
        raise ValueError('text is required')
    voice_id = str(payload.get('voice_id') or 'female_warm').strip()
    try:
        speed = float(payload.get('speed') or 1.0)
    except (TypeError, ValueError):
        speed = 1.0
    asset = resolve_prompt_asset('marketing.audio.system', payload)
    quality_bar = quality_bar_block(asset.quality_bar)
    user_prompt = render_user_prompt(asset, {
        'output_locale_instruction': output_locale_instruction(payload),
        'source_text': text,
        'voice_id': voice_id,
        'speed': speed,
        'quality_bar': quality_bar,
        'response_contract': json_contract_block(asset.schema_hint),
        **context_template_values(payload, context_label='Brand context'),
    })

    return [
        {'role': 'system', 'content': asset.system_prompt},
        {'role': 'user', 'content': user_prompt},
    ]


def normalize_audio_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise TypeError('Validated audio provider output must be an object.')

    original_text = str(payload.get('text') or '').strip()
    optimized = str(result['optimized_text']).strip()
    voice_id = str(payload.get('voice_id') or 'female_warm').strip()
    speed = float(payload.get('speed') or 1.0)
    duration = int(result['estimated_duration_seconds'])

    return {
        'text': optimized,
        'original_text': original_text,
        'voice_id': voice_id,
        'speed': speed,
        'voice_direction': str(result['voice_direction']).strip(),
        'audio_url': str(result.get('audio_url') or '').strip(),
        'text_length': len(optimized),
        'estimated_audio_duration_seconds': duration,
    }
