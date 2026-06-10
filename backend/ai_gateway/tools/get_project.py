from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from api.models import Project
from api.services import serialize_asset, serialize_campaign, serialize_project

from ._base import ToolContext
from .registry import ToolRegistry, make_tool


class GetProjectArgs(BaseModel):
    project_id: int = Field(description='项目 id')
    include_assets: bool = Field(default=True, description='是否包含最近 10 条资产')
    include_campaigns: bool = Field(default=True, description='是否包含活动列表')


def _get_project(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    project = Project.objects.filter(pk=args['project_id'], organization=ctx.organization).first()
    if project is None:
        return {'found': False, 'error': f"找不到项目 id={args['project_id']}"}

    payload: dict[str, Any] = {'found': True, 'project': serialize_project(project)}
    if args['include_campaigns']:
        campaigns = list(project.campaigns.order_by('-created_at')[:10])
        payload['campaigns'] = [serialize_campaign(c) for c in campaigns]
    if args['include_assets']:
        assets = list(project.assets.order_by('-created_at')[:10])
        payload['assets'] = [serialize_asset(a) for a in assets]
    return payload


def build(registry: ToolRegistry) -> None:
    registry.register(
        make_tool(
            name='get_project',
            description=(
                '按 id 查一个项目的详情，包括最近的活动和资产。'
                '当用户说"打开第 N 个项目"、"那个营销 A 项目的资产"时调用。'
            ),
            arg_model=GetProjectArgs,
        )(_get_project)
    )
