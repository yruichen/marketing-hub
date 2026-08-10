from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from api.models import Project
from api.services import serialize_asset, serialize_campaign, serialize_project

from harness.adapters.tools.context import ToolContext
from harness.adapters.tools.registry import ToolRegistry, make_tool


class GetProjectArgs(BaseModel):
    project_id: int = Field(description='Project ID in the authenticated organization.')
    include_assets: bool = Field(default=True, description='Include up to ten recent assets.')
    include_campaigns: bool = Field(default=True, description='Include recent campaigns.')


def _get_project(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    project = Project.objects.filter(pk=args['project_id'], organization=ctx.organization).first()
    if project is None:
        return {'found': False, 'error': f"Project id={args['project_id']} was not found."}

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
                'Read one project by ID, optionally including recent campaigns and assets. '
                'Use only for a project in the authenticated organization.'
            ),
            arg_model=GetProjectArgs,
        )(_get_project)
    )
