"""Deprecated prompt catalog compatibility facade.

Prompt assets now live with their owning capability under ``harness.capabilities``.
New code must import from ``harness.prompts``.
"""

from harness.prompts.repository import (
    DEFAULT_PROMPT_LOCALE,
    PROMPT_ASSETS,
    PROMPT_VERSIONS,
    PromptAsset,
    get_prompt_asset,
    get_prompt_schema,
    get_prompt_text,
    prompt_registry_snapshot,
)

__all__ = [
    'DEFAULT_PROMPT_LOCALE',
    'PROMPT_ASSETS',
    'PROMPT_VERSIONS',
    'PromptAsset',
    'get_prompt_asset',
    'get_prompt_schema',
    'get_prompt_text',
    'prompt_registry_snapshot',
]
