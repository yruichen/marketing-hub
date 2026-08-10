from __future__ import annotations

import logging

from harness.contracts import RunEvent


logger = logging.getLogger('marketing_hub.harness')


class LoggingEventSink:
    """Metadata-only event sink; prompt and tool content are never logged."""

    def emit(self, event: RunEvent) -> None:
        logger.info(
            'harness_event run_id=%s sequence=%s type=%s',
            event.run_id,
            event.sequence,
            event.type.value,
        )
