from __future__ import annotations

from typing import Protocol
from uuid import UUID

from harness.contracts import RunEvent, RunState


class CheckpointStore(Protocol):
    def create(self, state: RunState) -> bool: ...

    def save(self, state: RunState) -> None: ...

    def load(self, run_id: UUID) -> RunState | None: ...


class EventSink(Protocol):
    def emit(self, event: RunEvent) -> None: ...


class NullCheckpointStore:
    def create(self, state: RunState) -> bool:
        return True

    def save(self, state: RunState) -> None:
        return None

    def load(self, run_id: UUID) -> RunState | None:
        return None


class NullEventSink:
    def emit(self, event: RunEvent) -> None:
        return None
