from __future__ import annotations

from django.contrib.auth.models import User
from rest_framework.permissions import BasePermission, SAFE_METHODS

from api.models import Membership, Organization
from api.rbac import permissions_for_role, role_at_least


def organization_for_user(user, organization: Organization | None) -> str | None:
    if not user or not getattr(user, 'is_authenticated', False) or organization is None:
        return None
    membership = Membership.objects.filter(user=user, organization=organization).only('role').first()
    return membership.role if membership else None


def organization_from_request(request) -> Organization | None:
    slug = request.query_params.get('organization') or request.data.get('organization')
    if slug:
        return Organization.objects.filter(slug=slug).first()
    org_id = request.query_params.get('organization_id') or request.data.get('organization_id')
    if org_id:
        return Organization.objects.filter(pk=org_id).first()
    return None


def resolve_staff_user_from_request(request) -> User | None:
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        organization = organization_from_request(request)
        if organization is None and (user.is_staff or user.is_superuser):
            return user
        role = organization_for_user(user, organization)
        if role_at_least(role, 'admin'):
            return user

    username = request.data.get('username') or request.query_params.get('username')
    if not username:
        return None
    candidate = User.objects.filter(username=username, is_active=True).first()
    if candidate and (candidate.is_staff or candidate.is_superuser):
        return candidate
    return None


class IsOrganizationMember(BasePermission):
    def has_permission(self, request, view):
        organization = getattr(view, 'organization', None) or organization_from_request(request)
        if organization is None:
            return True
        return organization_for_user(request.user, organization) is not None


class OrganizationRolePermission(BasePermission):
    required_role = 'viewer'
    allow_safe_without_membership = True

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS and self.allow_safe_without_membership:
            return True
        organization = getattr(view, 'organization', None) or organization_from_request(request)
        if organization is None:
            return bool(request.user and getattr(request.user, 'is_authenticated', False))
        role = organization_for_user(request.user, organization)
        return role_at_least(role, self.required_role)


class CanManageOrganization(OrganizationRolePermission):
    required_role = 'admin'


class CanManageAIConfiguration(BasePermission):
    """Allow platform AI config changes for authenticated admins or demo staff via username."""

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return resolve_staff_user_from_request(request) is not None


class CanWriteOrganization(OrganizationRolePermission):
    required_role = 'creator'


class CanOperateOrganization(OrganizationRolePermission):
    required_role = 'ops'


def user_can(user, organization: Organization | None, capability: str) -> bool:
    role = organization_for_user(user, organization)
    return capability in permissions_for_role(role)
