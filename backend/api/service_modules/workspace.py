import json
from decimal import Decimal
from typing import Any

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from api.contracts import NODE_IO_SCHEMAS, NODE_TYPE_ALIASES, PLAN_LIMITS, normalize_schema, validate_workflow_graph
from api.image_style_skills import DEFAULT_IMAGE_STYLE_SKILL_ID, resolve_style_skill
from api.audit import record_audit_log
from api.serializers import (
    AssetSerializer,
    CampaignSerializer,
    CommunityCreationSerializer,
    FolderSerializer,
    OrganizationSerializer,
    ProjectSerializer,
    TaskSerializer,
    WorkflowRunSerializer,
    WorkflowTemplateSerializer,
    WorkspaceDraftSerializer,
)
from api.models import (
    AIConfiguration,
    Asset,
    Campaign,
    CommunityCreation,
    Folder,
    GenerationTask,
    Membership,
    Organization,
    Project,
    UsageEvent,
    WorkflowRun,
    WorkflowTemplate,
    WorkspaceDraft,
)

def membership_role(user: User | None, organization: Organization | None) -> str | None:
    if not user or not getattr(user, 'is_authenticated', False) or organization is None:
        return None
    membership = Membership.objects.filter(user=user, organization=organization).only('role').first()
    return membership.role if membership else None

def get_user_workspace(user: User) -> dict[str, Any]:
    """Return the user's current workspace without creating hidden sample data."""
    membership = Membership.objects.filter(user=user).select_related('organization').order_by('created_at').first()
    org = membership.organization if membership else None
    project = Project.objects.filter(organization=org).order_by('-created_at').first() if org else None
    campaign = Campaign.objects.filter(project=project).order_by('-created_at').first() if project else None
    return {
        'organization': org,
        'project': project,
        'campaign': campaign,
        'user': user,
        'membership': membership,
        'is_complete': bool(org and project and campaign),
    }


def serialize_organization(org: Organization) -> dict[str, Any]:
    return OrganizationSerializer(org).data


def serialize_project(project: Project) -> dict[str, Any]:
    return ProjectSerializer(project).data


def serialize_folder(folder: Folder) -> dict[str, Any]:
    return FolderSerializer(folder).data


def serialize_campaign(campaign: Campaign) -> dict[str, Any]:
    return CampaignSerializer(campaign).data


def serialize_workspace_draft(draft: WorkspaceDraft) -> dict[str, Any]:
    return WorkspaceDraftSerializer(draft).data


def serialize_workflow_template(template: WorkflowTemplate) -> dict[str, Any]:
    return WorkflowTemplateSerializer(template).data


def serialize_workflow_run(run: WorkflowRun) -> dict[str, Any]:
    return WorkflowRunSerializer(run).data


def serialize_asset(asset: Asset) -> dict[str, Any]:
    return AssetSerializer(asset).data


def serialize_task(task: GenerationTask) -> dict[str, Any]:
    return TaskSerializer(task).data
