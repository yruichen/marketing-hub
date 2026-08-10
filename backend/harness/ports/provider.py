from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from harness.contracts.errors import NonRetryableHarnessError, RetryableHarnessError


class ProviderConfig(Protocol):
    provider: str
    base_url: str
    model_name: str
    image_model_name: str
    video_model_name: str

    def get_api_key(self) -> str: ...

    def has_api_key(self) -> bool: ...


@dataclass(slots=True)
class ChatCompletionResult:
    payload: dict[str, Any]
    prompt_tokens: int = 0
    completion_tokens: int = 0
    finish_reason: str = ''
    refusal: str = ''


class RetryableProviderError(RetryableHarnessError):
    pass


class NonRetryableProviderError(NonRetryableHarnessError):
    pass
