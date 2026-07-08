from __future__ import annotations

from typing import TYPE_CHECKING

from django.utils import timezone

from api.models import Asset

if TYPE_CHECKING:
    from django.contrib.auth.models import User

    from api.models import CommunityCreation

CREATION_TYPE_TO_ASSET_TYPE = {
    'copy': 'document',
    'storyboard': 'document',
    'image': 'image',
    'audio': 'audio',
    'video': 'video',
}


def persist_rejected_creation_to_project(
    item: CommunityCreation,
    *,
    reason: str,
    handled_by: User | None,
) -> Asset | None:
    """Archive a rejected community work into the project asset library without deleting the original record."""
    metadata = item.metadata if isinstance(item.metadata, dict) else {}
    existing_asset_id = metadata.get('rejected_asset_id')
    if existing_asset_id:
        existing = Asset.objects.filter(pk=existing_asset_id, organization=item.organization).first()
        if existing:
            return existing

    asset_type = CREATION_TYPE_TO_ASSET_TYPE.get(item.creation_type, 'document')
    source_url = item.image_url or item.audio_url or ''
    content_dict = item.get_content_dict()
    handled_by_id = handled_by.id if handled_by else None

    asset = Asset.objects.create(
        organization=item.organization,
        project=item.project,
        campaign=item.campaign,
        asset_type=asset_type,
        title=f'[已驳回] {item.title}'[:255],
        source_url=source_url,
        tags=[*(item.tags or []), 'moderation_rejected'],
        metadata={
            'source': 'moderation_rejected',
            'community_creation_id': item.id,
            'rejection_reason': reason,
            'rejected_at': timezone.now().isoformat(),
            'rejected_by': handled_by_id,
            'content': content_dict,
            'creation_type': item.creation_type,
            'ai_generated': item.ai_generated,
        },
    )

    item.metadata = {
        **metadata,
        'rejected_asset_id': asset.id,
        'rejection_reason': reason,
        'rejected_at': timezone.now().isoformat(),
        'rejected_by': handled_by_id,
    }
    item.save(update_fields=['metadata'])
    return asset


def apply_community_moderation(
    item: CommunityCreation,
    *,
    review_status: str,
    reason: str,
    handled_by: User | None,
    moderation_status: str | None = None,
) -> tuple[CommunityCreation, Asset | None]:
    if review_status == 'rejected':
        resolved_moderation_status = moderation_status or 'hidden'
    else:
        resolved_moderation_status = moderation_status or item.moderation_status or 'visible'

    rejected_asset = None
    item_metadata = item.metadata if isinstance(item.metadata, dict) else {}
    if review_status == 'rejected':
        rejected_asset = persist_rejected_creation_to_project(item, reason=reason, handled_by=handled_by)
        item_metadata = {
            **item_metadata,
            'ops_review_status': 'rejected',
        }
    elif review_status == 'approved':
        item_metadata = {
            **item_metadata,
            'ops_review_status': 'approved',
        }

    item.metadata = item_metadata
    item.moderation_status = resolved_moderation_status
    item.review_status = review_status
    item.takedown_reason = reason
    item.takedown_at = timezone.now() if resolved_moderation_status in {'hidden', 'removed'} else None
    item.save(update_fields=['metadata', 'moderation_status', 'review_status', 'takedown_reason', 'takedown_at'])
    return item, rejected_asset
