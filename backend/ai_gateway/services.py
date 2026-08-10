"""Compatibility facade for the AI model gateway.

The gateway implementation is split into constants, policies, provider adapters,
and orchestration modules under ``ai_gateway.gateway_modules``.
"""

from ai_gateway.gateway_modules.adapters import (
    AgnesAdapter,
    AgnesImageAdapter,
    AgnesVideoAdapter,
    AnthropicAdapter,
    ChatCompletionsAdapter,
    GeminiAdapter,
    LocalProxyAdapter,
    OpenAIAdapter,
    ProviderAdapter,
)
from ai_gateway.gateway_modules.constants import (
    AGNES_DEFAULT_BASE_URL,
    AGNES_DEFAULT_IMAGE_MODEL,
    AGNES_DEFAULT_MODEL,
    AGNES_DEFAULT_VIDEO_MODEL,
    CAPABILITY_REGISTRY,
    IMAGE_RUNTIME_PROVIDERS,
    IMAGE_TASK_TYPES,
    AUDIO_TASK_TYPES,
    JSON_RESPONSE_TASK_TYPES,
    MODEL_CAPABILITIES,
    PROMPT_REGISTRY,
    SAFETY_BLOCKLIST,
    TEXT_TASK_TYPES,
    VIDEO_RUNTIME_PROVIDERS,
    VIDEO_TASK_TYPES,
)
from ai_gateway.gateway_modules.gateway import AIModelGateway
from ai_gateway.gateway_modules.policy import (
    CostCalculator,
    ModelPolicy,
    SafetyPolicy,
    config_lane_priority,
    config_serves_lane,
    provider_supports_task,
    task_lane,
)
from ai_gateway.gateway_modules.types import (
    ChatCompletionResult,
    GatewayResponse,
    NonRetryableGatewayError,
    RetryableGatewayError,
)

__all__ = [
    'AGNES_DEFAULT_BASE_URL',
    'AGNES_DEFAULT_IMAGE_MODEL',
    'AGNES_DEFAULT_MODEL',
    'AGNES_DEFAULT_VIDEO_MODEL',
    'AIModelGateway',
    'AgnesAdapter',
    'AgnesImageAdapter',
    'AgnesVideoAdapter',
    'AnthropicAdapter',
    'AUDIO_TASK_TYPES',
    'CAPABILITY_REGISTRY',
    'ChatCompletionResult',
    'ChatCompletionsAdapter',
    'CostCalculator',
    'GatewayResponse',
    'GeminiAdapter',
    'IMAGE_RUNTIME_PROVIDERS',
    'IMAGE_TASK_TYPES',
    'JSON_RESPONSE_TASK_TYPES',
    'LocalProxyAdapter',
    'MODEL_CAPABILITIES',
    'ModelPolicy',
    'NonRetryableGatewayError',
    'OpenAIAdapter',
    'PROMPT_REGISTRY',
    'ProviderAdapter',
    'RetryableGatewayError',
    'SAFETY_BLOCKLIST',
    'SafetyPolicy',
    'TEXT_TASK_TYPES',
    'VIDEO_RUNTIME_PROVIDERS',
    'VIDEO_TASK_TYPES',
    'config_lane_priority',
    'config_serves_lane',
    'provider_supports_task',
    'task_lane',
]
