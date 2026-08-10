from __future__ import annotations

from typing import Any

from harness.prompts import get_prompt_asset
from harness.knowledge import resolve_image_style
from harness.capabilities._shared import (
    compact_text,
    platform_strategy,
)

ASPECT_RATIO_SIZE_MAP = {
    '1:1': '1024x1024',
    '4:5': '768x1024',
    '9:16': '768x1024',
    '16:9': '1024x768',
    '3:4': '768x1024',
    '4:3': '1024x768',
}


def aspect_ratio_to_size(aspect_ratio: str) -> str:
    key = (aspect_ratio or '1:1').strip()
    return ASPECT_RATIO_SIZE_MAP.get(key, '1024x1024')


def build_image_generation_prompt(payload: dict[str, Any]) -> str:
    user_prompt = str(payload.get('prompt') or '').strip()
    if not user_prompt:
        raise ValueError('prompt is required')
    style_skill = payload.get('style_skill')
    legacy_style = payload.get('style')
    style = resolve_image_style(style_skill, legacy_style) if (style_skill or legacy_style) else ''
    aspect_ratio = str(payload.get('aspect_ratio') or payload.get('aspectRatio') or '1:1').strip()
    platform = str(payload.get('platform') or '').strip()
    negative_prompt = str(payload.get('negative_prompt') or '').strip()

    workflow_context = compact_text(payload.get('workflow_context'), max_chars=700)
    image_asset = get_prompt_asset(
        'marketing.image.system',
        version=str(payload.get('prompt_version') or '') or None,
        locale=str(payload.get('prompt_locale') or '') or None,
    )
    if image_asset is None:
        raise KeyError('Unknown image generation prompt asset or version.')
    return image_asset.render_user({
        'core_prompt': user_prompt,
        'style_context': f'Visual style guide: {style}' if style else '',
        'platform_context': (
            f'Use case: social marketing key visual for {platform}; {platform_strategy(platform)}'
            if platform else ''
        ),
        'workflow_context': f'Brand context: {workflow_context}' if workflow_context else '',
        'aspect_ratio': aspect_ratio,
        'negative_context': f'Negative prompt: {negative_prompt}' if negative_prompt else '',
    })


def normalize_image_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        result = {}

    aspect_ratio = str(
        payload.get('aspect_ratio') or payload.get('aspectRatio') or result.get('aspect_ratio') or '1:1'
    ).strip()
    prompt = str(payload.get('prompt') or result.get('prompt') or '').strip()
    style = str(payload.get('style') or result.get('style') or '').strip()
    revised_prompt = str(result.get('revised_prompt') or build_image_generation_prompt(payload)).strip()
    image_url = str(result.get('image_url') or result.get('url') or '').strip()

    if not image_url and isinstance(result.get('data'), list) and result['data']:
        first = result['data'][0]
        if isinstance(first, dict):
            image_url = str(first.get('url') or '').strip()

    return {
        'prompt': prompt,
        'style': style,
        'aspect_ratio': aspect_ratio,
        'aspectRatio': aspect_ratio,
        'image_url': image_url,
        'revised_prompt': revised_prompt,
        'generated_images': int(result.get('generated_images') or (1 if image_url else 0)),
    }
