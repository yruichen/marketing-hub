from __future__ import annotations

from typing import Any

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


COPY_SYSTEM_PROMPT = get_prompt_text('marketing.copy.system')
COPY_JSON_SCHEMA_HINT = get_prompt_schema('marketing.copy.system')

def _platform_hint(platform: str) -> str:
    return platform_strategy(platform)


def build_copy_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    brand_name = str(payload.get('brand_name') or '').strip()
    product_description = str(payload.get('product_description') or '').strip()
    if not brand_name or not product_description:
        raise ValueError('brand_name and product_description are required')
    tone = str(payload.get('tone') or 'clear and specific').strip()
    platform = str(payload.get('platform') or 'general').strip()
    asset = resolve_prompt_asset('marketing.copy.system', payload)
    quality_bar = quality_bar_block(asset.quality_bar)
    user_prompt = render_user_prompt(asset, {
        'output_locale_instruction': output_locale_instruction(payload),
        'brand_name': brand_name,
        'product_description': product_description,
        'tone': tone,
        'platform': platform,
        'platform_profile': _platform_hint(platform),
        'quality_bar': quality_bar,
        'response_contract': json_contract_block(asset.schema_hint),
        **context_template_values(payload),
    })

    return [
        {'role': 'system', 'content': asset.system_prompt},
        {'role': 'user', 'content': user_prompt},
    ]


def normalize_copy_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise TypeError('Validated copy provider output must be an object.')

    tone = str(payload.get('tone') or 'clear and specific').strip()
    platform = str(payload.get('platform') or 'general').strip()

    return {
        'title': result['title'],
        'paragraphs': result['paragraphs'],
        'tags': result['tags'],
        'call_to_action': result['call_to_action'],
        'platform': platform,
        'tone': tone,
    }
