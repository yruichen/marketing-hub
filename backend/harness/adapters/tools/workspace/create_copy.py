from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from api.models import Project
from api.services import create_generation_task, queue_generation_task, serialize_task

from harness.adapters.tools.context import ToolContext
from harness.adapters.tools.registry import ToolRegistry, make_tool


class CreateCopyArgs(BaseModel):
    brand_name: str = Field(min_length=1, description='Brand or product name.')
    product_description: str = Field(min_length=1, description='Evidence-backed product or service description.')
    tone: str = Field(default='clear and specific', description='Requested copy tone.')
    platform: str = Field(default='general', description='Target distribution channel.')
    project_id: Optional[int] = Field(default=None, description='Optional project ID in the current organization.')
    async_run: bool = Field(default=True, description='Queue asynchronously when true.')


def _create_copy(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    project = None
    if args.get('project_id') is not None:
        project = Project.objects.filter(pk=args['project_id'], organization=ctx.organization).first()
        if project is None:
            return {'ok': False, 'error': f"Project id={args['project_id']} was not found."}

    task = create_generation_task(
        task_type='copy',
        payload={
            'brand_name': args['brand_name'],
            'product_description': args['product_description'],
            'tone': args['tone'],
            'platform': args['platform'],
        },
        username=ctx.user.username if ctx.user else None,
        organization=ctx.organization,
        project=project,
        campaign=None,
        run_now=not args['async_run'],
    )
    if args['async_run']:
        queue_generation_task(task)
    return {
        'ok': True,
        'task_id': task.id,
        'status': task.status,
        'task': serialize_task(task),
        'message': 'Copy generation was queued.' if args['async_run'] else 'Copy generation completed.',
    }


def build(registry: ToolRegistry) -> None:
    registry.register(
        make_tool(
            name='create_copy',
            description=(
                'Create a marketing-copy generation task and return its task ID. '
                'Use only when the user explicitly asks to generate copy.'
            ),
            arg_model=CreateCopyArgs,
        )(_create_copy)
    )
