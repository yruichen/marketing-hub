from __future__ import annotations

from functools import lru_cache

from harness.adapters.django import DjangoCheckpointStore, DjangoGenerationExecutionAdapter
from harness.adapters.telemetry import LoggingEventSink
from harness.capabilities import CapabilityRegistry, build_capability_registry
from harness.runtime import Runner


@lru_cache(maxsize=1)
def capability_registry() -> CapabilityRegistry:
    return build_capability_registry()


@lru_cache(maxsize=1)
def generation_runner() -> Runner:
    return Runner(
        executor=DjangoGenerationExecutionAdapter(),
        checkpoints=DjangoCheckpointStore(),
        events=LoggingEventSink(),
    )
