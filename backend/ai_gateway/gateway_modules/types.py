"""Deprecated gateway contract compatibility facade."""

from harness.contracts import GatewayResponse
from harness.ports.provider import (
    ChatCompletionResult,
    NonRetryableProviderError,
    RetryableProviderError,
)

RetryableGatewayError = RetryableProviderError
NonRetryableGatewayError = NonRetryableProviderError

__all__ = [
    'ChatCompletionResult',
    'GatewayResponse',
    'NonRetryableGatewayError',
    'RetryableGatewayError',
]
