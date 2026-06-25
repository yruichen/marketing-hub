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

class AnalyticsDashboardView(APIView):
    def get(self, request):
        _, org, project, campaign = get_scope(request)
        events = UsageEvent.objects.filter(organization=org)
        tasks = GenerationTask.objects.filter(organization=org)
        assets = Asset.objects.filter(organization=org)
        drafts = WorkspaceDraft.objects.filter(organization=org)
        projects = Project.objects.filter(organization=org)
        campaigns = Campaign.objects.filter(project__organization=org)

        total_tokens = events.aggregate(value=Sum('total_tokens'))['value'] or 0
        total_cost = events.aggregate(value=Sum('cost_usd'))['value'] or Decimal('0')

        task_counts = tasks.values('status').annotate(count=Count('id'))
        tasks_by_status = {item['status']: item['count'] for item in task_counts}
        tasks_by_type = {item['task_type']: item['count'] for item in tasks.values('task_type').annotate(count=Count('id'))}
        asset_type_counts = {item['asset_type']: item['count'] for item in assets.values('asset_type').annotate(count=Count('id'))}
        usage_by_provider = [
            {
                'provider': item['provider'] or 'unknown',
                'total_tokens': item['total_tokens'] or 0,
                'cost_usd': str(item['cost_usd'] or Decimal('0')),
                'event_count': item['event_count'],
            }
            for item in events.values('provider')
            .annotate(total_tokens=Sum('total_tokens'), cost_usd=Sum('cost_usd'), event_count=Count('id'))
            .order_by('-cost_usd', '-total_tokens')
        ]

        today = timezone.localdate()
        trend_start = today - timedelta(days=6)
        trend_rows = {
            item['day']: item
            for item in events.filter(created_at__date__gte=trend_start)
            .annotate(day=TruncDate('created_at'))
            .values('day')
            .annotate(total_tokens=Sum('total_tokens'), cost_usd=Sum('cost_usd'), event_count=Count('id'))
            .order_by('day')
        }
        usage_trend = []
        for offset in range(7):
            day = trend_start + timedelta(days=offset)
            row = trend_rows.get(day)
            usage_trend.append({
                'date': day.isoformat(),
                'total_tokens': (row or {}).get('total_tokens') or 0,
                'cost_usd': str((row or {}).get('cost_usd') or Decimal('0')),
                'event_count': (row or {}).get('event_count') or 0,
            })

        recent_events = events[:10]
        recent_tasks = tasks.select_related('requested_by').order_by('-created_at')[:6]
        total_tasks = tasks.count()
        successful_tasks = tasks_by_status.get('succeeded', 0)
        failed_tasks = tasks_by_status.get('failed', 0)
        active_tasks = tasks_by_status.get('queued', 0) + tasks_by_status.get('running', 0)

        return Response({
            'scope': {
                'organization': serialize_organization(org),
                'project': serialize_project(project),
                'campaign': serialize_campaign(campaign),
            },
            'metrics': {
                'task_count': total_tasks,
                'queued_tasks': tasks_by_status.get('queued', 0),
                'running_tasks': tasks_by_status.get('running', 0),
                'successful_tasks': successful_tasks,
                'failed_tasks': failed_tasks,
                'total_tokens': total_tokens,
                'total_cost_usd': str(total_cost),
                'asset_count': assets.count(),
                'community_count': CommunityCreation.objects.filter(organization=org).count(),
                'project_count': projects.count(),
                'campaign_count': campaigns.count(),
                'draft_count': drafts.count(),
                'active_task_count': active_tasks,
                'success_rate': round((successful_tasks / total_tasks) * 100, 1) if total_tasks else 0,
                'failure_rate': round((failed_tasks / total_tasks) * 100, 1) if total_tasks else 0,
            },
            'tasks_by_type': tasks_by_type,
            'tasks_by_status': tasks_by_status,
            'asset_type_counts': asset_type_counts,
            'usage_by_provider': usage_by_provider,
            'usage_trend': usage_trend,
            'workspace_health': {
                'projects': projects.count(),
                'campaigns': campaigns.count(),
                'drafts': drafts.count(),
                'running_drafts': drafts.filter(status='running').count(),
                'completed_drafts': drafts.filter(status='completed').count(),
                'failed_drafts': drafts.filter(status='failed').count(),
            },
            'recent_tasks': [serialize_task(item) for item in recent_tasks],
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
