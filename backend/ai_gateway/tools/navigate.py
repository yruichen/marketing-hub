from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from ._base import ToolContext
from .registry import ToolRegistry, make_tool

# Mirrors frontend's AppSection. Hardcoded here to avoid cross-app import.
NAV_TARGETS = {
    'brainstorm', 'dashboard', 'projects', 'content', 'builder', 'assets',
    'review', 'community', 'profile', 'billing', 'config', 'copy', 'image',
    'storyboard', 'audio',
}


class NavigateArgs(BaseModel):
    tab: Literal[tuple(sorted(NAV_TARGETS))] = Field(  # type: ignore[valid-type]
        description='要跳转到的 tab id',
    )
    project_id: int | None = Field(default=None, description='可选：定位到具体项目')
    asset_id: int | None = Field(default=None, description='可选：定位到资产详情')
    reason: str = Field(default='', description='给用户解释为什么跳转到这里')


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
                '让前端跳转到指定 tab。可选附带 project_id 让前端定位到具体项目。'
                '当用户说"打开我的项目"、"去看资产库"、"跳到工作流"时调用。'
                '此工具不修改任何后端状态，前端会拦截并执行导航。'
            ),
            arg_model=NavigateArgs,
        )(_navigate)
    )
