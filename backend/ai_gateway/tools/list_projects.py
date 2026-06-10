from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from api.models import Project
from api.services import serialize_project

from ._base import ToolContext
from .registry import ToolRegistry, make_tool


class ListProjectsArgs(BaseModel):
    limit: int = Field(default=10, ge=1, le=50, description='最多返回多少个项目')


def _list_projects(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Sync ORM. ToolSpec.invoke wraps via sync_to_async when called from async."""
    projects = Project.objects.filter(organization=ctx.organization).order_by('-created_at')[: args['limit']]
    return {
        'count': len(projects),
        'projects': [serialize_project(p) for p in projects],
    }


def build(registry: ToolRegistry) -> None:
    registry.register(
        make_tool(
            name='list_projects',
            description=(
                '列出当前用户组织下最近的项目。返回 id / 名称 / 状态 / 平台 / 资产数。'
                '当用户问"我最近的项目"、"有什么项目"、"列出项目"时调用。'
            ),
            arg_model=ListProjectsArgs,
        )( _list_projects)
    )
