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

def folder_path_from_request(request, org: Organization) -> Folder | None:
    folder_id = request.data.get('folder_id')
    if folder_id:
        return Folder.objects.filter(pk=folder_id, organization=org).first()

    folder_path = str(request.data.get('folder_path') or '').strip().strip('/')
    if not folder_path:
        return None

    parent = None
    for index, raw_name in enumerate(part for part in folder_path.split('/') if part.strip()):
        name = raw_name.strip()
        slug = slugify(name) or f'folder-{index + 1}'
        folder, _ = Folder.objects.get_or_create(
            organization=org,
            parent=parent,
            slug=slug,
            defaults={'name': name, 'sort_order': index},
        )
        parent = folder
    return parent


def build_project_search_query(query: str):
    return (
        Q(name__icontains=query)
        | Q(brief__icontains=query)
        | Q(folder_path__icontains=query)
        | Q(status_tag__icontains=query)
        | Q(brand_context__brand_name__icontains=query)
        | Q(brand_context__campaign_goal__icontains=query)
        | Q(brand_context__audience__icontains=query)
    )

def _get_user_by_username(username: str | None):
    if not username:
        return None
    return User.objects.filter(username=username).first()
