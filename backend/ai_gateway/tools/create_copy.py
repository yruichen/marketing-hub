from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from api.models import Project
from api.services import create_generation_task, queue_generation_task, serialize_task

from ._base import ToolContext
from .registry import ToolRegistry, make_tool


class CreateCopyArgs(BaseModel):
    brand_name: str = Field(default='Marketing-Hub', description='品牌名')
    product_description: str = Field(
        default='AI 营销场景全能助手，秒级生成爆款图文',
        description='产品/服务描述',
    )
    tone: str = Field(default='爆款活泼', description='文案语气')
    platform: str = Field(default='Xiaohongshu', description='目标平台')
    project_id: Optional[int] = Field(default=None, description='可选：关联到哪个项目')
    async_run: bool = Field(default=True, description='True=异步任务（推荐）')


def _create_copy(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    project = None
    if args.get('project_id') is not None:
        project = Project.objects.filter(pk=args['project_id'], organization=ctx.organization).first()
        if project is None:
            return {'ok': False, 'error': f"项目 id={args['project_id']} 不存在"}

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
        'message': (
            '文案生成任务已创建（异步），前端可在生成 tab 看到结果。'
            if args['async_run']
            else '文案已生成（同步）。'
        ),
    }


def build(registry: ToolRegistry) -> None:
    registry.register(
        make_tool(
            name='create_copy',
            description=(
                '生成一段营销文案。默认异步（async_run=true），返回 task_id。'
                '当用户说"帮我写一段文案"、"生成一段小红书爆款"、"写个抖音标题"时调用。'
            ),
            arg_model=CreateCopyArgs,
        )(_create_copy)
    )
