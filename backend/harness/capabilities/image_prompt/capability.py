from __future__ import annotations

from typing import Any

from harness.capabilities._shared import (
    compact_text,
    context_template_values,
    json_contract_block,
    output_locale_instruction,
    platform_strategy,
    quality_bar_block,
    render_user_prompt,
    resolve_prompt_asset,
)
from harness.prompts import get_prompt_schema, get_prompt_text


IMAGE_PROMPT_SYSTEM_PROMPT = get_prompt_text('marketing.image_prompt.system')
IMAGE_PROMPT_JSON_SCHEMA_HINT = get_prompt_schema('marketing.image_prompt.system')


def build_image_prompt_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    subject = str(payload.get('subject') or payload.get('product_description') or '').strip()
    brand_name = str(payload.get('brand_name') or '').strip()
    style_text = str(payload.get('style') or '').strip()
    style_skill_id = str(payload.get('style_skill') or '').strip()
    aspect_ratio = str(payload.get('aspect_ratio') or '1:1').strip()
    platform = str(payload.get('platform') or 'general').strip()
    negative_prompt = str(payload.get('negative_prompt') or '').strip()
    upstream_text = str(payload.get('upstream_text') or '').strip()
    asset = resolve_prompt_asset('marketing.image_prompt.system', payload)
    quality_bar = quality_bar_block(asset.quality_bar)
    context_values = context_template_values(payload)
    user_prompt = render_user_prompt(asset, {
        'output_locale_instruction': output_locale_instruction(payload),
        'brand_name': brand_name,
        'subject': subject or upstream_text,
        'style_text': style_text,
        'style_skill_context': f'- Visual style skill ID: {style_skill_id}' if style_skill_id else '',
        'aspect_ratio': aspect_ratio,
        'platform': platform,
        'platform_profile': platform_strategy(platform),
        'quality_bar': quality_bar,
        'response_contract': json_contract_block(asset.schema_hint),
        'negative_context': f'- Explicit exclusions: {negative_prompt}' if negative_prompt else '',
        'upstream_context': (
            f'- Upstream content reference: {compact_text(upstream_text, max_chars=2000)}'
            if upstream_text and upstream_text != subject else ''
        ),
        'workflow_context': context_values['workflow_context'],
        'feedback': context_values['feedback'],
    })
    return [
        {'role': 'system', 'content': asset.system_prompt},
        {'role': 'user', 'content': user_prompt},
    ]


def normalize_image_prompt_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise TypeError('Validated image-prompt provider output must be an object.')
    style_skill = str(payload.get('style_skill') or '').strip()
    style_text = str(payload.get('style') or result.get('style') or '').strip()
    aspect_ratio = str(payload.get('aspect_ratio') or result.get('aspect_ratio') or '1:1').strip()
    negative_prompt = str(result['negative_prompt'] or payload.get('negative_prompt') or '').strip()
    prompt = str(result['prompt']).strip()
    prompt_localized = str(result['prompt_localized']).strip()
    default_negatives = (
        'low quality, blurry, watermark, logo-like random text, distorted anatomy, '
        'extra fingers, cluttered layout'
    )
    if negative_prompt:
        if default_negatives not in negative_prompt:
            negative_prompt = f'{negative_prompt}, {default_negatives}'
    else:
        negative_prompt = default_negatives
    return {
        'prompt': prompt,
        'prompt_localized': prompt_localized,
        'prompt_zh': prompt_localized,
        'negative_prompt': negative_prompt,
        'aspect_ratio': aspect_ratio,
        'style_skill': style_skill,
        'style': style_text,
        'composition_notes': str(result['composition_notes']).strip(),
    }
