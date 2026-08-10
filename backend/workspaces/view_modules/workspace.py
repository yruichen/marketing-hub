from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.access import require_role
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
from api.scope import as_bool, as_list, get_scope, require_workspace_scope, unique_slug
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
    permission_classes = [IsAuthenticated]

    def get(self, request):
        username, org, project, campaign = require_workspace_scope(request)
        organizations = Organization.objects.filter(memberships__user=request.user).distinct().order_by('name')
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
                'username': username.username,
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
        username, org, project, campaign = require_workspace_scope(request)
        return Response({
            'scope': {
                'organization': serialize_organization(org),
                'project': serialize_project(project),
                'campaign': serialize_campaign(campaign),
                'username': username.username,
            }
        })


class WorkspaceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        org_slug = request.query_params.get('organization')
        organizations = Organization.objects.filter(memberships__user=request.user).distinct().order_by('name')
        projects = Project.objects.filter(organization__memberships__user=request.user).order_by('-created_at')
        campaigns = Campaign.objects.filter(project__organization__memberships__user=request.user).order_by('-created_at')
        folders = Folder.objects.filter(organization__memberships__user=request.user).order_by('parent_id', 'sort_order', 'name')

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
        if request.user.is_superuser:
            return Response({'error': 'Superusers cannot create workspace scope.'}, status=status.HTTP_403_FORBIDDEN)
        org_name = str(request.data.get('organization_name') or '').strip()
        requested_org_slug = str(request.data.get('organization_slug') or '').strip()
        project_name = str(request.data.get('project_name') or '').strip()
        campaign_name = str(request.data.get('campaign_name') or '').strip()
        if not project_name or not campaign_name:
            return Response(
                {'error': 'project_name and campaign_name are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user = request.user

        org = Organization.objects.filter(
            slug=requested_org_slug,
            memberships__user=user,
        ).first() if requested_org_slug else None
        from api.models import Membership
        if org is None:
            if not org_name:
                return Response(
                    {'error': 'Select an existing organization or provide organization_name.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            org_slug = unique_slug(Organization, org_name)
            org = Organization.objects.create(name=org_name, slug=org_slug)
            Membership.objects.create(user=user, organization=org, role='admin')
        require_role(user, org, 'admin')
        project_slug = unique_slug(
            Project,
            str(request.data.get('project_slug') or project_name),
            organization=org,
        )
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

        return Response({
            'organization': serialize_organization(org),
            'project': serialize_project(project),
            'campaign': serialize_campaign(campaign),
        }, status=status.HTTP_201_CREATED)
