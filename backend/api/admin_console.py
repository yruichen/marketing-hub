from decimal import Decimal

from django.contrib.auth.models import User
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.email import EmailDeliveryError
from accounts.views import _send_password_reset_email, _send_verification_email
from api.audit import record_audit_log
from api.models import (
    AuditLog,
    CreditGrant,
    CreditLedgerEntry,
    GenerationTask,
    Membership,
    Organization,
    SecurityEvent,
    SignupInvite,
    UsageEvent,
    UserProfile,
    hash_signup_invite_code,
)


class IsPlatformAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    return (forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')) or None


def _money_from_cents(cents: int) -> str:
    return str(Decimal(cents) / Decimal('100'))


def _profile_payload(user: User):
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'is_active': user.is_active,
        'is_staff': user.is_staff,
        'is_superuser': user.is_superuser,
        'last_login': user.last_login.isoformat() if user.last_login else None,
        'date_joined': user.date_joined.isoformat(),
        'profile': {
            'email_verified': profile.email_verified,
            'status': profile.status,
            'signup_source': profile.signup_source,
            'signup_ip': profile.signup_ip,
            'last_login_ip': profile.last_login_ip,
        },
        'organizations': [
            {
                'id': membership.organization_id,
                'name': membership.organization.name,
                'slug': membership.organization.slug,
                'role': membership.role,
            }
            for membership in user.memberships.select_related('organization').all()
        ],
    }


def _user_detail_payload(user: User):
    payload = _profile_payload(user)
    org_ids = [org['id'] for org in payload['organizations']]
    payload['security_events'] = [
        {
            'id': event.id,
            'event_type': event.event_type,
            'ip_address': event.ip_address,
            'risk_level': event.risk_level,
            'metadata': event.metadata,
            'created_at': event.created_at.isoformat(),
        }
        for event in user.security_events.order_by('-created_at')[:20]
    ]
    payload['credit_grants'] = [
        {
            'id': entry.id,
            'organization_id': entry.organization_id,
            'organization': entry.organization.name,
            'delta_cents': entry.delta_cents,
            'balance_after_cents': entry.balance_after_cents,
            'metadata': entry.metadata,
            'created_at': entry.created_at.isoformat(),
        }
        for entry in CreditLedgerEntry.objects.select_related('organization')
        .filter(organization_id__in=org_ids, source='grant', metadata__target_user_id=user.id)
        .order_by('-created_at')[:20]
    ]
    return payload


def _org_payload(org: Organization):
    credit_balance = org.credit_ledger.aggregate(value=Sum('delta_cents'))['value'] or 0
    usage = org.usage_events.aggregate(tokens=Sum('total_tokens'), cost=Sum('cost_usd'))
    return {
        'id': org.id,
        'name': org.name,
        'slug': org.slug,
        'subscription_plan': org.subscription_plan,
        'created_at': org.created_at.isoformat(),
        'member_count': org.memberships.count(),
        'project_count': org.projects.filter(is_archived=False).count(),
        'task_count': org.generation_tasks.count(),
        'credit_balance_cents': credit_balance,
        'credit_balance_usd': _money_from_cents(credit_balance),
        'total_tokens': usage['tokens'] or 0,
        'total_cost_usd': str(usage['cost'] or Decimal('0')),
    }


class AdminSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def get(self, request):
        today = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        task_counts = {
            item['status']: item['count']
            for item in GenerationTask.objects.values('status').annotate(count=Count('id'))
        }
        usage = UsageEvent.objects.aggregate(tokens=Sum('total_tokens'), cost=Sum('cost_usd'))
        return Response({
            'users': {
                'total': User.objects.count(),
                'today': User.objects.filter(date_joined__gte=today).count(),
                'pending': UserProfile.objects.filter(status='pending').count(),
                'suspended': UserProfile.objects.filter(status='suspended').count(),
            },
            'organizations': {
                'total': Organization.objects.count(),
                'free': Organization.objects.filter(subscription_plan='free').count(),
                'pro': Organization.objects.filter(subscription_plan='pro').count(),
                'enterprise': Organization.objects.filter(subscription_plan='enterprise').count(),
            },
            'tasks': {
                'total': GenerationTask.objects.count(),
                'today': GenerationTask.objects.filter(created_at__gte=today).count(),
                'queued': task_counts.get('queued', 0),
                'running': task_counts.get('running', 0),
                'succeeded': task_counts.get('succeeded', 0),
                'failed': task_counts.get('failed', 0),
            },
            'usage': {
                'total_tokens': usage['tokens'] or 0,
                'total_cost_usd': str(usage['cost'] or Decimal('0')),
            },
            'recent_security_events': [
                {
                    'id': event.id,
                    'event_type': event.event_type,
                    'email': event.email,
                    'risk_level': event.risk_level,
                    'created_at': event.created_at.isoformat(),
                }
                for event in SecurityEvent.objects.order_by('-created_at')[:8]
            ],
        })


class AdminUserListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def get(self, request):
        query = (request.query_params.get('q') or '').strip()
        status_filter = (request.query_params.get('status') or '').strip()
        email_verified = (request.query_params.get('email_verified') or '').strip().lower()
        is_active = (request.query_params.get('is_active') or '').strip().lower()
        signup_source = (request.query_params.get('signup_source') or '').strip()
        users = User.objects.select_related('profile').prefetch_related('memberships__organization').order_by('-date_joined')
        if query:
            users = users.filter(Q(username__icontains=query) | Q(email__icontains=query) | Q(profile__signup_ip__icontains=query) | Q(profile__last_login_ip__icontains=query))
        if status_filter:
            users = users.filter(profile__status=status_filter)
        if email_verified in {'true', 'false'}:
            users = users.filter(profile__email_verified=email_verified == 'true')
        if is_active in {'true', 'false'}:
            users = users.filter(is_active=is_active == 'true')
        if signup_source:
            users = users.filter(profile__signup_source=signup_source)
        return Response({'results': [_profile_payload(user) for user in users[:80]]})


class AdminUserDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def get(self, request, pk: int):
        user = User.objects.filter(pk=pk).prefetch_related('memberships__organization').first()
        if not user:
            return Response({'error': '用户不存在。'}, status=status.HTTP_404_NOT_FOUND)
        return Response(_user_detail_payload(user))

    def patch(self, request, pk: int):
        user = User.objects.filter(pk=pk).first()
        if not user:
            return Response({'error': '用户不存在。'}, status=status.HTTP_404_NOT_FOUND)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        old_profile = {'status': profile.status, 'email_verified': profile.email_verified, 'is_active': user.is_active}

        if 'is_staff' in request.data or request.data.get('password'):
            return Response({'error': '该接口不允许修改 staff 权限或直接设置密码。'}, status=status.HTTP_400_BAD_REQUEST)

        if 'status' in request.data:
            next_status = request.data.get('status')
            if next_status not in dict(UserProfile.STATUS_CHOICES):
                return Response({'error': '账号状态不支持。'}, status=status.HTTP_400_BAD_REQUEST)
            if user.id == request.user.id and next_status in {'suspended', 'deleted'}:
                return Response({'error': '不能冻结或删除当前管理员账号。'}, status=status.HTTP_400_BAD_REQUEST)
            profile.status = next_status
        if 'email_verified' in request.data:
            profile.email_verified = bool(request.data.get('email_verified'))
        if 'is_active' in request.data:
            next_active = bool(request.data.get('is_active'))
            if user.id == request.user.id and not next_active:
                return Response({'error': '不能停用当前管理员账号。'}, status=status.HTTP_400_BAD_REQUEST)
            user.is_active = next_active

        user.save(update_fields=['is_active'])
        profile.save(update_fields=['status', 'email_verified', 'updated_at'])
        next_profile = {'status': profile.status, 'email_verified': profile.email_verified, 'is_active': user.is_active}
        membership = Membership.objects.filter(user=user).select_related('organization').first()
        record_audit_log(
            action='member_change',
            actor=request.user,
            organization=membership.organization if membership else None,
            target_type='user_profile',
            target_id=str(profile.id),
            ip_address=_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'from': old_profile, 'to': next_profile, 'source': 'admin_console'},
        )
        if old_profile['status'] != profile.status:
            SecurityEvent.objects.create(
                event_type='account_suspended' if profile.status == 'suspended' else 'account_unsuspended',
                user=user,
                email=user.email,
                ip_address=_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:255],
                risk_level='medium' if profile.status == 'suspended' else 'low',
                metadata={'admin_user_id': request.user.id, 'from': old_profile['status'], 'to': profile.status},
            )
        return Response(_profile_payload(user))


class AdminUserActionView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def post(self, request, pk: int, action: str):
        user = User.objects.filter(pk=pk).first()
        if not user:
            return Response({'error': '用户不存在。'}, status=status.HTTP_404_NOT_FOUND)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        old_profile = {'status': profile.status, 'email_verified': profile.email_verified, 'is_active': user.is_active}

        if action in {'freeze', 'disable', 'delete'} and user.id == request.user.id:
            return Response({'error': '不能对当前管理员账号执行自锁操作。'}, status=status.HTTP_400_BAD_REQUEST)

        event_type = ''
        risk_level = 'low'
        if action == 'freeze':
            profile.status = 'suspended'
            event_type = 'account_suspended'
            risk_level = 'medium'
        elif action == 'unfreeze':
            profile.status = 'active'
            event_type = 'account_unsuspended'
        elif action == 'disable':
            user.is_active = False
            event_type = 'login_disabled'
            risk_level = 'medium'
        elif action == 'enable':
            user.is_active = True
            if profile.status == 'deleted':
                profile.status = 'active'
            event_type = 'login_enabled'
        elif action == 'mark-email-verified':
            profile.email_verified = True
            if profile.status == 'pending':
                profile.status = 'active'
            event_type = 'email_marked_verified'
        elif action == 'send-password-reset':
            if not user.email:
                return Response({'error': '该用户没有邮箱，无法发送重置链接。'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                _send_password_reset_email(user)
            except EmailDeliveryError:
                return Response({'error': '重置邮件发送失败，请检查邮件配置。'}, status=status.HTTP_502_BAD_GATEWAY)
            event_type = 'password_reset_sent'
        elif action == 'resend-verification':
            if not user.email:
                return Response({'error': '该用户没有邮箱，无法发送验证邮件。'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                _send_verification_email(user)
            except EmailDeliveryError:
                return Response({'error': '验证邮件发送失败，请检查邮件配置。'}, status=status.HTTP_502_BAD_GATEWAY)
            event_type = 'verification_resent'
        else:
            return Response({'error': '不支持的账号操作。'}, status=status.HTTP_400_BAD_REQUEST)

        user.save(update_fields=['is_active'])
        profile.save(update_fields=['status', 'email_verified', 'updated_at'])
        next_profile = {'status': profile.status, 'email_verified': profile.email_verified, 'is_active': user.is_active}
        membership = Membership.objects.filter(user=user).select_related('organization').first()
        record_audit_log(
            action='member_change',
            actor=request.user,
            organization=membership.organization if membership else None,
            target_type='user_profile',
            target_id=str(profile.id),
            ip_address=_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'from': old_profile, 'to': next_profile, 'source': 'admin_console_account_action', 'action': action},
        )
        SecurityEvent.objects.create(
            event_type=event_type,
            user=user,
            email=user.email,
            ip_address=_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:255],
            risk_level=risk_level,
            metadata={'admin_user_id': request.user.id, 'action': action},
        )
        return Response(_user_detail_payload(user))


class AdminUserCreditGrantView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def post(self, request, pk: int):
        user = User.objects.filter(pk=pk).prefetch_related('memberships__organization').first()
        if not user:
            return Response({'error': '用户不存在。'}, status=status.HTTP_404_NOT_FOUND)
        amount_cents = int(request.data.get('amount_cents') or 0)
        reason = (request.data.get('reason') or '').strip()
        organization_id = request.data.get('organization_id')
        org = Organization.objects.filter(pk=organization_id, memberships__user=user).first()
        if not org:
            return Response({'error': '请选择该用户所属的目标组织。'}, status=status.HTTP_400_BAD_REQUEST)
        if amount_cents <= 0:
            return Response({'error': '额度金额必须大于 0。'}, status=status.HTTP_400_BAD_REQUEST)
        if not reason:
            return Response({'error': '请输入发放原因。'}, status=status.HTTP_400_BAD_REQUEST)
        grant = CreditGrant.objects.create(organization=org, granted_by=request.user, amount_cents=amount_cents, reason=reason)
        balance = CreditLedgerEntry.objects.filter(organization=org).aggregate(value=Sum('delta_cents'))['value'] or 0
        metadata = {
            'target_user_id': user.id,
            'target_username': user.username,
            'target_organization_id': org.id,
            'amount_cents': amount_cents,
            'reason': reason,
            'admin_user_id': request.user.id,
            'source': 'admin_console_user_grant',
        }
        CreditLedgerEntry.objects.create(
            organization=org,
            source='grant',
            delta_cents=amount_cents,
            balance_after_cents=balance + amount_cents,
            credit_grant=grant,
            metadata=metadata,
        )
        record_audit_log(
            action='billing_change',
            actor=request.user,
            organization=org,
            target_type='credit_grant',
            target_id=str(grant.id),
            ip_address=_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata=metadata,
        )
        SecurityEvent.objects.create(
            event_type='credit_grant_issued',
            user=user,
            email=user.email,
            ip_address=_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:255],
            risk_level='low',
            metadata=metadata,
        )
        return Response(_user_detail_payload(user), status=status.HTTP_201_CREATED)


class AdminOrganizationListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def get(self, request):
        query = (request.query_params.get('q') or '').strip()
        orgs = Organization.objects.order_by('-created_at')
        if query:
            orgs = orgs.filter(Q(name__icontains=query) | Q(slug__icontains=query))
        return Response({'results': [_org_payload(org) for org in orgs[:80]]})


class AdminOrganizationDetailView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def patch(self, request, pk: int):
        org = Organization.objects.filter(pk=pk).first()
        if not org:
            return Response({'error': '组织不存在。'}, status=status.HTTP_404_NOT_FOUND)
        old_plan = org.subscription_plan
        plan = request.data.get('subscription_plan')
        if plan:
            if plan not in dict(Organization.PLAN_CHOICES):
                return Response({'error': '套餐不支持。'}, status=status.HTTP_400_BAD_REQUEST)
            org.subscription_plan = plan
            org.save(update_fields=['subscription_plan'])
            record_audit_log(
                action='billing_change',
                actor=request.user,
                organization=org,
                target_type='organization',
                target_id=str(org.id),
                ip_address=_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                metadata={'from': old_plan, 'to': plan, 'source': 'admin_console'},
            )
        return Response(_org_payload(org))


class AdminCreditGrantView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def post(self, request, pk: int):
        org = Organization.objects.filter(pk=pk).first()
        if not org:
            return Response({'error': '组织不存在。'}, status=status.HTTP_404_NOT_FOUND)
        amount_cents = int(request.data.get('amount_cents') or 0)
        reason = (request.data.get('reason') or '').strip()
        if amount_cents <= 0:
            return Response({'error': '额度金额必须大于 0。'}, status=status.HTTP_400_BAD_REQUEST)
        if not reason:
            return Response({'error': '请输入发放原因。'}, status=status.HTTP_400_BAD_REQUEST)
        grant = CreditGrant.objects.create(organization=org, granted_by=request.user, amount_cents=amount_cents, reason=reason)
        balance = CreditLedgerEntry.objects.filter(organization=org).aggregate(value=Sum('delta_cents'))['value'] or 0
        CreditLedgerEntry.objects.create(
            organization=org,
            source='grant',
            delta_cents=amount_cents,
            balance_after_cents=balance + amount_cents,
            credit_grant=grant,
            metadata={'reason': reason, 'admin_user_id': request.user.id},
        )
        record_audit_log(
            action='billing_change',
            actor=request.user,
            organization=org,
            target_type='credit_grant',
            target_id=str(grant.id),
            ip_address=_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'amount_cents': amount_cents, 'reason': reason, 'source': 'admin_console'},
        )
        return Response(_org_payload(org), status=status.HTTP_201_CREATED)


class AdminTaskListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def get(self, request):
        tasks = GenerationTask.objects.select_related('organization', 'project', 'requested_by').order_by('-created_at')[:80]
        return Response({'results': [
            {
                'id': task.id,
                'task_type': task.task_type,
                'status': task.status,
                'organization': task.organization.slug,
                'project': task.project.name if task.project_id else '',
                'requested_by': task.requested_by.username if task.requested_by_id else '',
                'token_count': task.token_count,
                'cost_usd': str(task.cost_usd),
                'error_message': task.error_message,
                'created_at': task.created_at.isoformat(),
            }
            for task in tasks
        ]})


class AdminAuditLogListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def get(self, request):
        logs = AuditLog.objects.select_related('actor', 'organization').order_by('-created_at')[:100]
        return Response({'results': [
            {
                'id': log.id,
                'action': log.action,
                'actor': log.actor.username if log.actor_id else '',
                'organization': log.organization.slug if log.organization_id else '',
                'target_type': log.target_type,
                'target_id': log.target_id,
                'ip_address': log.ip_address,
                'metadata': log.metadata,
                'created_at': log.created_at.isoformat(),
            }
            for log in logs
        ]})


class AdminSecurityEventListView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def get(self, request):
        events = SecurityEvent.objects.select_related('user').order_by('-created_at')[:100]
        return Response({'results': [
            {
                'id': event.id,
                'event_type': event.event_type,
                'user': event.user.username if event.user_id else '',
                'email': event.email,
                'ip_address': event.ip_address,
                'risk_level': event.risk_level,
                'metadata': event.metadata,
                'created_at': event.created_at.isoformat(),
            }
            for event in events
        ]})


class AdminInviteListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsPlatformAdmin]

    def get(self, request):
        return Response({'results': [
            {
                'id': invite.id,
                'label': invite.label,
                'code_hash_preview': f'{invite.code_hash[:10]}...{invite.code_hash[-6:]}',
                'max_uses': invite.max_uses,
                'used_count': invite.used_count,
                'is_active': invite.is_active,
                'expires_at': invite.expires_at.isoformat() if invite.expires_at else None,
                'created_by': invite.created_by.username if invite.created_by_id else '',
                'created_at': invite.created_at.isoformat(),
            }
            for invite in SignupInvite.objects.select_related('created_by').order_by('-created_at')[:80]
        ]})

    def post(self, request):
        code = (request.data.get('code') or '').strip()
        label = (request.data.get('label') or '').strip()
        max_uses = int(request.data.get('max_uses') or 1)
        if len(code) < 6:
            return Response({'error': '邀请码至少 6 位。'}, status=status.HTTP_400_BAD_REQUEST)
        invite = SignupInvite.objects.create(
            code_hash=hash_signup_invite_code(code),
            label=label or '测试邀请',
            max_uses=max_uses,
            created_by=request.user,
        )
        record_audit_log(
            action='member_change',
            actor=request.user,
            target_type='signup_invite',
            target_id=str(invite.id),
            ip_address=_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'label': invite.label, 'max_uses': invite.max_uses, 'source': 'admin_console'},
        )
        return Response({
            'id': invite.id,
            'label': invite.label,
            'code_hash_preview': f'{invite.code_hash[:10]}...{invite.code_hash[-6:]}',
            'max_uses': invite.max_uses,
            'used_count': invite.used_count,
            'is_active': invite.is_active,
            'expires_at': None,
            'created_by': request.user.username,
            'created_at': invite.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)
