from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class EventType(StrEnum):
    RUN_QUEUED = 'run.queued'
    RUN_STARTED = 'run.started'
    MODEL_COMPLETED = 'model.completed'
    TOOL_REQUESTED = 'tool.requested'
    APPROVAL_REQUIRED = 'approval.required'
    RUN_RESUMED = 'run.resumed'
    RUN_SUCCEEDED = 'run.succeeded'
    RUN_FAILED = 'run.failed'
    RUN_CANCELLED = 'run.cancelled'


class RunEvent(BaseModel):
    model_config = ConfigDict(extra='forbid')

    event_id: UUID = Field(default_factory=uuid4)
    run_id: UUID
    sequence: int = Field(ge=1)
    type: EventType
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    data: dict[str, Any] = Field(default_factory=dict)
