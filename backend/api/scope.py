from django.utils.text import slugify

from api.models import Campaign, Organization, Project
from api.services import ensure_demo_workspace


def get_scope(request):
    username = request.query_params.get('username') or request.data.get('username')
    workspace = ensure_demo_workspace(username)
    org = workspace['organization']
    project = workspace['project']
    campaign = workspace['campaign']

    org_slug = request.query_params.get('organization') or request.data.get('organization')
    project_slug = request.query_params.get('project') or request.data.get('project')
    campaign_id = request.query_params.get('campaign') or request.data.get('campaign')

    if org_slug:
        org = Organization.objects.filter(slug=org_slug).first() or org
    if project_slug:
        project = Project.objects.filter(slug=project_slug, organization=org).first() or project
    if campaign_id:
        campaign = Campaign.objects.filter(pk=campaign_id, project=project).first()
    if not campaign or campaign.project_id != project.id:
        campaign = Campaign.objects.filter(project=project).order_by('-created_at').first()
    if not campaign:
        campaign = Campaign.objects.create(
            project=project,
            name='Default Campaign',
            objective='Default campaign workspace',
        )

    return workspace['user'], org, project, campaign


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

