from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.access import (
    get_folder_for_member,
    get_organization_for_member,
    get_project_for_member,
    require_role,
)
from api.audit import record_audit_log
from api.entitlements import effective_limits_for_scope
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

from workspaces.view_modules.helpers import folder_path_from_request, build_project_search_query

class FolderCollectionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        organization_slug = request.query_params.get('organization')
        trash = request.query_params.get('trash') == 'true'
        deleted_filter = {'deleted_at__isnull': False} if trash else {'deleted_at__isnull': True}
        query = Folder.objects.select_related('organization', 'parent').filter(
            organization__memberships__user=request.user,
            **deleted_filter,
        ).annotate(project_count=Count('projects', distinct=True), asset_count=Count('assets', distinct=True)).order_by('parent_id', 'sort_order', 'name')
        if organization_slug:
            query = query.filter(organization__slug=organization_slug)
        return Response([serialize_folder(item) for item in query])

    def post(self, request):
        org_slug = request.data.get('organization')
        org = get_organization_for_member(request.user, slug=org_slug)
        require_role(request.user, org, 'creator')
        parent = Folder.objects.filter(pk=request.data.get('parent_id'), organization=org).first() if request.data.get('parent_id') else None
        name = request.data.get('name', 'Untitled Folder').strip()
        folder = Folder.objects.create(
            organization=org,
            parent=parent,
            name=name,
            slug=slugify(request.data.get('slug') or name or 'folder'),
            sort_order=int(request.data.get('sort_order') or 0),
            permission_scope=request.data.get('permission_scope', 'workspace'),
            is_archived=as_bool(request.data.get('is_archived', False), default=False),
        )
        return Response(serialize_folder(folder), status=status.HTTP_201_CREATED)


class FolderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk: int):
        folder = get_folder_for_member(request.user, pk)
        require_role(request.user, folder.organization, 'creator')
        if 'name' in request.data:
            folder.name = request.data.get('name', folder.name)
        if 'slug' in request.data:
            folder.slug = slugify(request.data.get('slug') or folder.slug)
        if 'parent_id' in request.data:
            parent = Folder.objects.filter(pk=request.data.get('parent_id'), organization=folder.organization).first()
            folder.parent = parent
        if 'sort_order' in request.data:
            folder.sort_order = int(request.data.get('sort_order') or 0)
        if 'permission_scope' in request.data:
            folder.permission_scope = request.data.get('permission_scope') or folder.permission_scope
        if 'is_archived' in request.data:
            folder.is_archived = as_bool(request.data.get('is_archived'), default=folder.is_archived)
        folder.save()
        return Response(serialize_folder(folder))

    def delete(self, request, pk: int):
        folder = get_folder_for_member(request.user, pk)
        require_role(request.user, folder.organization, 'creator')
        user = request.user
        record_audit_log(
            action='folder_delete',
            actor=user,
            organization=folder.organization,
            target_type='folder',
            target_id=str(folder.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        permanent = request.query_params.get('permanent') == 'true'
        if permanent or folder.deleted_at:
            # Hard delete if already soft-deleted or permanent flag is set
            folder.delete()
        else:
            from django.utils import timezone
            folder.deleted_at = timezone.now()
            folder.save(update_fields=['deleted_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def restore(self, request, pk: int):
        """Restore a soft-deleted folder."""
        folder = get_folder_for_member(request.user, pk)
        require_role(request.user, folder.organization, 'creator')
        if not folder.deleted_at:
            return Response({'detail': 'Folder is not deleted.'}, status=status.HTTP_400_BAD_REQUEST)
        folder.deleted_at = None
        folder.save(update_fields=['deleted_at'])
        return Response(serialize_folder(folder))


class ProjectCollectionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        organization_slug = request.query_params.get('organization')
        folder = request.query_params.get('folder')
        platform = request.query_params.get('platform')
        status_tag = request.query_params.get('status')
        search = request.query_params.get('q')
        trash = request.query_params.get('trash') == 'true'
        deleted_filter = {'deleted_at__isnull': False} if trash else {'deleted_at__isnull': True}
        query = Project.objects.select_related('organization', 'folder').filter(
            organization__memberships__user=request.user,
            **deleted_filter,
        ).order_by('-created_at')
        if organization_slug:
            query = query.filter(organization__slug=organization_slug)
        if folder is not None:
            query = query.filter(Q(folder_path=folder) | Q(folder__id=folder))
        if platform:
            query = query.filter(platform_tags__contains=[platform])
        if status_tag:
            query = query.filter(status_tag=status_tag)
        if search:
            query = query.filter(build_project_search_query(search))
        return Response([
            {
                **serialize_project(project),
                'campaign_count': project.campaigns.count(),
                'asset_count': project.assets.count(),
                'draft_count': project.workspace_drafts.count(),
                'template_count': project.workflow_templates.count(),
                'pending_review_count': project.workspace_drafts.filter(status__in=['draft', 'running']).count(),
                'latest_generation_status': project.generation_tasks.first().status if project.generation_tasks.exists() else '',
                'recent_activity_at': max(project.updated_at, project.created_at).isoformat() if project.created_at else '',
                'total_cost_usd': str(
                    project.usage_events.aggregate(value=Sum('cost_usd'))['value'] or Decimal('0')
                ),
            }
            for project in query
        ])

    def post(self, request):
        org_slug = request.data.get('organization')
        org = get_organization_for_member(request.user, slug=org_slug)
        require_role(request.user, org, 'creator')

        plan = effective_limits_for_scope(request.user, org)
        active_project_count = Project.objects.filter(organization=org, is_archived=False).count()
        if active_project_count >= plan['project_limit']:
            return Response(
                {'error': f'当前方案最多可创建 {plan["project_limit"]} 个项目，请升级订阅或归档旧项目。'},
                status=status.HTTP_402_PAYMENT_REQUIRED,
            )

        name = request.data.get('name', 'Untitled Project').strip()
        slug = unique_slug(Project, request.data.get('slug') or name, organization=org)
        project = Project.objects.create(
            organization=org,
            name=name,
            slug=slug,
            brief=request.data.get('brief', ''),
            brand_context=request.data.get('brand_context', {}) if isinstance(request.data.get('brand_context', {}), dict) else {},
            folder=folder_path_from_request(request, org),
            folder_path=request.data.get('folder_path', ''),
            platform_tags=as_list(request.data.get('platform_tags', [])),
            status_tag=request.data.get('status_tag', 'creating'),
            sort_order=int(request.data.get('sort_order') or 0),
            is_archived=as_bool(request.data.get('is_archived', False), default=False),
        )
        return Response(serialize_project(project), status=status.HTTP_201_CREATED)


class ProjectDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        project = get_project_for_member(request.user, pk)
        return Response({
            **serialize_project(project),
            'campaigns': [serialize_campaign(item) for item in project.campaigns.order_by('-created_at')],
            'drafts': [serialize_workspace_draft(item) for item in project.workspace_drafts.order_by('-updated_at')],
            'templates': [serialize_workflow_template(item) for item in project.workflow_templates.order_by('-created_at')],
            'assets': [serialize_asset(item) for item in project.assets.order_by('-created_at')[:20]],
        })

    def patch(self, request, pk: int):
        project = get_project_for_member(request.user, pk)
        require_role(request.user, project.organization, 'creator')
        if 'name' in request.data:
            project.name = request.data.get('name') or project.name
        if 'slug' in request.data:
            project.slug = unique_slug(Project, request.data.get('slug'), exclude_pk=project.id, organization=project.organization)
        if 'brief' in request.data:
            project.brief = request.data.get('brief', project.brief)
        if 'brand_context' in request.data and isinstance(request.data.get('brand_context'), dict):
            project.brand_context = request.data['brand_context']
        if 'folder_path' in request.data:
            project.folder_path = request.data.get('folder_path') or ''
        if 'folder_id' in request.data:
            project.folder = Folder.objects.filter(pk=request.data.get('folder_id'), organization=project.organization).first()
        if 'platform_tags' in request.data:
            project.platform_tags = as_list(request.data.get('platform_tags'))
        if 'status_tag' in request.data:
            project.status_tag = request.data.get('status_tag') or project.status_tag
        if 'sort_order' in request.data:
            project.sort_order = int(request.data.get('sort_order') or 0)
        if 'is_archived' in request.data:
            project.is_archived = as_bool(request.data.get('is_archived'), default=project.is_archived)
        project.save()
        return Response(serialize_project(project))

    def delete(self, request, pk: int):
        project = get_project_for_member(request.user, pk)
        require_role(request.user, project.organization, 'creator')
        user = request.user
        record_audit_log(
            action='project_delete',
            actor=user,
            organization=project.organization,
            target_type='project',
            target_id=str(project.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        from django.utils import timezone
        project.deleted_at = timezone.now()
        project.save(update_fields=['deleted_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def restore(self, request, pk: int):
        """Restore a soft-deleted project."""
        project = get_project_for_member(request.user, pk)
        require_role(request.user, project.organization, 'creator')
        if not project.deleted_at:
            return Response({'detail': 'Project is not deleted.'}, status=status.HTTP_400_BAD_REQUEST)
        project.deleted_at = None
        project.save(update_fields=['deleted_at'])
        return Response(serialize_project(project))


class FolderRestoreView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int):
        folder = get_folder_for_member(request.user, pk)
        require_role(request.user, folder.organization, 'creator')
        if not folder.deleted_at:
            return Response({'detail': 'Folder is not deleted.'}, status=status.HTTP_400_BAD_REQUEST)
        folder.deleted_at = None
        folder.save(update_fields=['deleted_at'])
        return Response(serialize_folder(folder))


class ProjectRestoreView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk: int):
        project = get_project_for_member(request.user, pk)
        require_role(request.user, project.organization, 'creator')
        if not project.deleted_at:
            return Response({'detail': 'Project is not deleted.'}, status=status.HTTP_400_BAD_REQUEST)
        project.deleted_at = None
        project.save(update_fields=['deleted_at'])
        return Response(serialize_project(project))
