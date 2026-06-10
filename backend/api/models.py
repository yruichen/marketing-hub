import json

from django.contrib.auth.models import User
from django.db import models


class Organization(models.Model):
    PLAN_CHOICES = [
        ('free', 'Free'),
        ('pro', 'Pro'),
        ('enterprise', 'Enterprise'),
    ]

    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)
    subscription_plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default='free')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name


class Membership(models.Model):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('creator', 'Creator'),
        ('ops', 'Ops'),
        ('viewer', 'Viewer'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='memberships')
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='creator')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('user', 'organization')]

    def __str__(self) -> str:
        return f'{self.user.username} @ {self.organization.slug} ({self.role})'


class Folder(models.Model):
    PERMISSION_CHOICES = [
        ('workspace', 'Workspace'),
        ('private', 'Private'),
        ('restricted', 'Restricted'),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='folders')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, related_name='children', null=True, blank=True)
    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140)
    sort_order = models.IntegerField(default=0)
    permission_scope = models.CharField(max_length=20, choices=PERMISSION_CHOICES, default='workspace')
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['parent_id', 'sort_order', 'name']
        unique_together = [('organization', 'parent', 'slug')]

    def __str__(self) -> str:
        return self.path

    @property
    def path(self) -> str:
        names = [self.name]
        parent = self.parent
        while parent:
            names.append(parent.name)
            parent = parent.parent
        return '/'.join(reversed(names))


class Project(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='projects')
    folder = models.ForeignKey(Folder, on_delete=models.SET_NULL, related_name='projects', null=True, blank=True)
    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180)
    brief = models.TextField(blank=True, default='')
    brand_context = models.JSONField(default=dict, blank=True)
    folder_path = models.CharField(max_length=255, blank=True, default='')
    platform_tags = models.JSONField(default=list, blank=True)
    status_tag = models.CharField(max_length=40, default='creating')
    sort_order = models.IntegerField(default=0)
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('organization', 'slug')]
        ordering = ['folder_path', 'sort_order', '-created_at']

    def __str__(self) -> str:
        return f'{self.organization.slug}/{self.slug}'


class Campaign(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='campaigns')
    name = models.CharField(max_length=160)
    objective = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=32, default='active')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.project.slug}:{self.name}'


class Asset(models.Model):
    ASSET_TYPES = [
        ('image', 'Image'),
        ('audio', 'Audio'),
        ('video', 'Video'),
        ('document', 'Document'),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='assets')
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='assets')
    campaign = models.ForeignKey(Campaign, on_delete=models.SET_NULL, null=True, blank=True, related_name='assets')
    asset_type = models.CharField(max_length=20, choices=ASSET_TYPES)
    title = models.CharField(max_length=255)
    source_url = models.CharField(max_length=600, blank=True, default='')
    tags = models.JSONField(default=list, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.title


class GenerationTask(models.Model):
    TASK_TYPES = [
        ('copy', 'Marketing Copywriting'),
        ('image', 'Social Media Image'),
        ('storyboard', 'Storyboard Script'),
        ('audio', 'AI Voiceover'),
        ('rag_search', 'Semantic Retrieval'),
        ('custom_agent', 'Custom Agent'),
        ('brainstorm', 'Workflow Brainstorm'),
    ]

    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('succeeded', 'Succeeded'),
        ('failed', 'Failed'),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='generation_tasks')
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='generation_tasks')
    campaign = models.ForeignKey(Campaign, on_delete=models.SET_NULL, null=True, blank=True, related_name='generation_tasks')
    requested_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='generation_tasks')
    task_type = models.CharField(max_length=20, choices=TASK_TYPES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='queued')
    payload = models.JSONField(default=dict)
    result = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True, default='')
    celery_task_id = models.CharField(max_length=255, blank=True, default='')
    token_count = models.IntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.task_type}:{self.status}:{self.id}'


class WorkspaceDraft(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('running', 'Running'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='workspace_drafts')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='workspace_drafts')
    campaign = models.ForeignKey(Campaign, on_delete=models.SET_NULL, null=True, blank=True, related_name='workspace_drafts')
    name = models.CharField(max_length=160, default='Default Workflow')
    brand_context = models.JSONField(default=dict, blank=True)
    nodes = models.JSONField(default=list, blank=True)
    edges = models.JSONField(default=list, blank=True)
    viewport = models.JSONField(default=dict, blank=True)
    selected_node_id = models.CharField(max_length=80, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    last_run_summary = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        unique_together = [('project', 'campaign', 'name')]

    def __str__(self) -> str:
        return f'{self.project.slug}:{self.name}'


class WorkflowTemplate(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_templates')
    source_project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_templates')
    source_campaign = models.ForeignKey(Campaign, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_templates')
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True, default='')
    author_username = models.CharField(max_length=100, default='ROOT')
    brand_context = models.JSONField(default=dict, blank=True)
    nodes = models.JSONField(default=list, blank=True)
    edges = models.JSONField(default=list, blank=True)
    preview_image_url = models.CharField(max_length=600, blank=True, default='')
    tags = models.JSONField(default=list, blank=True)
    is_public = models.BooleanField(default=True)
    fork_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.title


class UsageEvent(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='usage_events')
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='usage_events')
    campaign = models.ForeignKey(Campaign, on_delete=models.SET_NULL, null=True, blank=True, related_name='usage_events')
    generation_task = models.ForeignKey(GenerationTask, on_delete=models.SET_NULL, null=True, blank=True, related_name='usage_events')
    provider = models.CharField(max_length=32, default='mock')
    model_name = models.CharField(max_length=128, blank=True, default='')
    prompt_tokens = models.IntegerField(default=0)
    completion_tokens = models.IntegerField(default=0)
    total_tokens = models.IntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.provider}:{self.total_tokens}'


class AIConfiguration(models.Model):
    PROVIDER_CHOICES = [
        ('mock', 'Mock Sandbox Simulator'),
        ('agnes', 'Agnes AI'),
        ('gemini', 'Google Gemini API'),
        ('openai', 'OpenAI API'),
        ('anthropic', 'Anthropic API'),
        ('local_proxy', 'Local Model Proxy'),
    ]
    BILLING_MODE_CHOICES = [
        ('platform', 'Platform Credits'),
        ('byok', 'Bring Your Own Key'),
    ]
    CONFIG_SCOPE_CHOICES = [
        ('all', 'All Capabilities'),
        ('text', 'Text Generation'),
        ('image', 'Image Generation'),
        ('audio', 'Audio Generation'),
    ]

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='ai_configurations',
        null=True,
        blank=True,
        help_text='Blank means platform-managed configuration. BYOK keys must be organization-scoped.',
    )
    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, default='mock')
    api_key = models.CharField(max_length=255, blank=True, default='')
    base_url = models.CharField(max_length=255, blank=True, default='')
    model_name = models.CharField(max_length=100, blank=True, default='')
    image_model_name = models.CharField(max_length=100, blank=True, default='')
    config_scope = models.CharField(max_length=16, choices=CONFIG_SCOPE_CHOICES, default='all')
    billing_mode = models.CharField(max_length=20, choices=BILLING_MODE_CHOICES, default='platform')
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('provider', 'organization', 'config_scope')

    def __str__(self) -> str:
        scope = self.organization.slug if self.organization_id else 'platform'
        return f"{scope}:{self.get_provider_display()} ({self.model_name or 'Default Model'})"


class IdempotencyKey(models.Model):
    STATUS_CHOICES = [
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    key = models.CharField(max_length=128)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='idempotency_keys')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='idempotency_keys')
    request_hash = models.CharField(max_length=64)
    request_path = models.CharField(max_length=255, blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='processing')
    response_status = models.IntegerField(null=True, blank=True)
    response_body = models.JSONField(default=dict, blank=True)
    resource_type = models.CharField(max_length=80, blank=True, default='')
    resource_id = models.CharField(max_length=80, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('organization', 'key')]
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.organization.slug}:{self.key}:{self.status}'


class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('login', 'Login'),
        ('member_change', 'Member Change'),
        ('key_change', 'Key Change'),
        ('export', 'Export'),
        ('delete', 'Delete'),
        ('billing_change', 'Billing Change'),
        ('generation_create', 'Generation Create'),
        ('workflow_run', 'Workflow Run'),
        ('workflow_retry', 'Workflow Retry'),
        ('brainstorm', 'Brainstorm'),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    action = models.CharField(max_length=40, choices=ACTION_CHOICES)
    target_type = models.CharField(max_length=80, blank=True, default='')
    target_id = models.CharField(max_length=80, blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.action}:{self.target_type}:{self.target_id}'


class CommunityCreation(models.Model):
    CREATION_TYPES = [
        ('copy', 'Marketing Copywriting'),
        ('image', 'Social Media Image'),
        ('storyboard', 'Storyboard Script'),
        ('audio', 'AI Voiceover'),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='community_creations', null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='community_creations')
    campaign = models.ForeignKey(Campaign, on_delete=models.SET_NULL, null=True, blank=True, related_name='community_creations')
    username = models.CharField(max_length=100, default='ROOT')
    creation_type = models.CharField(max_length=20, choices=CREATION_TYPES)
    title = models.CharField(max_length=255)
    content = models.TextField(help_text='JSON-serialized creation details')
    image_url = models.CharField(max_length=500, blank=True, default='')
    audio_url = models.CharField(max_length=500, blank=True, default='')
    tags = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    likes = models.IntegerField(default=0)
    rag_indexed = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f"[{self.get_creation_type_display()}] {self.title} by {self.username}"

    def get_content_dict(self):
        try:
            return json.loads(self.content)
        except Exception:
            return {}
