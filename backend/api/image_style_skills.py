"""Compatibility facade for versioned harness image-style knowledge."""

from harness.knowledge import DEFAULT_IMAGE_STYLE_ID, list_image_styles, resolve_image_style

DEFAULT_IMAGE_STYLE_SKILL_ID = DEFAULT_IMAGE_STYLE_ID


def resolve_style_skill(style_skill_id: str | None, legacy_style: str | None = None) -> str:
    return resolve_image_style(style_skill_id, legacy_style)


def list_image_style_skills(locale: str = 'zh-CN') -> list[dict[str, str]]:
    return list_image_styles(locale)
