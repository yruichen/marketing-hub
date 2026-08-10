from __future__ import annotations

from typing import Any

from harness.prompts import get_prompt_schema, get_prompt_text
from harness.capabilities._shared import (
    context_template_values,
    compact_text,
    json_contract_block,
    platform_strategy,
    quality_bar_block,
    output_locale_instruction,
    render_user_prompt,
    resolve_prompt_asset,
)

REVIEW_SYSTEM_PROMPT = get_prompt_text('marketing.review.system')
REVIEW_JSON_SCHEMA_HINT = get_prompt_schema('marketing.review.system')


def build_review_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    title = str(payload.get('content_title') or payload.get('title') or '').strip()
    body = str(payload.get('content_body') or payload.get('product_description') or '').strip()
    tags = payload.get('tags') or []
    forbidden_words = str(payload.get('forbidden_words') or '').strip()
    channel_rules = str(payload.get('channel_rules') or '').strip()
    platform = str(payload.get('platform') or 'general').strip()
    tag_text = ', '.join(str(t) for t in tags) if isinstance(tags, list) else str(tags)
    asset = resolve_prompt_asset('marketing.review.system', payload)
    quality_bar = quality_bar_block(asset.quality_bar)
    user_prompt = render_user_prompt(asset, {
        'output_locale_instruction': output_locale_instruction(payload),
        'title': title or 'Not supplied',
        'body': compact_text(body or 'Not supplied', max_chars=4000),
        'tags': tag_text or 'None supplied',
        'platform': platform,
        'platform_profile': platform_strategy(platform),
        'forbidden_words': forbidden_words or 'None supplied',
        'channel_rules': channel_rules or 'None supplied',
        'quality_bar': quality_bar,
        'response_contract': json_contract_block(asset.schema_hint),
        **context_template_values(
            payload,
            context_label='Brand context',
            feedback_label='Additional review requirements',
        ),
    })

    return [
        {'role': 'system', 'content': asset.system_prompt},
        {'role': 'user', 'content': user_prompt},
    ]


def normalize_review_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        raise TypeError('Validated review provider output must be an object.')

    return {
        'passed': result['passed'],
        'brand_consistency_score': result['brand_consistency_score'],
        'sensitive_word_issues': result['sensitive_word_issues'],
        'channel_rule_issues': result['channel_rule_issues'],
        'summary': result['summary'],
        'revised_suggestions': result['revised_suggestions'],
    }
