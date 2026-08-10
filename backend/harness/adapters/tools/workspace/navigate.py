from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from harness.adapters.tools.context import ToolContext
from harness.adapters.tools.registry import ToolRegistry, make_tool

# Mirrors frontend's AppSection. Hardcoded here to avoid cross-app import.
NAV_TARGETS = {
    'brainstorm', 'dashboard', 'projects', 'content', 'builder', 'assets',
    'review', 'community', 'profile', 'billing', 'config', 'copy', 'image',
    'storyboard', 'audio',
}


class NavigateArgs(BaseModel):
    tab: Literal[tuple(sorted(NAV_TARGETS))] = Field(  # type: ignore[valid-type]
        description='Destination application section ID.',
    )
    project_id: int | None = Field(default=None, description='Optional project to focus.')
    asset_id: int | None = Field(default=None, description='Optional asset to focus.')
    reason: str = Field(default='', description='Short user-facing navigation reason.')


def _navigate(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """
    Returns a structured navigation instruction. The frontend `tools.ts`
    handler intercepts this and calls setActiveTab() / navigates() —
    no backend state changes.
    """
    return {
        'kind': 'navigate',
        'tab': args['tab'],
        'project_id': args.get('project_id'),
        'asset_id': args.get('asset_id'),
        'reason': args.get('reason', ''),
    }


def build(registry: ToolRegistry) -> None:
    registry.register(
        make_tool(
            name='navigate',
            description=(
                'Request client-side navigation to a known application section, optionally focused on '
                'a project or asset. This tool does not modify backend state.'
            ),
            arg_model=NavigateArgs,
        )(_navigate)
    )
