from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from harness.contracts.events import RunEvent
from harness.contracts.runs import PromptPin, RunFailure, RunInterruption, RunRequest, RunResult, RunStatus, Usage


class RunState(BaseModel):
    """Versioned checkpoint state for lifecycle recovery and idempotent replay."""

    model_config = ConfigDict(extra='forbid')

    schema_version: int = 2
    run_id: UUID
    request: RunRequest
    status: RunStatus = RunStatus.QUEUED
    turn: int = 0
    messages: list[dict[str, Any]] = Field(default_factory=list)
    pending_actions: list[dict[str, Any]] = Field(default_factory=list)
    interruption: RunInterruption | None = None
    usage: Usage = Field(default_factory=Usage)
    prompt: PromptPin = Field(default_factory=PromptPin)
    result: RunResult | None = None
    error: RunFailure | None = None
    events: list[RunEvent] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def append_event(self, event: RunEvent) -> None:
        self.events.append(event)
        self.updated_at = datetime.now(timezone.utc)
