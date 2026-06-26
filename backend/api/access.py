from __future__ import annotations

from rest_framework.exceptions import NotFound, PermissionDenied

from api.models import (
    Asset,
    Campaign,
    Folder,
    GenerationTask,
    Membership,
    Organization,
    Project,
    WorkspaceDraft,
    WorkflowTemplate,
)
from api.rbac import permissions_for_role, role_at_least


def role_for(user, organization: Organization | None) -> str | None:
    if not user or not getattr(user, 'is_authenticated', False) or organization is None:
        return None
    membership = Membership.objects.filter(user=user, organization=organization).only('role').first()
    return membership.role if membership else None


def require_member(user, organization: Organization) -> str:
    role = role_for(user, organization)
    if not role:
        raise PermissionDenied('Organization membership required.')
    return role


def require_role(user, organization: Organization, minimum_role: str) -> str:
    role = require_member(user, organization)
    if not role_at_least(role, minimum_role):
        raise PermissionDenied('Insufficient organization role.')
    return role


def require_capability(user, organization: Organization, capability: str) -> str:
    role = require_member(user, organization)
    if capability not in permissions_for_role(role):
        raise PermissionDenied('Insufficient organization capability.')
    return role


def get_organization_for_member(user, *, slug: str | None = None, pk: int | str | None = None) -> Organization:
    query = Organization.objects.filter(memberships__user=user).distinct()
    if slug:
        query = query.filter(slug=slug)
    if pk:
        query = query.filter(pk=pk)
    organization = query.first()
    if not organization:
        raise NotFound('Organization not found.')
    return organization


def get_project_for_member(user, pk: int | str) -> Project:
    project = Project.objects.select_related('organization', 'folder').filter(
        pk=pk,
        organization__memberships__user=user,
    ).first()
    if not project:
        raise NotFound('Project not found.')
    return project


def get_folder_for_member(user, pk: int | str) -> Folder:
    folder = Folder.objects.select_related('organization', 'parent').filter(
        pk=pk,
        organization__memberships__user=user,
    ).first()
    if not folder:
        raise NotFound('Folder not found.')
    return folder


def get_campaign_for_member(user, pk: int | str) -> Campaign:
    campaign = Campaign.objects.select_related('project', 'project__organization').filter(
        pk=pk,
        project__organization__memberships__user=user,
    ).first()
    if not campaign:
        raise NotFound('Campaign not found.')
    return campaign


def get_draft_for_member(user, pk: int | str) -> WorkspaceDraft:
    draft = WorkspaceDraft.objects.select_related('organization', 'project', 'campaign').filter(
        pk=pk,
        organization__memberships__user=user,
    ).first()
    if not draft:
        raise NotFound('Draft not found.')
    return draft


def get_template_for_member(user, pk: int | str) -> WorkflowTemplate:
    template = WorkflowTemplate.objects.select_related('organization', 'source_project', 'source_campaign').filter(
        pk=pk,
    ).filter(
        is_public=True
    ).first()
    if not template:
        template = WorkflowTemplate.objects.select_related('organization', 'source_project', 'source_campaign').filter(
            pk=pk,
            organization__memberships__user=user,
        ).first()
    if not template:
        raise NotFound('Template not found.')
    return template


def get_asset_for_member(user, pk: int | str) -> Asset:
    asset = Asset.objects.select_related('organization', 'project', 'campaign').filter(
        pk=pk,
        organization__memberships__user=user,
    ).first()
    if not asset:
        raise NotFound('Asset not found.')
    return asset


def get_task_for_member(user, pk: int | str) -> GenerationTask:
    task = GenerationTask.objects.select_related('organization', 'project', 'campaign').filter(
        pk=pk,
        organization__memberships__user=user,
    ).first()
    if not task:
        raise NotFound('Task not found.')
    return task
