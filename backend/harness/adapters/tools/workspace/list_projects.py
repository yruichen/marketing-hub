from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from api.models import Project
from api.services import serialize_project

from harness.adapters.tools.context import ToolContext
from harness.adapters.tools.registry import ToolRegistry, make_tool


class ListProjectsArgs(BaseModel):
    limit: int = Field(default=10, ge=1, le=50, description='Maximum number of projects to return.')


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
                'List recent projects in the authenticated organization, including ID, name, status, '
                'channel, and asset count. Use when the user asks which projects they have.'
            ),
            arg_model=ListProjectsArgs,
        )( _list_projects)
    )
