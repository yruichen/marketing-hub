from datetime import timedelta
from decimal import Decimal

from django.conf import settings
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
            author_username=request.data.get('username', settings.MARKETING_HUB_DEMO_USERNAME),
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
        runtime_fields = {'status', 'output', 'task_id', 'error_message', 'feedback', 'input_schema', 'output_schema'}
        clean_nodes = [{k: v for k, v in node.items() if k not in runtime_fields} for node in (template.nodes or [])]
        draft, _ = WorkspaceDraft.objects.update_or_create(
            project=project,
            campaign=Campaign.objects.filter(pk=request.data.get('campaign_id'), project=project).first() if request.data.get('campaign_id') else None,
            name=request.data.get('name', template.title),
            defaults={
                'organization': project.organization,
                'brand_context': template.brand_context,
                'nodes': clean_nodes,
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
