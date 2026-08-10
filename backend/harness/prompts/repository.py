from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from hashlib import sha256
from pathlib import Path
from typing import Any, Literal, Mapping

import yaml

from harness.capabilities import CapabilityRegistry, build_capability_registry


PromptKind = Literal['system_prompt', 'generation_prompt', 'style_skill', 'workflow_skill']
PromptRisk = Literal['low', 'medium', 'high']
DEFAULT_PROMPT_LOCALE = 'en-US'


@dataclass(frozen=True, slots=True)
class PromptAsset:
    key: str
    version: str
    locale: str
    kind: PromptKind
    owner: str
    task_type: str
    title: str
    description: str
    output_contract: str
    quality_bar: tuple[str, ...]
    evaluation_profile: str
    risk: PromptRisk = 'medium'
    system_prompt: str = ''
    user_prompt: str = ''
    schema_hint: str = ''
    checksum: str = ''
    is_default: bool = False

    @property
    def template(self) -> str:
        """Compatibility alias for media generation prompt assets."""
        return self.user_prompt

    def render_user(self, values: Mapping[str, object]) -> str:
        rendered = self.user_prompt
        for key, value in values.items():
            rendered = rendered.replace('{{' + key + '}}', str(value or ''))
        rendered = re.sub(r'\{\{[a-zA-Z0-9_]+\}\}', '', rendered)
        return '\n'.join(line.rstrip() for line in rendered.splitlines() if line.strip()).strip()


class PromptRepository:
    def __init__(self, registry: CapabilityRegistry) -> None:
        self._registry = registry

    @lru_cache(maxsize=128)
    def get(
        self,
        key: str,
        *,
        version: str | None = None,
        locale: str | None = None,
    ) -> PromptAsset | None:
        try:
            spec = self._registry.for_prompt(key)
        except Exception:
            return None
        resolved_version = version or spec.default_prompt_version
        resolved_locale = _normalize_locale(locale)
        version_root = spec.prompt_root / resolved_version
        manifest_path = version_root / 'manifest.yaml'
        if not manifest_path.exists() and resolved_locale != DEFAULT_PROMPT_LOCALE:
            resolved_locale = DEFAULT_PROMPT_LOCALE
        if not manifest_path.exists():
            return None
        document = yaml.safe_load(manifest_path.read_text(encoding='utf-8')) or {}
        raw = document.get('prompt') if isinstance(document, dict) else None
        if not isinstance(raw, dict):
            raise RuntimeError(f'Prompt manifest {manifest_path} must contain one prompt object.')
        manifest_locale = _normalize_locale(str(raw.get('locale') or DEFAULT_PROMPT_LOCALE))
        if resolved_locale != manifest_locale:
            resolved_locale = manifest_locale
        system_path = _asset_file(version_root, raw.get('system_file'))
        user_path = _asset_file(version_root, raw.get('user_file'))
        system_prompt = system_path.read_text(encoding='utf-8').strip() if system_path else ''
        user_prompt = user_path.read_text(encoding='utf-8').strip() if user_path else ''
        return _load_asset(
            raw,
            source=manifest_path,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            content_parts=[manifest_path, system_path, user_path],
        )

    def defaults(self) -> dict[str, PromptAsset]:
        assets: dict[str, PromptAsset] = {}
        for spec in self._registry.all():
            asset = self.get(spec.prompt_key)
            if asset is None:
                raise RuntimeError(f'Missing default prompt for {spec.prompt_key}.')
            assets[spec.prompt_key] = asset
        return assets


def _normalize_locale(locale: str | None) -> str:
    raw = (locale or DEFAULT_PROMPT_LOCALE).replace('_', '-').strip()
    if not raw:
        return DEFAULT_PROMPT_LOCALE
    language, _, region = raw.partition('-')
    return f'{language.lower()}-{region.upper()}' if region else language.lower()


def _asset_file(root: Path, value: object) -> Path | None:
    if not value:
        return None
    candidate = (root / str(value)).resolve()
    if candidate.parent != root.resolve():
        raise RuntimeError(f'Prompt asset path escapes version directory: {value}')
    if not candidate.is_file():
        raise RuntimeError(f'Missing prompt asset file: {candidate}')
    return candidate


def _load_asset(
    raw: dict[str, Any],
    *,
    source: Path,
    system_prompt: str,
    user_prompt: str,
    content_parts: list[Path | None],
) -> PromptAsset:
    required = {
        'key', 'version', 'locale', 'kind', 'owner', 'task_type', 'title',
        'description', 'output_contract', 'quality_bar', 'evaluation_profile',
    }
    missing = sorted(required - raw.keys())
    if missing:
        raise RuntimeError(f'Prompt manifest {source} is missing fields: {", ".join(missing)}')
    quality_bar = raw.get('quality_bar')
    if not isinstance(quality_bar, list) or not all(isinstance(item, str) for item in quality_bar):
        raise RuntimeError(f'Prompt manifest {source} quality_bar must be a string list.')
    digest = sha256()
    for path in content_parts:
        if path is not None:
            digest.update(path.read_bytes())
    return PromptAsset(
        key=str(raw['key']),
        version=str(raw['version']),
        locale=_normalize_locale(str(raw['locale'])),
        kind=str(raw['kind']),  # type: ignore[arg-type]
        owner=str(raw['owner']),
        task_type=str(raw['task_type']),
        title=str(raw['title']),
        description=str(raw['description']),
        output_contract=str(raw['output_contract']),
        quality_bar=tuple(quality_bar),
        evaluation_profile=str(raw['evaluation_profile']),
        risk=str(raw.get('risk') or 'medium'),  # type: ignore[arg-type]
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        schema_hint=str(raw.get('schema_hint') or '').strip(),
        checksum=digest.hexdigest(),
        is_default=bool(raw.get('default', False)),
    )


CAPABILITY_REGISTRY = build_capability_registry()
PROMPT_REPOSITORY = PromptRepository(CAPABILITY_REGISTRY)
PROMPT_ASSETS = PROMPT_REPOSITORY.defaults()
PROMPT_VERSIONS = {
    (asset.key, asset.version, asset.locale): asset for asset in PROMPT_ASSETS.values()
}


def get_prompt_asset(
    key: str,
    *,
    version: str | None = None,
    locale: str | None = None,
) -> PromptAsset | None:
    return PROMPT_REPOSITORY.get(key, version=version, locale=locale)


def get_prompt_text(key: str, *, locale: str | None = None, version: str | None = None) -> str:
    asset = get_prompt_asset(key, locale=locale, version=version)
    if not asset or not asset.system_prompt:
        raise KeyError(f'Prompt {key!r} has no system prompt asset.')
    return asset.system_prompt


def get_prompt_schema(key: str, *, locale: str | None = None, version: str | None = None) -> str:
    asset = get_prompt_asset(key, locale=locale, version=version)
    if not asset or not asset.schema_hint:
        raise KeyError(f'Prompt {key!r} has no schema hint asset.')
    return asset.schema_hint


def prompt_registry_snapshot() -> dict[str, dict[str, object]]:
    return {
        key: {
            'version': asset.version,
            'locale': asset.locale,
            'kind': asset.kind,
            'owner': asset.owner,
            'task_type': asset.task_type,
            'title': asset.title,
            'description': asset.description,
            'output_contract': asset.output_contract,
            'quality_bar': list(asset.quality_bar),
            'evaluation_profile': asset.evaluation_profile,
            'risk': asset.risk,
            'checksum': asset.checksum,
        }
        for key, asset in PROMPT_ASSETS.items()
    }
