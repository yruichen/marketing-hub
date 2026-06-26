from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.models import User
from django.db.models import Sum
from django.utils.html import format_html

from api.audit import record_audit_log
from api.models import (
    AIConfiguration,
    AuditLog,
    Asset,
    Campaign,
    CommunityCreation,
    CreditGrant,
    CreditLedgerEntry,
    Folder,
    GenerationTask,
    IdempotencyKey,
    Membership,
    Organization,
    Project,
    SecurityEvent,
    SignupInvite,
    UsageEvent,
    UserProfile,
    WorkflowTemplate,
    WorkspaceDraft,
    hash_signup_invite_code,
)


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    extra = 0
    fields = (
        'email_verified',
        'status',
        'signup_source',
        'signup_ip',
        'last_login_ip',
        'last_login_user_agent',
        'created_at',
        'updated_at',
    )
    readonly_fields = ('status', 'created_at', 'updated_at')


admin.site.unregister(User)


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    inlines = (UserProfileInline,)
    list_display = (
        'username',
        'email',
        'is_active',
        'is_staff',
        'profile_status',
        'profile_email_verified',
        'last_login',
        'date_joined',
    )
    list_filter = DjangoUserAdmin.list_filter + ('profile__status', 'profile__email_verified')
    search_fields = ('username', 'email', 'profile__signup_ip', 'profile__last_login_ip')

    @admin.display(description='profile status', ordering='profile__status')
    def profile_status(self, obj):
        return getattr(getattr(obj, 'profile', None), 'status', '')

    @admin.display(boolean=True, description='email verified', ordering='profile__email_verified')
    def profile_email_verified(self, obj):
        return getattr(getattr(obj, 'profile', None), 'email_verified', False)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'email', 'display_name', 'email_verified', 'status', 'profile_visibility', 'signup_source', 'signup_ip', 'last_login_ip', 'created_at')
    list_filter = ('email_verified', 'status', 'profile_visibility', 'signup_source')
    search_fields = ('user__username', 'user__email', 'display_name', 'headline', 'signup_ip', 'last_login_ip')
    readonly_fields = ('created_at', 'updated_at')
    actions = ('suspend_accounts', 'unsuspend_accounts')

    @admin.display(description='email')
    def email(self, obj):
        return obj.user.email

    def _record_status_change(self, request, profile, old_status, new_status):
        if old_status is None or old_status == new_status:
            return
        organization = profile.user.memberships.select_related('organization').first()
        org = organization.organization if organization else None
        record_audit_log(
            action='member_change',
            actor=request.user,
            organization=org,
            target_type='user_profile',
            target_id=str(profile.id),
            metadata={'user_id': profile.user_id, 'status_from': old_status, 'status_to': new_status, 'source': 'django_admin'},
        )
        SecurityEvent.objects.create(
            event_type='account_suspended' if new_status == 'suspended' else 'account_unsuspended',
            user=profile.user,
            email=profile.user.email,
            risk_level='medium' if new_status == 'suspended' else 'low',
            metadata={'admin_user_id': request.user.id, 'status_from': old_status, 'status_to': new_status},
        )

    def save_model(self, request, obj, form, change):
        old_status = None
        if change:
            old_status = UserProfile.objects.filter(pk=obj.pk).values_list('status', flat=True).first()
        super().save_model(request, obj, form, change)
        self._record_status_change(request, obj, old_status, obj.status)

    @admin.action(description='冻结所选账号')
    def suspend_accounts(self, request, queryset):
        for profile in queryset:
            old_status = profile.status
            profile.status = 'suspended'
            profile.save(update_fields=['status', 'updated_at'])
            self._record_status_change(request, profile, old_status, profile.status)

    @admin.action(description='解冻所选账号')
    def unsuspend_accounts(self, request, queryset):
        for profile in queryset:
            old_status = profile.status
            profile.status = 'active'
            profile.save(update_fields=['status', 'updated_at'])
            self._record_status_change(request, profile, old_status, profile.status)


class SignupInviteForm(forms.ModelForm):
    plain_code = forms.CharField(label='Plain invite code', required=False, help_text='Only used on create. The code is hashed before saving.')

    class Meta:
        model = SignupInvite
        fields = ('plain_code', 'code_hash', 'label', 'max_uses', 'used_count', 'expires_at', 'is_active', 'created_by')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['code_hash'].required = False

    def clean(self):
        cleaned = super().clean()
        if not cleaned.get('plain_code') and not cleaned.get('code_hash'):
            raise forms.ValidationError('Plain invite code or code hash is required.')
        return cleaned


@admin.register(SignupInvite)
class SignupInviteAdmin(admin.ModelAdmin):
    form = SignupInviteForm
    list_display = ('label', 'masked_hash', 'is_active', 'max_uses', 'used_count', 'expires_at', 'created_by', 'created_at')
    list_filter = ('is_active', 'expires_at')
    search_fields = ('label', 'code_hash', 'created_by__username', 'created_by__email')
    readonly_fields = ('created_at',)

    @admin.display(description='code hash')
    def masked_hash(self, obj):
        return f'{obj.code_hash[:10]}...{obj.code_hash[-6:]}' if obj.code_hash else ''

    def save_model(self, request, obj, form, change):
        plain_code = form.cleaned_data.get('plain_code')
        if plain_code:
            obj.code_hash = hash_signup_invite_code(plain_code)
        if not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)


@admin.register(SecurityEvent)
class SecurityEventAdmin(admin.ModelAdmin):
    list_display = ('event_type', 'user', 'email', 'ip_address', 'risk_level', 'created_at')
    list_filter = ('event_type', 'risk_level', 'created_at')
    search_fields = ('email', 'user__username', 'user__email', 'ip_address')
    readonly_fields = ('event_type', 'user', 'email', 'ip_address', 'user_agent', 'risk_level', 'metadata', 'created_at')


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'subscription_plan', 'credit_balance', 'member_count', 'task_count', 'created_at')
    list_filter = ('subscription_plan',)
    search_fields = ('name', 'slug')

    @admin.display(description='credits')
    def credit_balance(self, obj):
        cents = obj.credit_ledger.aggregate(value=Sum('delta_cents'))['value'] or 0
        return f'${cents / 100:.2f}'

    @admin.display(description='members')
    def member_count(self, obj):
        return obj.memberships.count()

    @admin.display(description='tasks')
    def task_count(self, obj):
        return obj.generation_tasks.count()


@admin.register(Membership)
class MembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'organization', 'role', 'created_at')
    list_filter = ('role', 'organization')
    search_fields = ('user__username', 'user__email', 'organization__name', 'organization__slug')


@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization', 'parent', 'sort_order', 'permission_scope', 'is_archived', 'updated_at')
    list_filter = ('organization', 'permission_scope', 'is_archived')
    search_fields = ('name', 'slug')


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization', 'folder', 'slug', 'status_tag', 'is_archived', 'created_at')
    list_filter = ('organization', 'folder', 'status_tag', 'is_archived')
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
    list_filter = ('task_type', 'status', 'organization', 'created_at')
    search_fields = ('id', 'error_message', 'celery_task_id', 'requested_by__username', 'requested_by__email', 'organization__slug')
    readonly_fields = ('created_at', 'updated_at', 'completed_at')


@admin.register(UsageEvent)
class UsageEventAdmin(admin.ModelAdmin):
    list_display = ('provider', 'model_name', 'organization', 'total_tokens', 'cost_usd', 'created_at')
    list_filter = ('provider', 'model_name', 'organization', 'created_at')
    search_fields = ('provider', 'model_name', 'organization__name', 'organization__slug')


@admin.register(CreditGrant)
class CreditGrantAdmin(admin.ModelAdmin):
    list_display = ('organization', 'amount_display', 'reason', 'granted_by', 'expires_at', 'created_at')
    list_filter = ('organization', 'expires_at', 'created_at')
    search_fields = ('organization__name', 'organization__slug', 'reason', 'granted_by__username', 'granted_by__email')
    readonly_fields = ('created_at',)

    @admin.display(description='amount')
    def amount_display(self, obj):
        return f'${obj.amount_cents / 100:.2f}'

    def save_model(self, request, obj, form, change):
        is_new = obj.pk is None
        if not obj.granted_by_id:
            obj.granted_by = request.user
        super().save_model(request, obj, form, change)
        if is_new:
            balance = CreditLedgerEntry.objects.filter(organization=obj.organization).aggregate(value=Sum('delta_cents'))['value'] or 0
            CreditLedgerEntry.objects.create(
                organization=obj.organization,
                source='grant',
                delta_cents=obj.amount_cents,
                balance_after_cents=balance + obj.amount_cents,
                credit_grant=obj,
                metadata={'reason': obj.reason, 'admin_user_id': request.user.id},
            )
            record_audit_log(
                action='billing_change',
                actor=request.user,
                organization=obj.organization,
                target_type='credit_grant',
                target_id=str(obj.id),
                metadata={'amount_cents': obj.amount_cents, 'reason': obj.reason, 'expires_at': obj.expires_at.isoformat() if obj.expires_at else None},
            )


@admin.register(CreditLedgerEntry)
class CreditLedgerEntryAdmin(admin.ModelAdmin):
    list_display = ('organization', 'source', 'delta_display', 'balance_display', 'usage_event', 'credit_grant', 'created_at')
    list_filter = ('source', 'organization', 'created_at')
    search_fields = ('organization__name', 'organization__slug', 'metadata')
    readonly_fields = ('organization', 'source', 'delta_cents', 'balance_after_cents', 'usage_event', 'credit_grant', 'metadata', 'created_at')

    @admin.display(description='delta')
    def delta_display(self, obj):
        return f'${obj.delta_cents / 100:.2f}'

    @admin.display(description='balance')
    def balance_display(self, obj):
        return f'${obj.balance_after_cents / 100:.2f}'


@admin.register(AIConfiguration)
class AIConfigurationAdmin(admin.ModelAdmin):
    list_display = ('provider', 'organization', 'model_name', 'billing_mode', 'base_url', 'is_active', 'updated_at')
    list_filter = ('provider', 'billing_mode', 'organization', 'is_active')


@admin.register(IdempotencyKey)
class IdempotencyKeyAdmin(admin.ModelAdmin):
    list_display = ('key', 'organization', 'status', 'resource_type', 'resource_id', 'created_at')
    list_filter = ('status', 'organization', 'resource_type')
    search_fields = ('key', 'request_hash', 'resource_id')


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('action', 'organization', 'actor', 'target_type', 'target_id', 'ip_address', 'metadata_preview', 'created_at')
    list_filter = ('action', 'organization', 'target_type', 'created_at')
    search_fields = ('target_type', 'target_id', 'actor__username', 'actor__email', 'ip_address')
    readonly_fields = ('organization', 'actor', 'action', 'target_type', 'target_id', 'ip_address', 'user_agent', 'metadata', 'created_at')

    @admin.display(description='metadata')
    def metadata_preview(self, obj):
        text = str(obj.metadata or {})
        return format_html('<code>{}</code>', text[:120])


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
