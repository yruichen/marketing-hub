from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

@dataclass(slots=True)
class GatewayResponse:
    payload: dict[str, Any]
    logs: list[str]
    provider: str
    model_name: str
    fallback_used: bool = False
    cost_usd: Decimal = Decimal('0')
    prompt_tokens: int = 0
    completion_tokens: int = 0


class RetryableGatewayError(RuntimeError):
    pass


class NonRetryableGatewayError(RuntimeError):
    pass

@dataclass(slots=True)
class ChatCompletionResult:
    payload: dict[str, Any]
    prompt_tokens: int = 0
    completion_tokens: int = 0
