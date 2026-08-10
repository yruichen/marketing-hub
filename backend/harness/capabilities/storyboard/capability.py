from __future__ import annotations

from typing import Any

from harness.capabilities.storyboard.contract import StoryboardOutput
from harness.prompts import get_prompt_schema, get_prompt_text
from harness.capabilities._shared import (
    context_template_values,
    json_contract_block,
    platform_strategy,
    quality_bar_block,
    output_locale_instruction,
    render_user_prompt,
    resolve_prompt_asset,
)

STORYBOARD_SYSTEM_PROMPT = get_prompt_text('marketing.storyboard.system')
STORYBOARD_JSON_SCHEMA_HINT = get_prompt_schema('marketing.storyboard.system')


def build_storyboard_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    video_topic = str(payload.get('video_topic') or '').strip()
    if not video_topic:
        raise ValueError('video_topic is required')
    duration = int(payload.get('duration') or payload.get('total_duration_seconds') or 30)
    target_audience = str(payload.get('target_audience') or 'General audience').strip()
    platform = str(payload.get('platform') or '').strip()

    asset = resolve_prompt_asset('marketing.storyboard.system', payload)
    quality_bar = quality_bar_block(asset.quality_bar)

    user_prompt = render_user_prompt(asset, {
        'output_locale_instruction': output_locale_instruction(payload),
        'video_topic': video_topic,
        'duration': duration,
        'target_audience': target_audience,
        'platform_context': (
            f'- Target channel: {platform}; {platform_strategy(platform)}' if platform else ''
        ),
        'quality_bar': quality_bar,
        'response_contract': json_contract_block(asset.schema_hint),
        **context_template_values(payload),
    })

    return [
        {'role': 'system', 'content': asset.system_prompt},
        {'role': 'user', 'content': user_prompt},
    ]


def normalize_storyboard_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise TypeError('Validated storyboard provider output must be an object.')
    return StoryboardOutput.model_validate(result).model_dump()
