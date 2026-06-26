from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Count, Sum
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from api.audit import record_audit_log
from api.contracts import PLAN_LIMITS
from api.models import CreditLedgerEntry, GenerationTask, Project, UsageEvent
from api.scope import get_scope


class BillingPlansView(APIView):
    def _payload(self, org):
        project_count = Project.objects.filter(organization=org, is_archived=False).count()
        events = UsageEvent.objects.filter(organization=org)
        tasks = GenerationTask.objects.filter(organization=org)
        since = timezone.now() - timedelta(days=30)
        recent_events = events.filter(created_at__gte=since)

        total_tokens = events.aggregate(value=Sum('total_tokens'))['value'] or 0
        total_cost = events.aggregate(value=Sum('cost_usd'))['value'] or Decimal('0')
        recent_tokens = recent_events.aggregate(value=Sum('total_tokens'))['value'] or 0
        recent_cost = recent_events.aggregate(value=Sum('cost_usd'))['value'] or Decimal('0')
        tasks_by_status = {
            item['status']: item['count']
            for item in tasks.values('status').annotate(count=Count('id'))
        }
        usage_by_provider = [
            {
                'provider': item['provider'],
                'total_tokens': item['total_tokens'] or 0,
                'cost_usd': str(item['cost_usd'] or Decimal('0')),
            }
            for item in events.values('provider')
            .annotate(total_tokens=Sum('total_tokens'), cost_usd=Sum('cost_usd'))
            .order_by('-cost_usd')[:6]
        ]
        credit_balance_cents = CreditLedgerEntry.objects.filter(organization=org).aggregate(value=Sum('delta_cents'))['value'] or 0
        credit_grants = org.credit_grants.order_by('-created_at')[:6]

        return {
            'current_plan': org.subscription_plan,
            'current_limits': PLAN_LIMITS.get(org.subscription_plan, PLAN_LIMITS['free']),
            'project_count': project_count,
            'plans': PLAN_LIMITS,
            'usage_summary': {
                'total_tokens': total_tokens,
                'total_cost_usd': str(total_cost),
                'last_30d_tokens': recent_tokens,
                'last_30d_cost_usd': str(recent_cost),
                'task_count': tasks.count(),
                'successful_tasks': tasks_by_status.get('succeeded', 0),
                'failed_tasks': tasks_by_status.get('failed', 0),
            },
            'usage_by_provider': usage_by_provider,
            'credit_balance_cents': credit_balance_cents,
            'credit_balance_usd': str(Decimal(credit_balance_cents) / Decimal('100')),
            'recent_credit_grants': [
                {
                    'amount_cents': grant.amount_cents,
                    'amount_usd': str(Decimal(grant.amount_cents) / Decimal('100')),
                    'reason': grant.reason,
                    'expires_at': grant.expires_at.isoformat() if grant.expires_at else None,
                    'created_at': grant.created_at.isoformat(),
                }
                for grant in credit_grants
            ],
            'recent_usage': [
                {
                    'provider': item.provider,
                    'model_name': item.model_name,
                    'total_tokens': item.total_tokens,
                    'cost_usd': str(item.cost_usd),
                    'created_at': item.created_at.isoformat(),
                }
                for item in events[:8]
            ],
        }

    def get(self, request):
        _, org, _, _ = get_scope(request)
        return Response(self._payload(org))

    def post(self, request):
        user, org, _, _ = get_scope(request)
        plan = request.data.get('plan', 'free')
        if plan not in PLAN_LIMITS:
            return Response({'error': 'Unsupported subscription plan'}, status=status.HTTP_400_BAD_REQUEST)
        old_plan = org.subscription_plan
        org.subscription_plan = plan
        org.save(update_fields=['subscription_plan'])
        record_audit_log(
            action='billing_change',
            actor=user,
            organization=org,
            target_type='organization',
            target_id=str(org.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'from': old_plan, 'to': plan},
        )
        return Response(self._payload(org))
