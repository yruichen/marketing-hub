from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parent / 'catalogs' / '2026-08-10.v1'
DEFAULT_LOCALE = 'en-US'
SUPPORTED_LOCALES = frozenset({'en-US', 'zh-CN'})


def normalize_output_locale(locale: str | None) -> str:
    raw = (locale or '').replace('_', '-').strip().lower()
    if raw.startswith('zh'):
        return 'zh-CN'
    if raw.startswith('en'):
        return 'en-US'
    return DEFAULT_LOCALE


@lru_cache(maxsize=4)
def _catalog(locale: str) -> dict[str, str]:
    path = ROOT / f'{normalize_output_locale(locale)}.yaml'
    document = yaml.safe_load(path.read_text(encoding='utf-8')) or {}
    if not isinstance(document, dict):
        raise RuntimeError(f'Localization catalog {path} must contain an object.')
    return {str(key): str(value) for key, value in document.items()}


def localize(key: str, locale: str | None, **values: object) -> str:
    resolved = normalize_output_locale(locale)
    template = _catalog(resolved).get(key) or _catalog(DEFAULT_LOCALE).get(key)
    if template is None:
        raise KeyError(f'Unknown localized message: {key}')
    return template.format_map({name: str(value) for name, value in values.items()})
