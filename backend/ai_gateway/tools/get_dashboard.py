from __future__ import annotations

from typing import Any

from django.db.models import Count
from pydantic import BaseModel

from api.models import Asset, GenerationTask

from ._base import ToolContext
from .registry import ToolRegistry, make_tool


class GetDashboardArgs(BaseModel):
    pass


def _get_dashboard(ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    org = ctx.organization
    tasks = GenerationTask.objects.filter(organization=org)
    assets = Asset.objects.filter(organization=org)

    by_status = dict(
        tasks.values_list('status').annotate(c=Count('id')).order_by()
    )
    by_type = dict(
        tasks.values_list('task_type').annotate(c=Count('id')).order_by()
    )

    total_cost = sum(
        (t.cost_usd for t in tasks.only('cost_usd')),
        start=0,
    )

    return {
        'organization': org.slug,
        'metrics': {
            'task_count': tasks.count(),
            'tasks_by_status': by_status,
            'tasks_by_type': by_type,
            'asset_count': assets.count(),
            'total_cost_usd': str(total_cost),
        },
    }


def build(registry: ToolRegistry) -> None:
    registry.register(
        make_tool(
            name='get_dashboard',
            description=(
                '查当前组织的仪表盘汇总：任务数 / 任务按状态/类型分布 / 资产数 / 累计成本。'
                '当用户问"我用了多少 token"、"最近跑了几次"、"我的工作台状态"时调用。'
            ),
            arg_model=GetDashboardArgs,
        )(_get_dashboard)
    )
