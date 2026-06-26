import json
from decimal import Decimal
from typing import Any

from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from api.contracts import NODE_IO_SCHEMAS, NODE_TYPE_ALIASES, PLAN_LIMITS, normalize_schema, validate_workflow_graph
from api.image_style_skills import DEFAULT_IMAGE_STYLE_SKILL_ID, resolve_style_skill
from ai_gateway.services import AIModelGateway
from api.audit import record_audit_log
from api.serializers import (
    AssetSerializer,
    CampaignSerializer,
    CommunityCreationSerializer,
    FolderSerializer,
    OrganizationSerializer,
    ProjectSerializer,
    TaskSerializer,
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
    WorkflowTemplate,
    WorkspaceDraft,
)

def membership_role(user: User | None, organization: Organization | None) -> str | None:
    if not user or not getattr(user, 'is_authenticated', False) or organization is None:
        return None
    membership = Membership.objects.filter(user=user, organization=organization).only('role').first()
    return membership.role if membership else None

def ensure_demo_workspace(username: str | None = None) -> dict[str, Any]:
    org, _ = Organization.objects.get_or_create(
        slug='marketing-hub',
        defaults={'name': 'Marketing Hub'},
    )
    project, _ = Project.objects.get_or_create(
        organization=org,
        slug='core-launch',
        defaults={
            'name': 'Core Launch',
            'brief': 'Default workspace for the local upgrade scaffold.',
        },
    )
    campaign, _ = Campaign.objects.get_or_create(
        project=project,
        name='Product Launch',
        defaults={'objective': 'Keep the default demo workflow live'},
    )

    user_obj = None
    if username is None:
        username = settings.MARKETING_HUB_DEMO_USERNAME
    if username:
        user_obj = User.objects.filter(username=username).first()
        if user_obj:
            if user_obj.is_superuser:
                user_obj = None
            else:
                Membership.objects.get_or_create(user=user_obj, organization=org, defaults={'role': 'admin'})

    return {
        'organization': org,
        'project': project,
        'campaign': campaign,
        'user': user_obj,
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


def serialize_asset(asset: Asset) -> dict[str, Any]:
    return AssetSerializer(asset).data


def serialize_task(task: GenerationTask) -> dict[str, Any]:
    return TaskSerializer(task).data
