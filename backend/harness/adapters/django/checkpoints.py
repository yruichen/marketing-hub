from __future__ import annotations

from uuid import UUID

from django.db import IntegrityError, transaction

from api.models import HarnessRun
from harness.contracts import RunState


class DjangoCheckpointStore:
    """Durable, versioned storage with an atomic run-id claim."""

    @staticmethod
    def _values(state: RunState) -> dict:
        context = state.request.context
        return {
            'organization_id': context.organization_id,
            'actor_id': context.actor_id,
            'capability': state.request.capability,
            'status': state.status.value,
            'trace_id': context.trace_id,
            'state': state.model_dump(mode='json'),
        }

    def create(self, state: RunState) -> bool:
        try:
            with transaction.atomic():
                HarnessRun.objects.create(run_id=state.run_id, **self._values(state))
        except IntegrityError:
            return False
        return True

    def save(self, state: RunState) -> None:
        HarnessRun.objects.update_or_create(
            run_id=state.run_id,
            defaults=self._values(state),
        )

    def load(self, run_id: UUID) -> RunState | None:
        snapshot = HarnessRun.objects.filter(run_id=run_id).values_list('state', flat=True).first()
        return RunState.model_validate(snapshot) if snapshot else None
