from django.utils.text import slugify
from rest_framework.exceptions import NotFound, PermissionDenied

from api.models import Campaign, Membership, Organization, Project


def authenticated_user(request):
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        return user
    return None


def get_scope(request):
    """Resolve the caller's tenant scope without mutating workspace data.

    Workspace creation belongs to explicit onboarding and collection POST
    endpoints. Keeping this resolver read-only prevents a GET request from
    silently creating projects or campaigns.
    """
    user = authenticated_user(request)
    if not user:
        raise PermissionDenied('Authentication required.')
    if user.is_superuser:
        raise PermissionDenied('超级管理员只能使用独立后台，不能访问普通工作台。')

    org_slug = request.query_params.get('organization') or request.data.get('organization')
    project_slug = request.query_params.get('project') or request.data.get('project')
    campaign_id = request.query_params.get('campaign') or request.data.get('campaign')

    org_query = Organization.objects.filter(memberships__user=user).distinct()
    org = org_query.filter(slug=org_slug).first() if org_slug else org_query.order_by('name').first()
    if not org:
        raise PermissionDenied('Organization membership required.')

    if project_slug:
        project = Project.objects.filter(slug=project_slug, organization=org).first()
        if not project:
            raise NotFound('Project not found in the selected organization.')
    else:
        project = Project.objects.filter(organization=org).order_by('-created_at').first()
    if campaign_id and not project:
        raise NotFound('A campaign cannot be selected without a project.')
    if campaign_id:
        campaign = Campaign.objects.filter(pk=campaign_id, project=project).first()
        if not campaign:
            raise NotFound('Campaign not found in the selected project.')
    elif project:
        campaign = Campaign.objects.filter(project=project).order_by('-created_at').first()
    else:
        campaign = None

    return user, org, project, campaign


def require_workspace_scope(request):
    """Resolve a complete workspace scope for endpoints that require a draft."""
    user, organization, project, campaign = get_scope(request)
    if project is None:
        raise NotFound('No project exists in the selected organization. Create a project first.')
    if campaign is None:
        raise NotFound('No campaign exists in the selected project. Create a campaign first.')
    return user, organization, project, campaign


def member_role(user, organization: Organization | None) -> str | None:
    if not user or not getattr(user, 'is_authenticated', False) or organization is None:
        return None
    membership = Membership.objects.filter(user=user, organization=organization).only('role').first()
    return membership.role if membership else None


def organization_queryset_for_user(user):
    if user and getattr(user, 'is_authenticated', False):
        return Organization.objects.filter(memberships__user=user).distinct()
    return Organization.objects.none()


def as_bool(value, default=True):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {'1', 'true', 'yes', 'on'}
    return bool(value)


def as_list(value):
    return value if isinstance(value, list) else []


def unique_slug(model, base_slug: str, exclude_pk: int | None = None, **filters) -> str:
    base = slugify(base_slug or 'untitled') or 'untitled'
    candidate = base
    index = 2
    query = model.objects.filter(**filters)
    if exclude_pk:
        query = query.exclude(pk=exclude_pk)
    while query.filter(slug=candidate).exists():
        candidate = f'{base}-{index}'
        index += 1
    return candidate
