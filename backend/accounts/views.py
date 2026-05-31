from django.contrib.auth import authenticate, login
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from api.audit import record_audit_log
from api.models import Membership
from api.permissions import CanManageOrganization
from api.scope import get_scope
from api.serializers import MembershipSerializer
from api.services import ensure_demo_workspace


class LoginView(APIView):
    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')

        if not username or not password:
            return Response({'error': '请输入用户名和密码'}, status=status.HTTP_400_BAD_REQUEST)

        user = authenticate(username=username, password=password)
        if user is not None:
            login(request, user)
            workspace = ensure_demo_workspace(user.username)
            record_audit_log(
                action='login',
                actor=user,
                organization=workspace['organization'],
                target_type='user',
                target_id=str(user.id),
                ip_address=request.META.get('REMOTE_ADDR'),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                metadata={'auth_type': 'session'},
            )
            return Response({
                'username': user.username,
                'email': user.email,
                'auth_type': 'session',
                'organization': workspace['organization'].slug,
                'project': workspace['project'].slug,
                'campaign': workspace['campaign'].id,
            }, status=status.HTTP_200_OK)
        return Response({'error': '用户名或密码错误。'}, status=status.HTTP_401_UNAUTHORIZED)


class MembershipCollectionView(APIView):
    permission_classes = [CanManageOrganization]

    def get(self, request):
        _, org, _, _ = get_scope(request)
        memberships = Membership.objects.filter(organization=org).select_related('user', 'organization').order_by('user__username')
        return Response(MembershipSerializer(memberships, many=True).data)

    def post(self, request):
        actor, org, _, _ = get_scope(request)
        user_id = request.data.get('user_id')
        username = request.data.get('username')
        user = User.objects.filter(pk=user_id).first() if user_id else User.objects.filter(username=username).first()
        if not user:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        role = request.data.get('role', 'viewer')
        if role not in dict(Membership.ROLE_CHOICES):
            return Response({'error': 'Unsupported role'}, status=status.HTTP_400_BAD_REQUEST)

        membership, _ = Membership.objects.update_or_create(user=user, organization=org, defaults={'role': role})
        record_audit_log(
            action='member_change',
            actor=actor,
            organization=org,
            target_type='membership',
            target_id=str(membership.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'user_id': user.id, 'role': role},
        )
        return Response(MembershipSerializer(membership).data, status=status.HTTP_201_CREATED)


class MembershipDetailView(APIView):
    permission_classes = [CanManageOrganization]

    def patch(self, request, pk: int):
        actor, org, _, _ = get_scope(request)
        membership = Membership.objects.filter(pk=pk, organization=org).select_related('user', 'organization').first()
        if not membership:
            return Response({'error': 'Membership not found'}, status=status.HTTP_404_NOT_FOUND)
        role = request.data.get('role', membership.role)
        if role not in dict(Membership.ROLE_CHOICES):
            return Response({'error': 'Unsupported role'}, status=status.HTTP_400_BAD_REQUEST)
        previous_role = membership.role
        membership.role = role
        membership.save(update_fields=['role'])
        record_audit_log(
            action='member_change',
            actor=actor,
            organization=org,
            target_type='membership',
            target_id=str(membership.id),
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'from': previous_role, 'to': role, 'user_id': membership.user_id},
        )
        return Response(MembershipSerializer(membership).data)

    def delete(self, request, pk: int):
        actor, org, _, _ = get_scope(request)
        membership = Membership.objects.filter(pk=pk, organization=org).first()
        if not membership:
            return Response({'error': 'Membership not found'}, status=status.HTTP_404_NOT_FOUND)
        target_id = str(membership.id)
        user_id = membership.user_id
        membership.delete()
        record_audit_log(
            action='member_change',
            actor=actor,
            organization=org,
            target_type='membership',
            target_id=target_id,
            ip_address=request.META.get('REMOTE_ADDR'),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            metadata={'deleted_user_id': user_id},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
