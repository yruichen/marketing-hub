from rest_framework import serializers

from api.models import (
    AIConfiguration,
    AuditLog,
    Asset,
    Campaign,
    CommunityCreation,
    Folder,
    GenerationTask,
    IdempotencyKey,
    Membership,
    Organization,
    Project,
    UsageEvent,
    WorkflowTemplate,
    WorkspaceDraft,
)


class OrganizationSerializer(serializers.ModelSerializer):
    plan_limits = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = ('id', 'name', 'slug', 'subscription_plan', 'plan_limits', 'created_at')

    def get_plan_limits(self, obj: Organization):
        from api.contracts import PLAN_LIMITS

        return PLAN_LIMITS.get(obj.subscription_plan, PLAN_LIMITS['free'])


class MembershipSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    organization_slug = serializers.CharField(source='organization.slug', read_only=True)

    class Meta:
        model = Membership
        fields = ('id', 'user_id', 'username', 'email', 'organization_id', 'organization_slug', 'role', 'created_at')


class FolderSerializer(serializers.ModelSerializer):
    path = serializers.CharField(read_only=True)
    project_count = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = (
            'id',
            'organization_id',
            'parent_id',
            'name',
            'slug',
            'path',
            'sort_order',
            'permission_scope',
            'is_archived',
            'project_count',
            'created_at',
            'updated_at',
        )

    def get_project_count(self, obj: Folder):
        value = getattr(obj, 'project_count', None)
        if value is not None:
            return value
        return obj.projects.count()


class ProjectSerializer(serializers.ModelSerializer):
    folder_name = serializers.SerializerMethodField()
    folder_path_display = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = (
            'id',
            'organization_id',
            'folder_id',
            'folder_name',
            'folder_path_display',
            'name',
            'slug',
            'brief',
            'brand_context',
            'folder_path',
            'platform_tags',
            'status_tag',
            'sort_order',
            'is_archived',
            'created_at',
            'updated_at',
        )

    def get_folder_name(self, obj: Project):
        return obj.folder.name if obj.folder else None

    def get_folder_path_display(self, obj: Project):
        return obj.folder.path if obj.folder else obj.folder_path or ''


class CampaignSerializer(serializers.ModelSerializer):
    class Meta:
        model = Campaign
        fields = ('id', 'project_id', 'name', 'objective', 'status', 'created_at', 'updated_at')


class WorkspaceDraftSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkspaceDraft
        fields = (
            'id',
            'organization_id',
            'project_id',
            'campaign_id',
            'name',
            'brand_context',
            'nodes',
            'edges',
            'viewport',
            'selected_node_id',
            'status',
            'last_run_summary',
            'created_at',
            'updated_at',
        )


class WorkflowTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowTemplate
        fields = (
            'id',
            'organization_id',
            'source_project_id',
            'source_campaign_id',
            'title',
            'description',
            'author_username',
            'brand_context',
            'nodes',
            'edges',
            'preview_image_url',
            'tags',
            'is_public',
            'fork_count',
            'created_at',
            'updated_at',
        )


class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = (
            'id',
            'organization_id',
            'project_id',
            'campaign_id',
            'asset_type',
            'title',
            'source_url',
            'tags',
            'metadata',
            'created_at',
        )


class TaskSerializer(serializers.ModelSerializer):
    requested_by = serializers.CharField(source='requested_by.username', allow_null=True, read_only=True)
    cost_usd = serializers.SerializerMethodField()

    class Meta:
        model = GenerationTask
        fields = (
            'id',
            'organization_id',
            'project_id',
            'campaign_id',
            'requested_by',
            'task_type',
            'status',
            'payload',
            'result',
            'error_message',
            'celery_task_id',
            'token_count',
            'cost_usd',
            'created_at',
            'updated_at',
            'completed_at',
        )

    def get_cost_usd(self, obj: GenerationTask):
        return str(obj.cost_usd)


class AIConfigurationSerializer(serializers.ModelSerializer):
    provider_display = serializers.CharField(source='get_provider_display', read_only=True)
    config_scope_display = serializers.CharField(source='get_config_scope_display', read_only=True)
    organization_slug = serializers.SerializerMethodField()
    api_key_masked = serializers.SerializerMethodField()

    class Meta:
        model = AIConfiguration
        fields = (
            'id',
            'organization_id',
            'organization_slug',
            'provider',
            'provider_display',
            'api_key_masked',
            'base_url',
            'model_name',
            'image_model_name',
            'config_scope',
            'config_scope_display',
            'billing_mode',
            'is_active',
            'updated_at',
        )

    def get_api_key_masked(self, obj: AIConfiguration):
        if not obj.api_key:
            return ''
        if len(obj.api_key) <= 8:
            return '****'
        return f'{obj.api_key[:4]}...{obj.api_key[-4:]}'

    def get_organization_slug(self, obj: AIConfiguration):
        return obj.organization.slug if obj.organization_id else None


class CommunityCreationSerializer(serializers.ModelSerializer):
    creation_type_display = serializers.CharField(source='get_creation_type_display', read_only=True)
    content = serializers.SerializerMethodField()
    organization = serializers.SerializerMethodField()
    project = serializers.SerializerMethodField()
    campaign = serializers.IntegerField(source='campaign_id', allow_null=True, read_only=True)

    class Meta:
        model = CommunityCreation
        fields = (
            'id',
            'username',
            'creation_type',
            'creation_type_display',
            'title',
            'content',
            'image_url',
            'audio_url',
            'likes',
            'tags',
            'rag_indexed',
            'created_at',
            'organization',
            'project',
            'campaign',
        )

    def get_content(self, obj: CommunityCreation):
        return obj.get_content_dict()

    def get_organization(self, obj: CommunityCreation):
        return obj.organization.slug if obj.organization_id else None

    def get_project(self, obj: CommunityCreation):
        return obj.project.slug if obj.project_id else None


class UsageEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = UsageEvent
        fields = ('provider', 'model_name', 'total_tokens', 'cost_usd', 'created_at')


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source='actor.username', read_only=True)
    organization_slug = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = (
            'id',
            'action',
            'actor_username',
            'organization_slug',
            'target_type',
            'target_id',
            'ip_address',
            'user_agent',
            'metadata',
            'created_at',
        )

    def get_organization_slug(self, obj: AuditLog):
        return obj.organization.slug if obj.organization_id else None


class IdempotencyKeySerializer(serializers.ModelSerializer):
    class Meta:
        model = IdempotencyKey
        fields = (
            'id',
            'key',
            'request_hash',
            'request_path',
            'status',
            'response_status',
            'response_body',
            'resource_type',
            'resource_id',
            'created_at',
            'updated_at',
        )
