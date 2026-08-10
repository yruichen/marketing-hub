from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parent
KNOWLEDGE_VERSION = '2026-08-10.v1'
DEFAULT_IMAGE_STYLE_ID = 'editorial_magazine'


@lru_cache(maxsize=8)
def _load(relative: str) -> dict[str, Any]:
    path = ROOT / relative / KNOWLEDGE_VERSION / 'profiles.yaml'
    document = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
    if not isinstance(document, dict):
        raise RuntimeError(f'Knowledge asset {path} must contain an object.')
    return document


def resolve_image_style(style_id: str | None, legacy_style: str | None = None) -> str:
    styles = _load('image_styles').get('styles') or {}
    resolved_id = (style_id or '').strip() or DEFAULT_IMAGE_STYLE_ID
    entry = styles.get(resolved_id) if isinstance(styles, dict) else None
    if isinstance(entry, dict) and entry.get('prompt'):
        return str(entry['prompt'])
    if legacy_style and str(legacy_style).strip():
        return str(legacy_style).strip()
    return str(styles[DEFAULT_IMAGE_STYLE_ID]['prompt'])


def list_image_styles(locale: str = 'zh-CN') -> list[dict[str, str]]:
    styles = _load('image_styles').get('styles') or {}
    result: list[dict[str, str]] = []
    for style_id, entry in styles.items():
        labels = entry.get('labels') if isinstance(entry, dict) else {}
        label = labels.get(locale) or labels.get('en-US') or style_id
        result.append({'id': style_id, 'label': str(label), 'skill': str(entry.get('prompt') or '')})
    return result


def channel_profile(channel: str) -> str:
    raw = (channel or '').strip()
    profiles = _load('channels').get('channels') or {}
    aliases = _load('channels').get('aliases') or {}
    profile_id = aliases.get(raw.lower()) or aliases.get(raw) or raw.lower()
    entry = profiles.get(profile_id) if isinstance(profiles, dict) else None
    if isinstance(entry, dict):
        return f"{entry['label']} channel profile: {entry['prompt']}"
    return (
        f'{raw or "General social channel"} profile: adapt headline, structure, tags, pacing, '
        'and call to action to known user behavior for that channel. Do not invent channel policies.'
    )


def assistant_tool_hints() -> dict[str, tuple[str, ...]]:
    hints = _load('assistant').get('tool_hints') or {}
    return {
        str(tool): tuple(str(token).lower() for token in tokens)
        for tool, tokens in hints.items()
        if isinstance(tokens, list)
    }
