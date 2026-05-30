import json

from django.contrib.auth.models import User
from django.db import models


class Organization(models.Model):
    name = models.CharField(max_length=120, unique=True)
    slug = models.SlugField(max_length=140, unique=True)
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


class Project(models.Model):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='projects')
    name = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180)
    brief = models.TextField(blank=True, default='')
    brand_context = models.JSONField(default=dict, blank=True)
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('organization', 'slug')]
        ordering = ['-created_at']

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
        ('gemini', 'Google Gemini API'),
        ('openai', 'OpenAI API'),
    ]

    provider = models.CharField(max_length=20, choices=PROVIDER_CHOICES, default='mock')
    api_key = models.CharField(max_length=255, blank=True, default='')
    base_url = models.CharField(max_length=255, blank=True, default='')
    model_name = models.CharField(max_length=100, blank=True, default='')
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.get_provider_display()} ({self.model_name or 'Default Model'})"


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
