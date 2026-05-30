import json
from decimal import Decimal

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db.models import Count, Sum
from django.utils.text import slugify
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.models import (
    AIConfiguration,
    Asset,
    Campaign,
    CommunityCreation,
    GenerationTask,
    Organization,
    Project,
    UsageEvent,
    WorkflowTemplate,
    WorkspaceDraft,
)
from api.services import (
    create_generation_task,
    ensure_demo_workspace,
    get_or_create_default_draft,
    queue_generation_task,
    retry_workspace_node,
    run_generation_task,
    run_workspace_workflow,
    serialize_asset,
    serialize_campaign,
    serialize_organization,
    serialize_project,
    serialize_task,
    serialize_workflow_template,
    serialize_workspace_draft,
)


def _get_scope(request):
    username = request.query_params.get('username') or request.data.get('username')
    workspace = ensure_demo_workspace(username)
    org = workspace['organization']
    project = workspace['project']
    campaign = workspace['campaign']

    org_slug = request.query_params.get('organization') or request.data.get('organization')
    project_slug = request.query_params.get('project') or request.data.get('project')
    campaign_id = request.query_params.get('campaign') or request.data.get('campaign')

    if org_slug:
        org = Organization.objects.filter(slug=org_slug).first() or org
    if project_slug:
        project = Project.objects.filter(slug=project_slug, organization=org).first() or project
    if campaign_id:
        campaign = Campaign.objects.filter(pk=campaign_id, project=project).first()
    if not campaign or campaign.project_id != project.id:
        campaign = Campaign.objects.filter(project=project).order_by('-created_at').first()
    if not campaign:
        campaign = Campaign.objects.create(
            project=project,
            name='Default Campaign',
            objective='Default campaign workspace',
        )

    return workspace['user'], org, project, campaign


def _as_bool(value, default=True):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {'1', 'true', 'yes', 'on'}
    return bool(value)


def _unique_slug(model, base_slug: str, exclude_pk: int | None = None, **filters) -> str:
    base = slugify(base_slug or 'untitled') or 'untitled'
    candidate = base
    index = 2
    query = model.objects.filter(**filters)
    if exclude_pk:
        query = query.exclude(pk=exclude_pk)
    while query.filter(slug=candidate).exists():
        candidate = f'{base}-{index}'
        index += 1
    return candidate


class WorkspaceBootstrapView(APIView):
    def get(self, request):
        username, org, project, campaign = _get_scope(request)
        organizations = Organization.objects.all().order_by('name')
        projects = Project.objects.filter(organization=org).order_by('-created_at')
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
        username, org, project, campaign = _get_scope(request)
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

        if org_slug:
            projects = projects.filter(organization__slug=org_slug)

        return Response({
            'organizations': [serialize_organization(item) for item in organizations],
            'projects': [serialize_project(item) for item in projects],
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


class ProjectCollectionView(APIView):
    def get(self, request):
        organization_slug = request.query_params.get('organization')
        query = Project.objects.select_related('organization').order_by('-created_at')
        if organization_slug:
            query = query.filter(organization__slug=organization_slug)
        return Response([
            {
                **serialize_project(project),
                'campaign_count': project.campaigns.count(),
                'asset_count': project.assets.count(),
                'draft_count': project.workspace_drafts.count(),
                'template_count': project.workflow_templates.count(),
            }
            for project in query
        ])

    def post(self, request):
        org_slug = request.data.get('organization')
        org = Organization.objects.filter(slug=org_slug).first()
        if not org:
            return Response({'error': 'Organization not found'}, status=status.HTTP_404_NOT_FOUND)

        name = request.data.get('name', 'Untitled Project').strip()
        slug = _unique_slug(Project, request.data.get('slug') or name, organization=org)
        project = Project.objects.create(
            organization=org,
            name=name,
            slug=slug,
            brief=request.data.get('brief', ''),
            brand_context=request.data.get('brand_context', {}) if isinstance(request.data.get('brand_context', {}), dict) else {},
            is_archived=_as_bool(request.data.get('is_archived', False), default=False),
        )
        return Response(serialize_project(project), status=status.HTTP_201_CREATED)


class ProjectDetailView(APIView):
    def get(self, request, pk: int):
        project = Project.objects.select_related('organization').filter(pk=pk).first()
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
            project.slug = _unique_slug(Project, request.data.get('slug'), exclude_pk=project.id, organization=project.organization)
        if 'brief' in request.data:
            project.brief = request.data.get('brief', project.brief)
        if 'brand_context' in request.data and isinstance(request.data.get('brand_context'), dict):
            project.brand_context = request.data['brand_context']
        if 'is_archived' in request.data:
            project.is_archived = _as_bool(request.data.get('is_archived'), default=project.is_archived)
        project.save()
        return Response(serialize_project(project))

    def delete(self, request, pk: int):
        project = Project.objects.filter(pk=pk).first()
        if not project:
            return Response({'error': 'Project not found'}, status=status.HTTP_404_NOT_FOUND)
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


class WorkflowRunView(APIView):
    def post(self, request, pk: int):
        draft = WorkspaceDraft.objects.select_related('organization', 'project', 'campaign').filter(pk=pk).first()
        if not draft:
            return Response({'error': 'Draft not found'}, status=status.HTTP_404_NOT_FOUND)
        draft, tasks = run_workspace_workflow(draft, username=request.data.get('username'))
        return Response({
            'draft': serialize_workspace_draft(draft),
            'tasks': [serialize_task(task) for task in tasks],
        })


class WorkflowNodeRetryView(APIView):
    def post(self, request, pk: int, node_id: str):
        draft = WorkspaceDraft.objects.select_related('organization', 'project', 'campaign').filter(pk=pk).first()
        if not draft:
            return Response({'error': 'Draft not found'}, status=status.HTTP_404_NOT_FOUND)
        draft, task = retry_workspace_node(
            draft,
            node_id=node_id,
            feedback=request.data.get('feedback', ''),
            username=request.data.get('username'),
        )
        return Response({
            'draft': serialize_workspace_draft(draft),
            'task': serialize_task(task) if task else None,
        })


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
            is_public=_as_bool(request.data.get('is_public', True)),
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


class MarketingCopyView(APIView):
    def post(self, request):
        user, org, project, campaign = _get_scope(request)
        request_username = request.data.get('username') or (user.username if user else None)
        if _as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(
                task_type='copy',
                payload={
                    'brand_name': request.data.get('brand_name', 'Marketing-Hub'),
                    'product_description': request.data.get('product_description', 'AI 营销场景全能助手'),
                    'tone': request.data.get('tone', '爆款活泼'),
                    'platform': request.data.get('platform', 'Xiaohongshu'),
                },
                username=request_username,
                organization=org,
                project=project,
                campaign=campaign,
                run_now=False,
            )
            queue_generation_task(task)
            return Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED)
        task = create_generation_task(
            task_type='copy',
            payload={
                'brand_name': request.data.get('brand_name', 'Marketing-Hub'),
                'product_description': request.data.get('product_description', 'AI 营销场景全能助手'),
                'tone': request.data.get('tone', '爆款活泼'),
                'platform': request.data.get('platform', 'Xiaohongshu'),
                },
            username=request_username,
            organization=org,
            project=project,
            campaign=campaign,
        )
        return Response({
            'task': serialize_task(task),
            'result': task.result.get('data', {}),
            'logs': task.result.get('logs', []),
        }, status=status.HTTP_200_OK)


class ImageGenerateView(APIView):
    def post(self, request):
        user, org, project, campaign = _get_scope(request)
        request_username = request.data.get('username') or (user.username if user else None)
        if _as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(
                task_type='image',
                payload={
                    'prompt': request.data.get('prompt', 'A creative workspace'),
                    'style': request.data.get('style', 'neo-brutalism'),
                    'aspect_ratio': request.data.get('aspect_ratio', '1:1'),
                },
                username=request_username,
                organization=org,
                project=project,
                campaign=campaign,
                run_now=False,
            )
            queue_generation_task(task)
            return Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED)
        task = create_generation_task(
            task_type='image',
            payload={
                'prompt': request.data.get('prompt', 'A creative workspace'),
                'style': request.data.get('style', 'neo-brutalism'),
                'aspect_ratio': request.data.get('aspect_ratio', '1:1'),
                },
            username=request_username,
            organization=org,
            project=project,
            campaign=campaign,
        )
        return Response({
            'task': serialize_task(task),
            'result': task.result.get('data', {}),
            'logs': task.result.get('logs', []),
        }, status=status.HTTP_200_OK)


class StoryboardView(APIView):
    def post(self, request):
        user, org, project, campaign = _get_scope(request)
        request_username = request.data.get('username') or (user.username if user else None)
        if _as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(
                task_type='storyboard',
                payload={
                    'video_topic': request.data.get('video_topic', 'Coffee Shop Morning'),
                    'duration': int(request.data.get('duration', 30)),
                    'target_audience': request.data.get('target_audience', 'Young creators'),
                },
                username=request_username,
                organization=org,
                project=project,
                campaign=campaign,
                run_now=False,
            )
            queue_generation_task(task)
            return Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED)
        task = create_generation_task(
            task_type='storyboard',
            payload={
                'video_topic': request.data.get('video_topic', 'Coffee Shop Morning'),
                'duration': int(request.data.get('duration', 30)),
                'target_audience': request.data.get('target_audience', 'Young creators'),
                },
            username=request_username,
            organization=org,
            project=project,
            campaign=campaign,
        )
        return Response({
            'task': serialize_task(task),
            'result': task.result.get('data', {}),
            'logs': task.result.get('logs', []),
        }, status=status.HTTP_200_OK)


class AudioVoiceoverView(APIView):
    def post(self, request):
        user, org, project, campaign = _get_scope(request)
        request_username = request.data.get('username') or (user.username if user else None)
        if _as_bool(request.data.get('async', False), default=False):
            task = create_generation_task(
                task_type='audio',
                payload={
                    'text': request.data.get('text', '欢迎使用 Marketing Hub AI 一站式营销场景配音助手'),
                    'voice_id': request.data.get('voice_id', 'female_warm'),
                    'speed': float(request.data.get('speed', 1.0)),
                },
                username=request_username,
                organization=org,
                project=project,
                campaign=campaign,
                run_now=False,
            )
            queue_generation_task(task)
            return Response({'task': serialize_task(task)}, status=status.HTTP_202_ACCEPTED)
        task = create_generation_task(
            task_type='audio',
            payload={
                'text': request.data.get('text', '欢迎使用 Marketing Hub AI 一站式营销场景配音助手'),
                'voice_id': request.data.get('voice_id', 'female_warm'),
                'speed': float(request.data.get('speed', 1.0)),
                },
            username=request_username,
            organization=org,
            project=project,
            campaign=campaign,
        )
        return Response({
            'task': serialize_task(task),
            'result': task.result.get('data', {}),
            'logs': task.result.get('logs', []),
        }, status=status.HTTP_200_OK)


class TaskQueueView(APIView):
    def get(self, request):
        tasks = GenerationTask.objects.all().order_by('-created_at')[:50]
        return Response([serialize_task(task) for task in tasks])

    def post(self, request):
        user, org, project, campaign = _get_scope(request)
        request_username = request.data.get('username') or (user.username if user else None)
        task_type = request.data.get('task_type')
        if task_type not in dict(GenerationTask.TASK_TYPES):
            return Response({'error': 'Unsupported task type'}, status=status.HTTP_400_BAD_REQUEST)
        run_now = _as_bool(request.data.get('run_now', True))
        task = create_generation_task(
            task_type=task_type,
            payload=request.data.get('payload', {}),
            username=request_username,
            organization=org,
            project=project,
            campaign=campaign,
            run_now=run_now,
        )
        if run_now:
            return Response({'task': serialize_task(task), 'result': task.result.get('data', {}), 'logs': task.result.get('logs', [])})
        queue_generation_task(task)
        return Response({'task': serialize_task(task)}, status=status.HTTP_201_CREATED)


class TaskDetailView(APIView):
    def get(self, request, pk: int):
        task = GenerationTask.objects.filter(pk=pk).first()
        if not task:
            return Response({'error': 'Task not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serialize_task(task))

    def post(self, request, pk: int):
        task = GenerationTask.objects.filter(pk=pk).first()
        if not task:
            return Response({'error': 'Task not found'}, status=status.HTTP_404_NOT_FOUND)
        run_generation_task(task)
        return Response(serialize_task(task))


class LoginView(APIView):
    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response({'error': '请输入用户名和密码'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(username=username, password=password)
        if user is not None:
            ensure_demo_workspace(user.username)
            return Response({
                'token': f'demo-session-token-{user.username.lower()}-auth',
                'username': user.username,
                'email': user.email,
            }, status=status.HTTP_200_OK)
        return Response({'error': '用户名或密码错误。提示: ROOT / 123'}, status=status.HTTP_401_UNAUTHORIZED)


class AIConfigView(APIView):
    def get(self, request):
        configs = AIConfiguration.objects.all().order_by('-is_active')
        serialized = []
        for config in configs:
            masked_key = ''
            if config.api_key:
                masked_key = f"{config.api_key[:4]}...{config.api_key[-4:]}" if len(config.api_key) > 8 else '****'
            serialized.append({
                'id': config.id,
                'provider': config.provider,
                'provider_display': config.get_provider_display(),
                'api_key': masked_key,
                'base_url': config.base_url,
                'model_name': config.model_name,
                'is_active': config.is_active,
            })
        return Response(serialized)

    def post(self, request):
        provider = request.data.get('provider', 'mock')
        api_key = request.data.get('api_key', '').strip()
        base_url = request.data.get('base_url', '').strip()
        model_name = request.data.get('model_name', '').strip()

        config, _ = AIConfiguration.objects.get_or_create(provider=provider)
        if api_key and not api_key.startswith('...') and not api_key.startswith('***'):
            config.api_key = api_key
        config.base_url = base_url
        config.model_name = model_name
        config.is_active = True
        config.save()
        AIConfiguration.objects.exclude(id=config.id).update(is_active=False)

        return Response({
            'message': f'Successfully activated configuration for {config.get_provider_display()}',
            'config': {
                'provider': config.provider,
                'model_name': config.model_name,
                'is_active': config.is_active,
            },
        })


class CommunityCreationView(APIView):
    def get(self, request):
        creation_type = request.query_params.get('creation_type')
        organization_slug = request.query_params.get('organization')
        project_slug = request.query_params.get('project')
        query = CommunityCreation.objects.all().select_related('organization', 'project', 'campaign')

        if creation_type:
            query = query.filter(creation_type=creation_type)
        if organization_slug:
            query = query.filter(organization__slug=organization_slug)
        if project_slug:
            query = query.filter(project__slug=project_slug)

        serialized = []
        for item in query:
            serialized.append({
                'id': item.id,
                'username': item.username,
                'creation_type': item.creation_type,
                'creation_type_display': item.get_creation_type_display(),
                'title': item.title,
                'content': item.get_content_dict(),
                'image_url': item.image_url,
                'audio_url': item.audio_url,
                'created_at': item.created_at.strftime('%Y-%m-%d %H:%M'),
                'likes': item.likes,
                'rag_indexed': item.rag_indexed,
                'tags': item.tags,
                'organization': item.organization.slug if item.organization else None,
                'project': item.project.slug if item.project else None,
                'campaign': item.campaign_id,
            })
        return Response(serialized)

    def post(self, request):
        username, org, project, campaign = _get_scope(request)
        creation_type = request.data.get('creation_type')
        title = request.data.get('title')
        content_dict = request.data.get('content', {})
        image_url = request.data.get('image_url', '')
        audio_url = request.data.get('audio_url', '')
        tags = request.data.get('tags', [])

        if not creation_type or not title or not content_dict:
            return Response({'error': 'Missing required fields'}, status=status.HTTP_400_BAD_REQUEST)

        item = CommunityCreation.objects.create(
            organization=org,
            project=project,
            campaign=campaign,
            username=username.username if username else request.data.get('username', 'ROOT'),
            creation_type=creation_type,
            title=title,
            content=json.dumps(content_dict, ensure_ascii=False),
            image_url=image_url,
            audio_url=audio_url,
            tags=tags if isinstance(tags, list) else [],
            rag_indexed=False,
        )

        return Response({
            'message': 'Creation shared to the community workspace!',
            'id': item.id,
        }, status=status.HTTP_201_CREATED)


class LikeCreationView(APIView):
    def post(self, request, pk):
        item = CommunityCreation.objects.filter(pk=pk).first()
        if not item:
            return Response({'error': 'Creation not found'}, status=status.HTTP_404_NOT_FOUND)
        item.likes += 1
        item.save(update_fields=['likes'])
        return Response({'likes': item.likes})


class RAGSearchView(APIView):
    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if not query:
            return Response({'results': [], 'rag_logs': ['Query is empty.']})

        creations = CommunityCreation.objects.all().select_related('organization', 'project')
        results = []
        for item in creations:
            haystack = f"{item.title} {item.content} {' '.join(item.tags)}"
            matches = sum(1 for term in query.split() if term.lower() in haystack.lower())
            if matches:
                results.append({
                    'id': item.id,
                    'username': item.username,
                    'creation_type': item.creation_type,
                    'creation_type_display': item.get_creation_type_display(),
                    'title': item.title,
                    'content': item.get_content_dict(),
                    'image_url': item.image_url,
                    'audio_url': item.audio_url,
                    'created_at': item.created_at.strftime('%Y-%m-%d %H:%M'),
                    'likes': item.likes,
                    'similarity_score': round(min(0.99, 0.45 + matches * 0.12), 3),
                    'organization': item.organization.slug if item.organization else None,
                    'project': item.project.slug if item.project else None,
                })

        results.sort(key=lambda entry: entry['similarity_score'], reverse=True)
        return Response({
            'query': query,
            'results': results,
            'rag_logs': [
                f"Semantic retrieval ran against {len(creations)} community records.",
                'Vector search is not configured in this repository yet, so the endpoint uses a local keyword similarity fallback.',
            ],
        })


class AnalyticsDashboardView(APIView):
    def get(self, request):
        _, org, project, campaign = _get_scope(request)
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
