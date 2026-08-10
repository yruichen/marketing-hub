from __future__ import annotations

from typing import Protocol

from harness.contracts import RunRequest


class ExecutionOutcome(Protocol):
    """Structural protocol implemented by provider/runtime outcomes."""

    payload: dict
    logs: list[str]
    provider: str
    model_name: str
    fallback_used: bool
    cost_usd: object
    prompt_tokens: int
    completion_tokens: int
    prompt_key: str
    prompt_version: str
    prompt_locale: str
    prompt_checksum: str
    evaluation_profile: str


class ExecutionPort(Protocol):
    def execute(self, request: RunRequest) -> ExecutionOutcome: ...
