from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from harness.contracts import (
    EventType,
    PromptPin,
    RunEvent,
    RunFailure,
    RunNotResumableError,
    RunRequest,
    RunResult,
    RunState,
    RunStatus,
    Usage,
)
from harness.policies import BudgetPolicy
from harness.ports import CheckpointStore, EventSink, ExecutionPort
from harness.ports.state import NullCheckpointStore, NullEventSink


class Runner:
    """Provider-neutral lifecycle runner around an execution adapter."""

    def __init__(
        self,
        *,
        executor: ExecutionPort,
        checkpoints: CheckpointStore | None = None,
        events: EventSink | None = None,
    ) -> None:
        self._executor = executor
        self._checkpoints = checkpoints or NullCheckpointStore()
        self._events = events or NullEventSink()

    def run(self, request: RunRequest) -> RunResult:
        existing = self._checkpoints.load(request.run_id) if request.config.checkpoint else None
        if existing is not None:
            return self._resolve_existing(existing, request)

        state = RunState(run_id=request.run_id, request=request)
        self._append_event(state, RunStatus.QUEUED, EventType.RUN_QUEUED)
        if request.config.checkpoint and not self._checkpoints.create(state):
            claimed = self._checkpoints.load(request.run_id)
            if claimed is None:
                raise RunNotResumableError(f'Run {request.run_id} is already claimed.')
            return self._resolve_existing(claimed, request)
        self._events.emit(state.events[-1])
        self._transition(state, RunStatus.RUNNING, EventType.RUN_STARTED)
        try:
            outcome = self._executor.execute(request)
            usage = Usage(
                prompt_tokens=outcome.prompt_tokens,
                completion_tokens=outcome.completion_tokens,
                cost_usd=Decimal(outcome.cost_usd),
            )
            BudgetPolicy.validate(request.config, usage)
            prompt = PromptPin(
                key=outcome.prompt_key,
                version=outcome.prompt_version,
                locale=outcome.prompt_locale,
                checksum=outcome.prompt_checksum,
                evaluation_profile=outcome.evaluation_profile,
            )
            state.usage = usage
            state.prompt = prompt
            result = RunResult(
                run_id=request.run_id,
                status=RunStatus.SUCCEEDED,
                output=outcome.payload,
                provider=outcome.provider,
                model_name=outcome.model_name,
                fallback_used=outcome.fallback_used,
                usage=usage,
                prompt=prompt,
                logs=outcome.logs,
            )
            state.result = result
            self._transition(state, RunStatus.SUCCEEDED, EventType.RUN_SUCCEEDED)
            return result
        except Exception as exc:
            state.error = RunFailure(error_type=type(exc).__name__)
            self._transition(
                state,
                RunStatus.FAILED,
                EventType.RUN_FAILED,
                {'error_type': type(exc).__name__},
            )
            raise

    def get_state(self, run_id: UUID) -> RunState | None:
        """Return the latest durable state when checkpointing is configured."""
        return self._checkpoints.load(run_id)

    @staticmethod
    def _resolve_existing(existing: RunState, request: RunRequest) -> RunResult:
        if existing.request.model_dump(mode='json') != request.model_dump(mode='json'):
            raise RunNotResumableError(
                f'Run id {request.run_id} is already bound to a different request.'
            )
        if existing.status == RunStatus.SUCCEEDED and existing.result is not None:
            return existing.result
        raise RunNotResumableError(
            f'Run {request.run_id} is {existing.status.value}; use a new run id. '
            'Stateful agent resume is not available through the completion runner.'
        )

    def _transition(
        self,
        state: RunState,
        status: RunStatus,
        event_type: EventType,
        data: dict | None = None,
    ) -> None:
        self._append_event(state, status, event_type, data)
        self._events.emit(state.events[-1])
        if state.request.config.checkpoint:
            self._checkpoints.save(state)

    @staticmethod
    def _append_event(
        state: RunState,
        status: RunStatus,
        event_type: EventType,
        data: dict | None = None,
    ) -> None:
        state.status = status
        event = RunEvent(
            run_id=state.run_id,
            sequence=len(state.events) + 1,
            type=event_type,
            data=data or {},
        )
        state.append_event(event)
