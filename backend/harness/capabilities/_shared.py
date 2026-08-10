from __future__ import annotations

import json
import re
from typing import Any

from harness.knowledge import channel_profile
from harness.prompts import PromptAsset, get_prompt_asset

DEFAULT_OUTPUT_LOCALE = 'zh-CN'


def output_locale_instruction(payload: dict[str, Any]) -> str:
    locale = str(payload.get('output_locale') or payload.get('locale') or DEFAULT_OUTPUT_LOCALE).strip()
    return (
        f'Output locale: {locale}. Write all human-facing content in this locale. '
        'Keep machine identifiers, schema keys, and model-specific image prompts unchanged.'
    )


def resolve_prompt_asset(key: str, payload: dict[str, Any]) -> PromptAsset:
    asset = get_prompt_asset(
        key,
        version=str(payload.get('prompt_version') or '') or None,
        locale=str(payload.get('prompt_locale') or '') or None,
    )
    if asset is None:
        raise KeyError(f'Unknown prompt asset or version: {key}')
    return asset


def _strip_json_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\s*```$', '', cleaned)
    return cleaned.strip()


def compact_text(value: Any, *, max_chars: int = 1200) -> str:
    if value in (None, '', [], {}):
        return ''
    if isinstance(value, str):
        text = value.strip()
    else:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) <= max_chars:
        return text
    return f'{text[:max_chars].rstrip()}...'


def compact_json(value: Any, *, max_chars: int = 1600) -> str:
    if value in (None, '', [], {}):
        return ''
    if isinstance(value, str):
        text = value.strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return compact_text(text, max_chars=max_chars)
        return compact_json(parsed, max_chars=max_chars)
    return compact_text(value, max_chars=max_chars)


def append_context_lines(lines: list[str], payload: dict[str, Any], *, label: str = 'Workflow and brand context') -> None:
    context = compact_json(payload.get('workflow_context') or payload.get('brand_context'), max_chars=1800)
    if context:
        lines.append(f'- {label}: {context}')

    upstream = compact_text(payload.get('upstream_text'), max_chars=1600)
    if upstream:
        lines.append(f'- Upstream content summary: {upstream}')


def append_feedback_line(lines: list[str], feedback: str, *, label: str = 'Revision feedback') -> None:
    cleaned = compact_text(feedback, max_chars=1000)
    if cleaned:
        lines.append(
            f'- {label} (higher priority than default style, but subordinate to factual, '
            f'privacy, compliance, and schema constraints): {cleaned}'
        )


def context_template_values(
    payload: dict[str, Any],
    *,
    context_label: str = 'Workflow and brand context',
    feedback_label: str = 'Revision feedback',
) -> dict[str, str]:
    context = compact_json(payload.get('workflow_context') or payload.get('brand_context'), max_chars=1800)
    upstream = compact_text(payload.get('upstream_text'), max_chars=1600)
    feedback = compact_text(payload.get('feedback'), max_chars=1000)
    return {
        'workflow_context': f'- {context_label}: {context}' if context else '',
        'upstream_context': f'- Upstream content summary: {upstream}' if upstream else '',
        'feedback': (
            f'- {feedback_label} (higher priority than default style, but subordinate to factual, '
            f'privacy, compliance, and schema constraints): {feedback}'
            if feedback else ''
        ),
    }


def render_user_prompt(asset: PromptAsset, values: dict[str, object]) -> str:
    if not asset.user_prompt:
        raise KeyError(f'Prompt {asset.key!r} has no user prompt asset.')
    return asset.render_user(values)


def json_contract_block(schema_hint: str) -> str:
    return (
        'Response contract: return exactly one parseable JSON object with no Markdown or surrounding commentary. '
        'Use empty values when optional information is unavailable; never add undeclared top-level prose.\n'
        f'JSON shape:\n{schema_hint}'
    )


def quality_bar_block(items: list[str] | tuple[str, ...]) -> str:
    return 'Internal quality gate (apply silently; do not output the checklist):\n' + '\n'.join(
        f'{index}. {item}' for index, item in enumerate(items, 1)
    )


def fact_guardrail_block() -> str:
    return (
        'Evidence boundary: use only supplied facts or faithful summaries. Do not invent prices, sales, '
        'certifications, medical effects, awards, testimonials, partnerships, or platform policies. '
        'When information is missing, use qualified language instead of definitive claims.'
    )


def platform_strategy(platform: str) -> str:
    return channel_profile(platform)
