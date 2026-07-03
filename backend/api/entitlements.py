from __future__ import annotations

from django.contrib.auth.models import User
from django.utils import timezone

from api.contracts import PLAN_LIMITS
from api.models import Organization, UserProfile


PRO_FEATURES = {
    'video_render',
    'workflow_run',
    'custom_agent',
    'ai_config_write',
    'byok_config',
    'advanced_nodes',
}


def personal_plan_for_user(user: User) -> str:
    profile, _ = UserProfile.objects.get_or_create(user=user)
    if profile.subscription_plan == 'pro':
        if profile.subscription_expires_at and profile.subscription_expires_at <= timezone.now():
            return 'free'
        return 'pro'
    return 'free'


def effective_plan_for_scope(user: User, organization: Organization | None = None) -> str:
    if organization and organization.subscription_plan == 'enterprise':
        return 'enterprise'
    return personal_plan_for_user(user)


def effective_limits_for_scope(user: User, organization: Organization | None = None) -> dict:
    return PLAN_LIMITS.get(effective_plan_for_scope(user, organization), PLAN_LIMITS['free'])


def can_use_feature(user: User, organization: Organization | None, feature_key: str) -> bool:
    if feature_key not in PRO_FEATURES:
        return True
    return effective_plan_for_scope(user, organization) in {'pro', 'enterprise'}


def feature_entitlements_for_scope(user: User, organization: Organization | None = None) -> dict[str, bool]:
    return {feature: can_use_feature(user, organization, feature) for feature in sorted(PRO_FEATURES)}


def feature_denied_payload(feature_key: str, message: str) -> dict:
    return {
        'error': message,
        'feature': feature_key,
        'upgrade_required': True,
    }
