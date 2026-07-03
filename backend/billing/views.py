from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from api.audit import record_audit_log
from api.access import require_capability
from api.contracts import PLAN_LIMITS
from api.entitlements import effective_limits_for_scope, effective_plan_for_scope, feature_entitlements_for_scope, personal_plan_for_user
from api.models import (
    CreditLedgerEntry,
    EnterpriseContactRequest,
    GenerationTask,
    ProInvite,
    ProInviteRedemption,
    Project,
    SecurityEvent,
    UsageEvent,
    UserProfile,
    hash_pro_invite_code,
)
from api.scope import get_scope


class BillingPlansView(APIView):
    permission_classes = [IsAuthenticated]

    def _payload(self, user, org):
        profile, _ = UserProfile.objects.get_or_create(user=user)
        personal_plan = personal_plan_for_user(user)
        effective_plan = effective_plan_for_scope(user, org)
        effective_limits = effective_limits_for_scope(user, org)
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
        enterprise_request = EnterpriseContactRequest.objects.filter(user=user, organization=org).order_by('-created_at').first()

        return {
            'current_plan': effective_plan,
            'current_limits': effective_limits,
            'personal_plan': personal_plan,
            'personal_subscription': {
                'plan': personal_plan,
                'source': profile.subscription_source,
                'expires_at': profile.subscription_expires_at.isoformat() if profile.subscription_expires_at else None,
            },
            'organization_plan': org.subscription_plan,
            'effective_plan': effective_plan,
            'effective_limits': effective_limits,
            'feature_entitlements': feature_entitlements_for_scope(user, org),
            'project_count': project_count,
            'plans': PLAN_LIMITS,
            'can_redeem_pro_invite': personal_plan != 'pro',
            'enterprise_request_status': enterprise_request.status if enterprise_request else '',
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
        user, org, _, _ = get_scope(request)
        require_capability(user, org, 'billing_read')
        return Response(self._payload(user, org))

    def post(self, request):
        user, org, _, _ = get_scope(request)
        require_capability(user, org, 'billing_write')
        return Response(
            {'error': 'Plan changes require Pro invite redemption or platform admin approval.'},
            status=status.HTTP_403_FORBIDDEN,
        )


class ProInviteRedeemView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user, org, _, _ = get_scope(request)
        require_capability(user, org, 'billing_write')
        code = (request.data.get('code') or '').strip()
        if len(code) < 6:
            return Response({'error': '请输入有效的邀请码。'}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        code_hash = hash_pro_invite_code(code)
        with transaction.atomic():
            invite = ProInvite.objects.select_for_update().filter(code_hash=code_hash).first()
            if not invite:
                return Response({'error': '邀请码不存在或已失效。'}, status=status.HTTP_400_BAD_REQUEST)
            if not invite.is_active:
                return Response({'error': '邀请码已停用。'}, status=status.HTTP_400_BAD_REQUEST)
            if invite.expires_at and invite.expires_at <= now:
                return Response({'error': '邀请码已过期。'}, status=status.HTTP_400_BAD_REQUEST)
            if invite.used_count >= invite.max_uses:
                return Response({'error': '邀请码可用次数已用完。'}, status=status.HTTP_400_BAD_REQUEST)
            if ProInviteRedemption.objects.filter(invite=invite, user=user).exists():
                return Response({'error': '你已经兑换过这个邀请码。'}, status=status.HTTP_400_BAD_REQUEST)
            profile, _ = UserProfile.objects.select_for_update().get_or_create(user=user)
            old_plan = profile.subscription_plan
            profile.subscription_plan = 'pro'
            profile.subscription_source = 'invite_code'
            profile.subscription_expires_at = None
            profile.save(update_fields=['subscription_plan', 'subscription_source', 'subscription_expires_at', 'updated_at'])
            invite.used_count += 1
            invite.save(update_fields=['used_count'])
            ProInviteRedemption.objects.create(
                invite=invite,
                user=user,
                ip_address=request.META.get('REMOTE_ADDR'),
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:255],
            )
        record_audit_log(
            action='billing_change',
            actor=user,
            organization=org,
            target_type='user_profile',
            target_id=str(user.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'from': old_plan, 'to': 'pro', 'source': 'pro_invite', 'invite_id': invite.id},
        )
        SecurityEvent.objects.create(
            event_type='pro_invite_redeemed',
            user=user,
            email=user.email,
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:255],
            risk_level='low',
            metadata={'invite_id': invite.id, 'organization_id': org.id},
        )
        return Response(BillingPlansView()._payload(user, org))


class EnterpriseContactRequestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user, org, _, _ = get_scope(request)
        require_capability(user, org, 'billing_read')
        company_name = (request.data.get('company_name') or '').strip()
        contact_name = (request.data.get('contact_name') or '').strip()
        contact_email = (request.data.get('contact_email') or '').strip()
        if not company_name or not contact_name or not contact_email:
            return Response({'error': '请填写公司、联系人和邮箱。'}, status=status.HTTP_400_BAD_REQUEST)
        request_obj = EnterpriseContactRequest.objects.create(
            user=user,
            organization=org,
            company_name=company_name,
            contact_name=contact_name,
            contact_email=contact_email,
            contact_phone=(request.data.get('contact_phone') or '').strip(),
            team_size=(request.data.get('team_size') or '').strip(),
            requirements=(request.data.get('requirements') or '').strip(),
        )
        record_audit_log(
            action='billing_change',
            actor=user,
            organization=org,
            target_type='enterprise_contact_request',
            target_id=str(request_obj.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'company_name': company_name, 'source': 'billing_page'},
        )
        payload = BillingPlansView()._payload(user, org)
        payload['enterprise_request_status'] = request_obj.status
        return Response(payload, status=status.HTTP_201_CREATED)
