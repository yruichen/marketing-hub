from __future__ import annotations

from decimal import Decimal

from django.db.models import Q

from api.models import AIConfiguration, Organization
from api.rbac import role_rank
from harness.adapters.providers.constants import (
    CAPABILITY_REGISTRY,
    IMAGE_RUNTIME_PROVIDERS,
    IMAGE_TASK_TYPES,
    AUDIO_TASK_TYPES,
    SAFETY_BLOCKLIST,
    TEXT_TASK_TYPES,
    VIDEO_RUNTIME_PROVIDERS,
    VIDEO_TASK_TYPES,
)
from harness.ports.provider import NonRetryableProviderError

NonRetryableGatewayError = NonRetryableProviderError

class SafetyPolicy:
    @staticmethod
    def validate(text: str) -> None:
        lowered = text.lower()
        for token in SAFETY_BLOCKLIST:
            if token in lowered:
                raise NonRetryableGatewayError(f'Prompt blocked by safety policy: {token}')


class CostCalculator:
    @staticmethod
    def calculate(provider: str, model_name: str, *, prompt_tokens: int, completion_tokens: int, media_seconds: int = 0) -> Decimal:
        total_tokens = prompt_tokens + completion_tokens
        token_rate = {
            'openai': Decimal('0.00002'),
            'agnes': Decimal('0.000015'),
            'anthropic': Decimal('0.000025'),
            'gemini': Decimal('0.000018'),
            'local_proxy': Decimal('0.00001'),
        }.get(provider, Decimal('0.00002'))
        media_rate = Decimal(media_seconds) * Decimal('0.002')
        return (Decimal(total_tokens) * token_rate) + media_rate

    @staticmethod
    def calculate_image(provider: str, *, generated_images: int = 1) -> Decimal:
        per_image = {
            'agnes': Decimal('0.003'),
            'openai': Decimal('0.04'),
            'local_proxy': Decimal('0.001'),
        }.get(provider, Decimal('0.01'))
        return per_image * max(generated_images, 0)


IMAGE_RUNTIME_PROVIDERS = frozenset({'agnes', 'local_proxy'})
VIDEO_RUNTIME_PROVIDERS = frozenset({'agnes', 'local_proxy'})
TEXT_TASK_TYPES = frozenset({'copy', 'storyboard'})
IMAGE_TASK_TYPES = frozenset({'image'})
AUDIO_TASK_TYPES = frozenset({'audio'})
VIDEO_TASK_TYPES = frozenset({'video'})


def task_lane(task_type: str) -> str:
    if task_type in IMAGE_TASK_TYPES:
        return 'image'
    if task_type in AUDIO_TASK_TYPES:
        return 'audio'
    if task_type in VIDEO_TASK_TYPES:
        return 'video'
    return 'text'


def config_serves_lane(config: AIConfiguration, lane: str) -> bool:
    scope = getattr(config, 'config_scope', 'all') or 'all'
    if scope == 'all':
        return True
    return scope == lane


def config_lane_priority(config: AIConfiguration, lane: str) -> int:
    scope = getattr(config, 'config_scope', 'all') or 'all'
    if scope == lane:
        return 0
    if scope == 'all':
        return 1
    return 2


def provider_supports_task(provider: str, task_type: str) -> bool:
    if task_type in IMAGE_TASK_TYPES:
        return provider in IMAGE_RUNTIME_PROVIDERS
    if task_type in AUDIO_TASK_TYPES:
        return provider in {'local_proxy'}
    if task_type in VIDEO_TASK_TYPES:
        return provider in VIDEO_RUNTIME_PROVIDERS | {'local_proxy'}
    caps = CAPABILITY_REGISTRY.get(provider, set())
    return 'text' in caps


class ModelPolicy:
    @staticmethod
    def select_configuration(*, organization: Organization | None, task_type: str, role: str | None = None) -> AIConfiguration | None:
        lane = task_lane(task_type)
        if organization is not None:
            candidates = AIConfiguration.objects.filter(
                is_active=True,
            ).filter(
                Q(organization=organization) | Q(organization__isnull=True)
            ).order_by('-updated_at')
        else:
            candidates = AIConfiguration.objects.filter(is_active=True, organization__isnull=True).order_by('-updated_at')

        candidates = list(candidates)
        candidates.sort(key=lambda item: (config_lane_priority(item, lane), -item.updated_at.timestamp()))

        for candidate in candidates:
            if not config_serves_lane(candidate, lane):
                continue
            if not provider_supports_task(candidate.provider, task_type):
                continue
            if task_type == 'audio' and role_rank(role) < role_rank('creator'):
                return None
            return candidate
        return None
