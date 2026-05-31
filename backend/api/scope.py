from django.utils.text import slugify

from api.models import Campaign, Membership, Organization, Project
from api.services import ensure_demo_workspace


def authenticated_user(request):
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        return user
    return None


def get_scope(request):
    user = authenticated_user(request)
    username = user.username if user else (request.query_params.get('username') or request.data.get('username'))
    workspace = ensure_demo_workspace(username)

    org_slug = request.query_params.get('organization') or request.data.get('organization')
    project_slug = request.query_params.get('project') or request.data.get('project')
    campaign_id = request.query_params.get('campaign') or request.data.get('campaign')

    if user:
        org_query = Organization.objects.filter(memberships__user=user).distinct()
        org = org_query.filter(slug=org_slug).first() if org_slug else org_query.order_by('name').first()
        if not org:
            org = workspace['organization']
            Membership.objects.get_or_create(user=user, organization=org, defaults={'role': 'admin' if user.is_staff else 'creator'})
    else:
        org = workspace['organization']
        if org_slug:
            org = Organization.objects.filter(slug=org_slug).first() or org

    project = workspace['project']
    if project_slug:
        project = Project.objects.filter(slug=project_slug, organization=org).first() or project
    else:
        project = Project.objects.filter(organization=org).order_by('-created_at').first() or workspace['project']
    if campaign_id:
        campaign = Campaign.objects.filter(pk=campaign_id, project=project).first()
    else:
        campaign = None
    if not campaign or campaign.project_id != project.id:
        campaign = Campaign.objects.filter(project=project).order_by('-created_at').first()
    if not campaign:
        campaign = Campaign.objects.create(
            project=project,
            name='Default Campaign',
            objective='Default campaign workspace',
        )

    return user or workspace['user'], org, project, campaign


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
