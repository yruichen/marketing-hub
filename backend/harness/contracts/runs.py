from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class RunStatus(StrEnum):
    QUEUED = 'queued'
    RUNNING = 'running'
    WAITING_APPROVAL = 'waiting_approval'
    SUCCEEDED = 'succeeded'
    FAILED = 'failed'
    CANCELLED = 'cancelled'


class ExecutionMode(StrEnum):
    COMPLETION = 'completion'
    AGENT = 'agent'


class RunContext(BaseModel):
    """Serializable tenant and localization context; never contains secrets."""

    model_config = ConfigDict(extra='forbid')

    organization_id: int | None = None
    actor_id: int | None = None
    role: str | None = None
    output_locale: str = 'zh-CN'
    trace_id: str = ''
    metadata: dict[str, Any] = Field(default_factory=dict)


class RunConfig(BaseModel):
    model_config = ConfigDict(extra='forbid')

    max_turns: int = Field(default=5, ge=1, le=50)
    timeout_seconds: int = Field(default=120, ge=1, le=3600)
    max_prompt_tokens: int | None = Field(default=None, ge=1)
    max_completion_tokens: int | None = Field(default=None, ge=1)
    max_cost_usd: Decimal | None = Field(default=None, ge=0)
    checkpoint: bool = True
    record_sensitive_data: bool = False


class RunRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    run_id: UUID = Field(default_factory=uuid4)
    capability: str
    input: dict[str, Any] = Field(default_factory=dict)
    context: RunContext = Field(default_factory=RunContext)
    config: RunConfig = Field(default_factory=RunConfig)
    prompt_version: str | None = None
    prompt_locale: str = 'en-US'


class PromptPin(BaseModel):
    model_config = ConfigDict(extra='forbid')

    key: str = ''
    version: str = ''
    locale: str = 'en-US'
    checksum: str = ''
    evaluation_profile: str = ''


class Usage(BaseModel):
    model_config = ConfigDict(extra='forbid')

    prompt_tokens: int = Field(default=0, ge=0)
    completion_tokens: int = Field(default=0, ge=0)
    cost_usd: Decimal = Field(default=Decimal('0'), ge=0)


class RunInterruption(BaseModel):
    model_config = ConfigDict(extra='forbid')

    interruption_id: str
    kind: str
    reason: str
    pending_actions: list[dict[str, Any]] = Field(default_factory=list)


class RunFailure(BaseModel):
    """Stable, serializable failure metadata without exception messages or secrets."""

    model_config = ConfigDict(extra='forbid')

    error_type: str
    retryable: bool = False


class RunResult(BaseModel):
    model_config = ConfigDict(extra='forbid')

    run_id: UUID
    status: RunStatus
    output: dict[str, Any] = Field(default_factory=dict)
    provider: str = ''
    model_name: str = ''
    fallback_used: bool = False
    usage: Usage = Field(default_factory=Usage)
    prompt: PromptPin = Field(default_factory=PromptPin)
    logs: list[str] = Field(default_factory=list)
    interruption: RunInterruption | None = None


@dataclass(slots=True)
class GatewayResponse:
    """Temporary compatibility response used by existing Django services."""

    payload: dict[str, Any]
    logs: list[str]
    provider: str
    model_name: str
    fallback_used: bool = False
    cost_usd: Decimal = Decimal('0')
    prompt_tokens: int = 0
    completion_tokens: int = 0
    prompt_key: str = ''
    prompt_version: str = ''
    prompt_locale: str = ''
    prompt_checksum: str = ''
    evaluation_profile: str = ''

    @classmethod
    def from_run_result(cls, result: RunResult) -> GatewayResponse:
        return cls(
            payload=result.output,
            logs=result.logs,
            provider=result.provider,
            model_name=result.model_name,
            fallback_used=result.fallback_used,
            cost_usd=result.usage.cost_usd,
            prompt_tokens=result.usage.prompt_tokens,
            completion_tokens=result.usage.completion_tokens,
            prompt_key=result.prompt.key,
            prompt_version=result.prompt.version,
            prompt_locale=result.prompt.locale,
            prompt_checksum=result.prompt.checksum,
            evaluation_profile=result.prompt.evaluation_profile,
        )
