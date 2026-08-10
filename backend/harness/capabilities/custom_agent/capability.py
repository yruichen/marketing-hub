from __future__ import annotations

from typing import Any

from harness.prompts import get_prompt_schema, get_prompt_text
from harness.capabilities._shared import (
    compact_text,
    context_template_values,
    json_contract_block,
    quality_bar_block,
    output_locale_instruction,
    render_user_prompt,
    resolve_prompt_asset,
)

CUSTOM_AGENT_SYSTEM_PROMPT = get_prompt_text('marketing.custom_agent.system')
CUSTOM_AGENT_JSON_SCHEMA_HINT = get_prompt_schema('marketing.custom_agent.system')


def build_custom_agent_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    custom_prompt = str(payload.get('prompt') or payload.get('instruction') or '').strip()
    upstream_text = str(payload.get('upstream_text') or '').strip()
    brand_context = str(payload.get('brand_context') or '').strip()
    name = str(payload.get('name') or 'Custom agent').strip()

    asset = resolve_prompt_asset('marketing.custom_agent.system', payload)
    quality_bar = quality_bar_block(asset.quality_bar)
    context_values = context_template_values(payload)
    user_prompt = render_user_prompt(asset, {
        'output_locale_instruction': output_locale_instruction(payload),
        'name': name,
        'task_definition': custom_prompt,
        'quality_bar': quality_bar,
        'response_contract': json_contract_block(asset.schema_hint),
        'upstream_context': (
            f'- Upstream node outputs:\n{compact_text(upstream_text, max_chars=3000)}'
            if upstream_text else ''
        ),
        'brand_context': (
            f'- Brand context:\n{compact_text(brand_context, max_chars=1800)}'
            if brand_context else ''
        ),
        'feedback': context_values['feedback'],
    })

    return [
        {'role': 'system', 'content': asset.system_prompt},
        {'role': 'user', 'content': user_prompt},
    ]


def normalize_custom_agent_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise TypeError('Validated custom-agent provider output must be an object.')

    return {
        'response': result['response'],
        'metadata': result['metadata'],
    }
