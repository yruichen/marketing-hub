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

from workspaces.view_modules.helpers import folder_path_from_request, build_project_search_query

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
