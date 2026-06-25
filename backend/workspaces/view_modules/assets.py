from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.audit import record_audit_log
from api.contracts import PLAN_LIMITS
from api.models import (
    Asset,
    Campaign,
    CommunityCreation,
    Folder,
    GenerationTask,
    Organization,
    Project,
    UsageEvent,
    WorkflowTemplate,
    WorkspaceDraft,
)
from api.scope import as_bool, as_list, get_scope, unique_slug
from api.services import (
    get_or_create_default_draft,
    serialize_asset,
    serialize_campaign,
    serialize_folder,
    serialize_organization,
    serialize_project,
    serialize_task,
    serialize_workflow_template,
    serialize_workspace_draft,
)

from workspaces.view_modules.helpers import _get_user_by_username

class WorkspaceAssetsView(APIView):
    """
    组织级资产库列表 + 创建。

    GET：返回 organization 下所有 Asset（不依赖 project_id），可按
         asset_type / project_id / search 过滤。
    POST：手动创建资产（不依赖 task）。前端 AssetsLibrary 用。
    """

    DEFAULT_PAGE_SIZE = 60
    MAX_PAGE_SIZE = 200

    def get(self, request):
        _, org, _, _ = get_scope(request)
        asset_type = request.query_params.get('asset_type')
        project_id = request.query_params.get('project')
        search = (request.query_params.get('search') or '').strip()

        try:
            page = max(1, int(request.query_params.get('page', '1')))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = min(self.MAX_PAGE_SIZE, max(1, int(request.query_params.get('page_size', str(self.DEFAULT_PAGE_SIZE)))))
        except (TypeError, ValueError):
            page_size = self.DEFAULT_PAGE_SIZE

        qs = Asset.objects.filter(organization=org)
        if asset_type:
            qs = qs.filter(asset_type=asset_type)
        if project_id:
            qs = qs.filter(project_id=project_id)
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(tags__icontains=search))

        total = qs.count()
        offset = (page - 1) * page_size
        items = qs.order_by('-created_at')[offset:offset + page_size]

        # 类型分布（不受分页影响，前端可给筛选条加数量徽标）
        type_counts = dict(
            qs.values_list('asset_type').annotate(c=Count('id')).order_by()
        )

        return Response({
            'total': total,
            'page': page,
            'page_size': page_size,
            'has_more': offset + len(items) < total,
            'type_counts': type_counts,
            'items': [serialize_asset(item) for item in items],
        })

    def post(self, request):
        username, org, _, _ = get_scope(request)
        data = request.data or {}

        title = (data.get('title') or '').strip()
        if not title:
            return Response({'detail': 'title 不能为空'}, status=status.HTTP_400_BAD_REQUEST)

        asset_type = data.get('asset_type') or 'document'
        if asset_type not in {choice for choice, _ in Asset.ASSET_TYPES}:
            return Response({'detail': f'asset_type 必须是 {Asset.ASSET_TYPES} 之一'}, status=status.HTTP_400_BAD_REQUEST)

        source_url = (data.get('source_url') or '').strip()[:600]
        tags = data.get('tags') or []
        if not isinstance(tags, list):
            tags = []
        metadata = data.get('metadata') or {}
        if not isinstance(metadata, dict):
            metadata = {}

        # 手动创建时在 metadata 留个标记，方便前端区分"工作流产出 vs 手动"
        metadata.setdefault('source', 'manual')

        project_id = data.get('project_id') or None
        campaign_id = data.get('campaign_id') or None

        # 校验 project / campaign 必须属于 org
        project = None
        if project_id:
            project = Project.objects.filter(pk=project_id, organization=org).first()
            if not project:
                return Response({'detail': 'project_id 无效'}, status=status.HTTP_400_BAD_REQUEST)
        if campaign_id:
            campaign = Campaign.objects.filter(pk=campaign_id, project=project).first() if project else None
            if not campaign:
                return Response({'detail': 'campaign_id 无效或不属于 project'}, status=status.HTTP_400_BAD_REQUEST)

        asset = Asset.objects.create(
            organization=org,
            project=project,
            campaign=campaign,
            asset_type=asset_type,
            title=title[:255],
            source_url=source_url,
            tags=tags,
            metadata=metadata,
        )
        record_audit_log(
            action='asset_create',
            actor=_get_user_by_username(username),
            organization=org,
            target_type='asset',
            target_id=str(asset.id),
            metadata={'asset_type': asset_type, 'source': 'manual'},
        )
        return Response(serialize_asset(asset), status=status.HTTP_201_CREATED)


class WorkspaceAssetDetailView(APIView):
    """单个 Asset 的编辑 + 删除。"""

    def _get(self, pk, org):
        return Asset.objects.filter(pk=pk, organization=org).first()

    def patch(self, request, pk):
        username, org, _, _ = get_scope(request)
        asset = self._get(pk, org)
        if not asset:
            return Response({'detail': '资产不存在'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data or {}
        if 'title' in data:
            new_title = (data.get('title') or '').strip()
            if not new_title:
                return Response({'detail': 'title 不能为空'}, status=status.HTTP_400_BAD_REQUEST)
            asset.title = new_title[:255]
        if 'source_url' in data:
            asset.source_url = (data.get('source_url') or '').strip()[:600]
        if 'tags' in data:
            tags = data.get('tags') or []
            asset.tags = tags if isinstance(tags, list) else []
        if 'metadata' in data:
            metadata = data.get('metadata') or {}
            asset.metadata = metadata if isinstance(metadata, dict) else {}
        if 'asset_type' in data:
            new_type = data.get('asset_type')
            if new_type in {choice for choice, _ in Asset.ASSET_TYPES}:
                asset.asset_type = new_type

        asset.save()
        record_audit_log(
            action='asset_update',
            actor=_get_user_by_username(username),
            organization=org,
            target_type='asset',
            target_id=str(asset.id),
            metadata={'updated_fields': list(data.keys())},
        )
        return Response(serialize_asset(asset))

    def delete(self, request, pk):
        username, org, _, _ = get_scope(request)
        asset = self._get(pk, org)
        if not asset:
            return Response({'detail': '资产不存在'}, status=status.HTTP_404_NOT_FOUND)
        asset_id = asset.id
        asset_type = asset.asset_type
        asset.delete()
        record_audit_log(
            action='asset_delete',
            actor=_get_user_by_username(username),
            organization=org,
            target_type='asset',
            target_id=str(asset_id),
            metadata={'asset_type': asset_type},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
