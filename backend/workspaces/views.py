from decimal import Decimal

from django.contrib.auth.models import User
from django.db.models import Count, Q, Sum
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


def folder_path_from_request(request, org: Organization) -> Folder | None:
    folder_id = request.data.get('folder_id')
    if folder_id:
        return Folder.objects.filter(pk=folder_id, organization=org).first()

    folder_path = str(request.data.get('folder_path') or '').strip().strip('/')
    if not folder_path:
        return None

    parent = None
    for index, raw_name in enumerate(part for part in folder_path.split('/') if part.strip()):
        name = raw_name.strip()
        slug = slugify(name) or f'folder-{index + 1}'
        folder, _ = Folder.objects.get_or_create(
            organization=org,
            parent=parent,
            slug=slug,
            defaults={'name': name, 'sort_order': index},
        )
        parent = folder
    return parent


def build_project_search_query(query: str):
    return (
        Q(name__icontains=query)
        | Q(brief__icontains=query)
        | Q(folder_path__icontains=query)
        | Q(status_tag__icontains=query)
        | Q(brand_context__brand_name__icontains=query)
        | Q(brand_context__campaign_goal__icontains=query)
        | Q(brand_context__audience__icontains=query)
    )


class WorkspaceBootstrapView(APIView):
    def get(self, request):
        username, org, project, campaign = get_scope(request)
        organizations = Organization.objects.all().order_by('name')
        projects = Project.objects.filter(organization=org).select_related('folder').order_by('-created_at')
        folders = Folder.objects.filter(organization=org).annotate(project_count=Count('projects')).order_by('parent_id', 'sort_order', 'name')
        campaigns = Campaign.objects.filter(project__in=projects).order_by('-created_at')
        assets = Asset.objects.filter(organization=org).order_by('-created_at')[:12]
        tasks = GenerationTask.objects.filter(organization=org).order_by('-created_at')[:12]
        draft = get_or_create_default_draft(project, campaign)
        templates = WorkflowTemplate.objects.filter(is_public=True).order_by('-created_at')[:8]

        return Response({
            'scope': {
                'organization': serialize_organization(org),
                'project': serialize_project(project),
                'campaign': serialize_campaign(campaign),
                'username': username.username if username else request.query_params.get('username', 'ROOT'),
            },
            'organizations': [serialize_organization(item) for item in organizations],
            'projects': [serialize_project(item) for item in projects],
            'folders': [serialize_folder(item) for item in folders],
            'campaigns': [serialize_campaign(item) for item in campaigns],
            'draft': serialize_workspace_draft(draft),
            'templates': [serialize_workflow_template(item) for item in templates],
            'assets': [serialize_asset(item) for item in assets],
            'tasks': [serialize_task(item) for item in tasks],
            'stats': {
                'organization_count': organizations.count(),
                'project_count': projects.count(),
                'campaign_count': campaigns.count(),
                'asset_count': Asset.objects.filter(organization=org).count(),
                'task_count': GenerationTask.objects.filter(organization=org).count(),
            },
        })

    def post(self, request):
        username, org, project, campaign = get_scope(request)
        return Response({
            'scope': {
                'organization': serialize_organization(org),
                'project': serialize_project(project),
                'campaign': serialize_campaign(campaign),
                'username': username.username if username else request.data.get('username', 'ROOT'),
            }
        })


class WorkspaceView(APIView):
    def get(self, request):
        org_slug = request.query_params.get('organization')
        organizations = Organization.objects.all().order_by('name')
        projects = Project.objects.all().order_by('-created_at')
        campaigns = Campaign.objects.all().order_by('-created_at')
        folders = Folder.objects.all().order_by('parent_id', 'sort_order', 'name')

        if org_slug:
            projects = projects.filter(organization__slug=org_slug)
            folders = folders.filter(organization__slug=org_slug)

        return Response({
            'organizations': [serialize_organization(item) for item in organizations],
            'projects': [serialize_project(item) for item in projects],
            'folders': [serialize_folder(item) for item in folders],
            'campaigns': [serialize_campaign(item) for item in campaigns],
        })

    def post(self, request):
        org_name = request.data.get('organization_name', 'Marketing Hub')
        org_slug = slugify(request.data.get('organization_slug') or org_name or 'marketing-hub')
        project_name = request.data.get('project_name', 'Core Launch')
        project_slug = slugify(request.data.get('project_slug') or project_name or 'core-launch')
        campaign_name = request.data.get('campaign_name', 'Product Launch')
        user_name = request.data.get('username', 'ROOT')

        org, _ = Organization.objects.get_or_create(slug=org_slug, defaults={'name': org_name})
        project, _ = Project.objects.get_or_create(
            organization=org,
            slug=project_slug,
            defaults={'name': project_name, 'brief': request.data.get('brief', '')},
        )
        campaign, _ = Campaign.objects.get_or_create(
            project=project,
            name=campaign_name,
            defaults={'objective': request.data.get('objective', ''), 'status': request.data.get('status', 'active')},
        )

        user = User.objects.filter(username=user_name).first()
        if user:
            from api.models import Membership

            Membership.objects.get_or_create(user=user, organization=org, defaults={'role': 'admin'})

        return Response({
            'organization': serialize_organization(org),
            'project': serialize_project(project),
            'campaign': serialize_campaign(campaign),
        }, status=status.HTTP_201_CREATED)


class FolderCollectionView(APIView):
    def get(self, request):
        organization_slug = request.query_params.get('organization')
        query = Folder.objects.select_related('organization', 'parent').annotate(project_count=Count('projects')).order_by('parent_id', 'sort_order', 'name')
        if organization_slug:
            query = query.filter(organization__slug=organization_slug)
        return Response([serialize_folder(item) for item in query])

    def post(self, request):
        org_slug = request.data.get('organization')
        org = Organization.objects.filter(slug=org_slug).first()
        if not org:
            return Response({'error': 'Organization not found'}, status=status.HTTP_404_NOT_FOUND)
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
    def patch(self, request, pk: int):
        folder = Folder.objects.filter(pk=pk).first()
        if not folder:
            return Response({'error': 'Folder not found'}, status=status.HTTP_404_NOT_FOUND)
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
        folder = Folder.objects.filter(pk=pk).first()
        if not folder:
            return Response({'error': 'Folder not found'}, status=status.HTTP_404_NOT_FOUND)
        user, _, _, _ = get_scope(request)
        record_audit_log(
            action='delete',
            actor=user,
            organization=folder.organization,
            target_type='folder',
            target_id=str(folder.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        folder.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectCollectionView(APIView):
    def get(self, request):
        organization_slug = request.query_params.get('organization')
        folder = request.query_params.get('folder')
        platform = request.query_params.get('platform')
        status_tag = request.query_params.get('status')
        search = request.query_params.get('q')
        query = Project.objects.select_related('organization', 'folder').order_by('-created_at')
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
        org = Organization.objects.filter(slug=org_slug).first()
        if not org:
            return Response({'error': 'Organization not found'}, status=status.HTTP_404_NOT_FOUND)

        plan = PLAN_LIMITS.get(org.subscription_plan, PLAN_LIMITS['free'])
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
    def get(self, request, pk: int):
        project = Project.objects.select_related('organization', 'folder').filter(pk=pk).first()
        if not project:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            **serialize_project(project),
            'campaigns': [serialize_campaign(item) for item in project.campaigns.order_by('-created_at')],
            'drafts': [serialize_workspace_draft(item) for item in project.workspace_drafts.order_by('-updated_at')],
            'templates': [serialize_workflow_template(item) for item in project.workflow_templates.order_by('-created_at')],
            'assets': [serialize_asset(item) for item in project.assets.order_by('-created_at')[:20]],
        })

    def patch(self, request, pk: int):
        project = Project.objects.filter(pk=pk).first()
        if not project:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
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
        project = Project.objects.filter(pk=pk).first()
        if not project:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
        user, _, _, _ = get_scope(request)
        record_audit_log(
            action='delete',
            actor=user,
            organization=project.organization,
            target_type='project',
            target_id=str(project.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CampaignCollectionView(APIView):
    def get(self, request):
        project_id = request.query_params.get('project')
        query = Campaign.objects.select_related('project', 'project__organization').order_by('-created_at')
        if project_id:
            query = query.filter(project_id=project_id)
        return Response([serialize_campaign(item) for item in query])

    def post(self, request):
        project_id = request.data.get('project_id')
        project = Project.objects.filter(pk=project_id).first()
        if not project:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
        campaign = Campaign.objects.create(
            project=project,
            name=request.data.get('name', 'Untitled Campaign'),
            objective=request.data.get('objective', ''),
            status=request.data.get('status', 'active'),
        )
        return Response(serialize_campaign(campaign), status=status.HTTP_201_CREATED)


class CampaignDetailView(APIView):
    def patch(self, request, pk: int):
        campaign = Campaign.objects.filter(pk=pk).first()
        if not campaign:
            return Response({'error': 'Campaign not found'}, status=status.HTTP_404_NOT_FOUND)
        if 'name' in request.data:
            campaign.name = request.data.get('name', campaign.name)
        if 'objective' in request.data:
            campaign.objective = request.data.get('objective', campaign.objective)
        if 'status' in request.data:
            campaign.status = request.data.get('status', campaign.status)
        campaign.save()
        return Response(serialize_campaign(campaign))

    def delete(self, request, pk: int):
        campaign = Campaign.objects.filter(pk=pk).first()
        if not campaign:
            return Response({'error': 'Campaign not found'}, status=status.HTTP_404_NOT_FOUND)
        user, _, _, _ = get_scope(request)
        record_audit_log(
            action='delete',
            actor=user,
            organization=campaign.project.organization,
            target_type='campaign',
            target_id=str(campaign.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
        )
        campaign.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceDraftCollectionView(APIView):
    def get(self, request):
        project_id = request.query_params.get('project')
        project_slug = request.query_params.get('project_slug')
        query = WorkspaceDraft.objects.select_related('organization', 'project', 'campaign').order_by('-updated_at')
        if project_id:
            query = query.filter(project_id=project_id)
        elif project_slug:
            query = query.filter(project__slug=project_slug)
        return Response([serialize_workspace_draft(item) for item in query])

    def post(self, request):
        project_id = request.data.get('project_id')
        project = Project.objects.filter(pk=project_id).select_related('organization').first()
        if not project:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
        campaign = Campaign.objects.filter(pk=request.data.get('campaign_id'), project=project).first() if request.data.get('campaign_id') else None
        draft, _ = WorkspaceDraft.objects.update_or_create(
            project=project,
            campaign=campaign,
            name=request.data.get('name', 'Default Workflow'),
            defaults={
                'organization': project.organization,
                'brand_context': request.data.get('brand_context', {}) if isinstance(request.data.get('brand_context', {}), dict) else {},
                'nodes': request.data.get('nodes', []) if isinstance(request.data.get('nodes', []), list) else [],
                'edges': request.data.get('edges', []) if isinstance(request.data.get('edges', []), list) else [],
                'viewport': request.data.get('viewport', {}) if isinstance(request.data.get('viewport', {}), dict) else {},
                'selected_node_id': request.data.get('selected_node_id', ''),
                'status': request.data.get('status', 'draft'),
                'last_run_summary': request.data.get('last_run_summary', {}) if isinstance(request.data.get('last_run_summary', {}), dict) else {},
            },
        )
        return Response(serialize_workspace_draft(draft), status=status.HTTP_201_CREATED)


class WorkspaceDraftDetailView(APIView):
    def get(self, request, pk: int):
        draft = WorkspaceDraft.objects.select_related('organization', 'project', 'campaign').filter(pk=pk).first()
        if not draft:
            return Response({'error': 'Draft not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serialize_workspace_draft(draft))

    def patch(self, request, pk: int):
        draft = WorkspaceDraft.objects.filter(pk=pk).first()
        if not draft:
            return Response({'error': 'Draft not found'}, status=status.HTTP_404_NOT_FOUND)
        for field in ('name', 'selected_node_id', 'status'):
            if field in request.data:
                setattr(draft, field, request.data.get(field, getattr(draft, field)))
        if 'brand_context' in request.data and isinstance(request.data.get('brand_context'), dict):
            draft.brand_context = request.data['brand_context']
        if 'nodes' in request.data and isinstance(request.data.get('nodes'), list):
            draft.nodes = request.data['nodes']
        if 'edges' in request.data and isinstance(request.data.get('edges'), list):
            draft.edges = request.data['edges']
        if 'viewport' in request.data and isinstance(request.data.get('viewport'), dict):
            draft.viewport = request.data['viewport']
        if 'last_run_summary' in request.data and isinstance(request.data.get('last_run_summary'), dict):
            draft.last_run_summary = request.data['last_run_summary']
        draft.save()
        return Response(serialize_workspace_draft(draft))


class WorkflowTemplateCollectionView(APIView):
    def get(self, request):
        organization_slug = request.query_params.get('organization')
        query = WorkflowTemplate.objects.select_related('organization', 'source_project', 'source_campaign').filter(is_public=True)
        if organization_slug:
            query = query.filter(organization__slug=organization_slug)
        return Response([serialize_workflow_template(item) for item in query])

    def post(self, request):
        project = Project.objects.filter(pk=request.data.get('project_id')).first()
        if not project:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
        template = WorkflowTemplate.objects.create(
            organization=project.organization,
            source_project=project,
            source_campaign=Campaign.objects.filter(pk=request.data.get('campaign_id'), project=project).first() if request.data.get('campaign_id') else None,
            title=request.data.get('title', project.name),
            description=request.data.get('description', ''),
            author_username=request.data.get('username', 'ROOT'),
            brand_context=request.data.get('brand_context', {}) if isinstance(request.data.get('brand_context', {}), dict) else {},
            nodes=request.data.get('nodes', []) if isinstance(request.data.get('nodes', []), list) else [],
            edges=request.data.get('edges', []) if isinstance(request.data.get('edges', []), list) else [],
            preview_image_url=request.data.get('preview_image_url', ''),
            tags=request.data.get('tags', []) if isinstance(request.data.get('tags', []), list) else [],
            is_public=as_bool(request.data.get('is_public', True)),
        )
        return Response(serialize_workflow_template(template), status=status.HTTP_201_CREATED)


class WorkflowTemplateForkView(APIView):
    def post(self, request, pk: int):
        template = WorkflowTemplate.objects.filter(pk=pk).first()
        if not template:
            return Response({'error': 'Template not found'}, status=status.HTTP_404_NOT_FOUND)
        project = Project.objects.filter(pk=request.data.get('project_id')).first()
        if not project:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
        draft, _ = WorkspaceDraft.objects.update_or_create(
            project=project,
            campaign=Campaign.objects.filter(pk=request.data.get('campaign_id'), project=project).first() if request.data.get('campaign_id') else None,
            name=request.data.get('name', template.title),
            defaults={
                'organization': project.organization,
                'brand_context': template.brand_context,
                'nodes': template.nodes,
                'edges': template.edges,
                'viewport': request.data.get('viewport', {'x': 0, 'y': 0, 'zoom': 1}),
                'selected_node_id': '',
                'status': 'draft',
            },
        )
        template.fork_count += 1
        template.save(update_fields=['fork_count', 'updated_at'])
        return Response({
            'draft': serialize_workspace_draft(draft),
            'template': serialize_workflow_template(template),
        }, status=status.HTTP_201_CREATED)


class AnalyticsDashboardView(APIView):
    def get(self, request):
        _, org, project, campaign = get_scope(request)
        events = UsageEvent.objects.filter(organization=org)
        tasks = GenerationTask.objects.filter(organization=org)

        total_tokens = events.aggregate(value=Sum('total_tokens'))['value'] or 0
        total_cost = events.aggregate(value=Sum('cost_usd'))['value'] or Decimal('0')

        task_counts = tasks.values('status').annotate(count=Count('id'))
        tasks_by_status = {item['status']: item['count'] for item in task_counts}
        tasks_by_type = {item['task_type']: item['count'] for item in tasks.values('task_type').annotate(count=Count('id'))}

        recent_events = events[:10]

        return Response({
            'scope': {
                'organization': serialize_organization(org),
                'project': serialize_project(project),
                'campaign': serialize_campaign(campaign),
            },
            'metrics': {
                'task_count': tasks.count(),
                'queued_tasks': tasks_by_status.get('queued', 0),
                'running_tasks': tasks_by_status.get('running', 0),
                'successful_tasks': tasks_by_status.get('succeeded', 0),
                'failed_tasks': tasks_by_status.get('failed', 0),
                'total_tokens': total_tokens,
                'total_cost_usd': str(total_cost),
                'asset_count': Asset.objects.filter(organization=org).count(),
                'community_count': CommunityCreation.objects.filter(organization=org).count(),
            },
            'tasks_by_type': tasks_by_type,
            'recent_usage': [
                {
                    'provider': item.provider,
                    'model_name': item.model_name,
                    'total_tokens': item.total_tokens,
                    'cost_usd': str(item.cost_usd),
                    'created_at': item.created_at.isoformat(),
                }
                for item in recent_events
            ],
        })
