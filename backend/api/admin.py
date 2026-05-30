from django.contrib import admin

from api.models import (
    AIConfiguration,
    Asset,
    Campaign,
    CommunityCreation,
    GenerationTask,
    Membership,
    Organization,
    Project,
    UsageEvent,
    WorkflowTemplate,
    WorkspaceDraft,
)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'created_at')
    search_fields = ('name', 'slug')


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'organization', 'role', 'created_at')
    list_filter = ('role', 'organization')


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization', 'slug', 'is_archived', 'created_at')
    list_filter = ('organization', 'is_archived')
    search_fields = ('name', 'slug', 'brief')


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'objective', 'status', 'created_at')
    list_filter = ('status', 'project')
    search_fields = ('name', 'objective')


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ('title', 'asset_type', 'organization', 'project', 'campaign', 'created_at')
    list_filter = ('asset_type', 'organization')
    search_fields = ('title', 'source_url')


@admin.register(GenerationTask)
class GenerationTaskAdmin(admin.ModelAdmin):
    list_display = ('id', 'task_type', 'status', 'organization', 'project', 'campaign', 'token_count', 'cost_usd', 'created_at')
    list_filter = ('task_type', 'status', 'organization')
    readonly_fields = ('created_at', 'updated_at', 'completed_at')


@admin.register(UsageEvent)
class UsageEventAdmin(admin.ModelAdmin):
    list_display = ('provider', 'model_name', 'organization', 'total_tokens', 'cost_usd', 'created_at')
    list_filter = ('provider', 'organization')


@admin.register(AIConfiguration)
class AIConfigurationAdmin(admin.ModelAdmin):
    list_display = ('provider', 'model_name', 'base_url', 'is_active', 'updated_at')
    list_filter = ('provider', 'is_active')


@admin.register(CommunityCreation)
class CommunityCreationAdmin(admin.ModelAdmin):
    list_display = ('title', 'creation_type', 'username', 'organization', 'project', 'campaign', 'likes', 'rag_indexed', 'created_at')
    list_filter = ('creation_type', 'organization', 'rag_indexed')
    search_fields = ('title', 'username', 'content')


@admin.register(WorkspaceDraft)
class WorkspaceDraftAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization', 'project', 'campaign', 'status', 'updated_at')
    list_filter = ('status', 'organization', 'project')
    search_fields = ('name',)


@admin.register(WorkflowTemplate)
class WorkflowTemplateAdmin(admin.ModelAdmin):
    list_display = ('title', 'author_username', 'organization', 'source_project', 'is_public', 'fork_count', 'created_at')
    list_filter = ('is_public', 'organization')
    search_fields = ('title', 'description', 'author_username')
