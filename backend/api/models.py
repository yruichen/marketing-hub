import hashlib
import json

from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


def hash_signup_invite_code(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode('utf-8')).hexdigest()


class UserProfile(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('active', 'Active'),
        ('suspended', 'Suspended'),
        ('deleted', 'Deleted'),
    ]
    VISIBILITY_CHOICES = [
        ('workspace', 'Workspace'),
        ('private', 'Private'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    email_verified = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    display_name = models.CharField(max_length=80, blank=True, default='')
    headline = models.CharField(max_length=120, blank=True, default='')
    bio = models.TextField(blank=True, default='')
    location = models.CharField(max_length=80, blank=True, default='')
    website_url = models.CharField(max_length=500, blank=True, default='')
    avatar_url = models.CharField(max_length=500, blank=True, default='')
    banner_url = models.CharField(max_length=500, blank=True, default='')
    specialties = models.JSONField(default=list, blank=True)
    social_links = models.JSONField(default=list, blank=True)
    profile_visibility = models.CharField(max_length=20, choices=VISIBILITY_CHOICES, default='workspace')
    signup_source = models.CharField(max_length=60, blank=True, default='')
    signup_ip = models.GenericIPAddressField(null=True, blank=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    last_login_user_agent = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f'{self.user.username}:{self.status}'


class SignupInvite(models.Model):
    code_hash = models.CharField(max_length=128, unique=True)
    label = models.CharField(max_length=100, blank=True, default='')
    max_uses = models.PositiveIntegerField(default=1)
    used_count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_signup_invites')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return self.label or f'invite:{self.id}'


class SecurityEvent(models.Model):
    RISK_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]

    event_type = models.CharField(max_length=40)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='security_events')
    email = models.EmailField(blank=True, default='')
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True, default='')
    risk_level = models.CharField(max_length=20, choices=RISK_CHOICES, default='low')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['event_type', '-created_at']),
            models.Index(fields=['email', '-created_at']),
            models.Index(fields=['ip_address', '-created_at']),
        ]

    def __str__(self) -> str:
        return f'{self.event_type}:{self.email or self.user_id or self.ip_address}'


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
        ('image_prompt', 'Image Prompt Engineering'),
        ('storyboard', 'Storyboard Script'),
        ('audio', 'AI Voiceover'),
        ('video', 'Marketing Video'),
        ('review', 'Content Review'),
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


class WorkflowRun(models.Model):
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('succeeded', 'Succeeded'),
        ('failed', 'Failed'),
        ('partial_success', 'Partial Success'),
        ('cancelled', 'Cancelled'),
    ]

    draft = models.ForeignKey(WorkspaceDraft, on_delete=models.CASCADE, related_name='workflow_runs')
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='workflow_runs')
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_runs')
    campaign = models.ForeignKey(Campaign, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_runs')
    requested_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_runs')
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default='queued')
    idempotency_key = models.CharField(max_length=160, blank=True, default='', db_index=True)
    graph_version = models.CharField(max_length=32, default='v1')
    input_snapshot = models.JSONField(default=dict, blank=True)
    summary = models.JSONField(default=dict, blank=True)
    total_nodes = models.IntegerField(default=0)
    completed_nodes = models.IntegerField(default=0)
    failed_nodes = models.IntegerField(default=0)
    token_count = models.IntegerField(default=0)
    estimated_cost_usd = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    actual_cost_usd = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    celery_task_id = models.CharField(max_length=255, blank=True, default='')
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organization', 'status', 'created_at']),
            models.Index(fields=['draft', 'status']),
        ]

    def __str__(self) -> str:
        return f'workflow-run:{self.id}:{self.status}'


class WorkflowNodeRun(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('queued', 'Queued'),
        ('running', 'Running'),
        ('saving_asset', 'Saving Asset'),
        ('succeeded', 'Succeeded'),
        ('failed', 'Failed'),
        ('skipped', 'Skipped'),
        ('cancelled', 'Cancelled'),
    ]

    workflow_run = models.ForeignKey(WorkflowRun, on_delete=models.CASCADE, related_name='node_runs')
    generation_task = models.ForeignKey(GenerationTask, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_node_runs')
    retry_of = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='retries')
    node_id = models.CharField(max_length=120)
    node_type = models.CharField(max_length=40)
    node_label = models.CharField(max_length=180, blank=True, default='')
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default='pending')
    attempt = models.IntegerField(default=1)
    input_snapshot = models.JSONField(default=dict, blank=True)
    output_summary = models.JSONField(default=dict, blank=True)
    error_code = models.CharField(max_length=80, blank=True, default='')
    error_message = models.TextField(blank=True, default='')
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_ms = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']
        unique_together = [('workflow_run', 'node_id', 'attempt')]
        indexes = [
            models.Index(fields=['workflow_run', 'status']),
            models.Index(fields=['generation_task']),
        ]

    def __str__(self) -> str:
        return f'{self.workflow_run_id}:{self.node_id}:{self.status}'


class WorkflowRunEvent(models.Model):
    workflow_run = models.ForeignKey(WorkflowRun, on_delete=models.CASCADE, related_name='events')
    node_run = models.ForeignKey(WorkflowNodeRun, on_delete=models.SET_NULL, null=True, blank=True, related_name='events')
    event_type = models.CharField(max_length=60)
    node_id = models.CharField(max_length=120, blank=True, default='')
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['workflow_run', 'created_at']),
            models.Index(fields=['event_type']),
        ]

    def __str__(self) -> str:
        return f'{self.workflow_run_id}:{self.event_type}'


class WorkflowTemplate(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_templates')
    source_project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_templates')
    source_campaign = models.ForeignKey(Campaign, on_delete=models.SET_NULL, null=True, blank=True, related_name='workflow_templates')
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True, default='')
    author_username = models.CharField(max_length=100, default='DEMO')
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


class CreditGrant(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='credit_grants')
    granted_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='credit_grants')
    amount_cents = models.PositiveIntegerField(default=0)
    reason = models.CharField(max_length=160)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f'{self.organization.slug}: +{self.amount_cents}c'


class CreditLedgerEntry(models.Model):
    SOURCE_CHOICES = [
        ('grant', 'Grant'),
        ('usage', 'Usage'),
        ('adjustment', 'Adjustment'),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='credit_ledger')
    source = models.CharField(max_length=40, choices=SOURCE_CHOICES)
    delta_cents = models.IntegerField()
    balance_after_cents = models.IntegerField()
    usage_event = models.ForeignKey(UsageEvent, null=True, blank=True, on_delete=models.SET_NULL, related_name='credit_ledger_entries')
    credit_grant = models.ForeignKey(CreditGrant, null=True, blank=True, on_delete=models.SET_NULL, related_name='ledger_entries')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organization', '-created_at']),
            models.Index(fields=['source', '-created_at']),
        ]

    def __str__(self) -> str:
        return f'{self.organization.slug}:{self.source}:{self.delta_cents}c'


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
        ('video', 'Video Generation'),
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
    api_key_encrypted = models.TextField(blank=True, default='')
    api_key_fingerprint = models.CharField(max_length=64, blank=True, default='')
    api_key_last4 = models.CharField(max_length=8, blank=True, default='')
    key_updated_at = models.DateTimeField(null=True, blank=True)
    base_url = models.CharField(max_length=255, blank=True, default='')
    model_name = models.CharField(max_length=100, blank=True, default='')
    image_model_name = models.CharField(max_length=100, blank=True, default='')
    video_model_name = models.CharField(max_length=100, blank=True, default='')
    config_scope = models.CharField(max_length=16, choices=CONFIG_SCOPE_CHOICES, default='all')
    billing_mode = models.CharField(max_length=20, choices=BILLING_MODE_CHOICES, default='platform')
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('provider', 'organization', 'config_scope')

    def __str__(self) -> str:
        scope = self.organization.slug if self.organization_id else 'platform'
        return f"{scope}:{self.get_provider_display()} ({self.model_name or 'Default Model'})"

    def set_api_key(self, raw_key: str) -> None:
        from api.crypto import encrypt_secret, fingerprint_secret

        cleaned = (raw_key or '').strip()
        if not cleaned:
            self.api_key = ''
            self.api_key_encrypted = ''
            self.api_key_fingerprint = ''
            self.api_key_last4 = ''
            self.key_updated_at = timezone.now()
            return
        self.api_key = ''
        self.api_key_encrypted = encrypt_secret(cleaned)
        self.api_key_fingerprint = fingerprint_secret(cleaned)
        self.api_key_last4 = cleaned[-4:]
        self.key_updated_at = timezone.now()

    def get_api_key(self) -> str:
        from api.crypto import decrypt_secret

        if self.api_key_encrypted:
            return decrypt_secret(self.api_key_encrypted)
        return self.api_key or ''

    def has_api_key(self) -> bool:
        return bool(self.api_key_encrypted or self.api_key)


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
        ('ai_key_create', 'AI Key Create'),
        ('ai_key_update', 'AI Key Update'),
        ('ai_key_delete', 'AI Key Delete'),
        ('ai_key_validate', 'AI Key Validate'),
        ('export', 'Export'),
        ('delete', 'Delete'),
        ('project_create', 'Project Create'),
        ('project_update', 'Project Update'),
        ('project_delete', 'Project Delete'),
        ('folder_create', 'Folder Create'),
        ('folder_update', 'Folder Update'),
        ('folder_delete', 'Folder Delete'),
        ('campaign_create', 'Campaign Create'),
        ('campaign_update', 'Campaign Update'),
        ('campaign_delete', 'Campaign Delete'),
        ('asset_create', 'Asset Create'),
        ('asset_update', 'Asset Update'),
        ('asset_delete', 'Asset Delete'),
        ('community_publish', 'Community Publish'),
        ('community_unpublish', 'Community Unpublish'),
        ('billing_change', 'Billing Change'),
        ('credit_grant', 'Credit Grant'),
        ('generation_create', 'Generation Create'),
        ('workflow_run', 'Workflow Run'),
        ('workflow_retry', 'Workflow Retry'),
        ('brainstorm', 'Brainstorm'),
        ('assistant_step', 'Assistant Step'),
        ('cross_org_access_denied', 'Cross-org Access Denied'),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    action = models.CharField(max_length=40, choices=ACTION_CHOICES)
    target_type = models.CharField(max_length=80, blank=True, default='')
    target_id = models.CharField(max_length=80, blank=True, default='')
    request_id = models.CharField(max_length=128, blank=True, default='')
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
        ('video', 'AI Video'),
    ]
    VISIBILITY_CHOICES = [
        ('private', 'Private'),
        ('organization', 'Organization'),
        ('public', 'Public'),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='community_creations', null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.SET_NULL, null=True, blank=True, related_name='community_creations')
    campaign = models.ForeignKey(Campaign, on_delete=models.SET_NULL, null=True, blank=True, related_name='community_creations')
    username = models.CharField(max_length=100, default='DEMO')
    creation_type = models.CharField(max_length=20, choices=CREATION_TYPES)
    title = models.CharField(max_length=255)
    content = models.TextField(help_text='JSON-serialized creation details')
    image_url = models.CharField(max_length=500, blank=True, default='')
    audio_url = models.CharField(max_length=500, blank=True, default='')
    tags = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    likes = models.IntegerField(default=0)
    rag_indexed = models.BooleanField(default=False)
    visibility = models.CharField(max_length=20, choices=VISIBILITY_CHOICES, default='private')
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='published_creations')

    class Meta:
        ordering = ['-created_at']

    def __str__(self) -> str:
        return f"[{self.get_creation_type_display()}] {self.title} by {self.username}"

    def get_content_dict(self):
        try:
            return json.loads(self.content)
        except Exception:
            return {}


# ================================================================
# Global Assistant: persistent multi-turn chat sessions
# ================================================================


class AssistantSession(models.Model):
    """
    A persistent chat session owned by a user within an organization.
    `context_snapshot` records the page state when the session was last opened
    so the assistant can re-attach to "where you were" when you resume it.
    """

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='assistant_sessions',
    )
    user = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assistant_sessions',
    )
    title = models.CharField(max_length=200, default='新对话')
    context_snapshot = models.JSONField(default=dict, blank=True)
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['organization', '-updated_at']),
            models.Index(fields=['organization', 'is_archived']),
        ]

    def __str__(self) -> str:
        return f'AssistantSession({self.id}, {self.title})'


class AssistantMessage(models.Model):
    """
    One turn in an AssistantSession. Role mirrors OpenAI's chat roles.
    `tool_calls` stores the structured tool call list when role='assistant'
    so the UI can re-render tool cards deterministically.
    `metadata` carries audit / cost / error info.
    """

    ROLE_USER = 'user'
    ROLE_ASSISTANT = 'assistant'
    ROLE_TOOL = 'tool'
    ROLE_SYSTEM = 'system'
    ROLE_CHOICES = [
        (ROLE_USER, 'User'),
        (ROLE_ASSISTANT, 'Assistant'),
        (ROLE_TOOL, 'Tool'),
        (ROLE_SYSTEM, 'System'),
    ]

    session = models.ForeignKey(
        AssistantSession,
        on_delete=models.CASCADE,
        related_name='messages',
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField(blank=True, default='')
    tool_calls = models.JSONField(default=list, blank=True)
    tool_call_id = models.CharField(max_length=100, blank=True, default='')
    tool_name = models.CharField(max_length=100, blank=True, default='')
    prompt_tokens = models.IntegerField(default=0)
    completion_tokens = models.IntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=4, default=0)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [
            models.Index(fields=['session', 'created_at']),
        ]

    def __str__(self) -> str:
        snippet = (self.content or '')[:40]
        return f'AssistantMessage({self.role}, {snippet!r})'
