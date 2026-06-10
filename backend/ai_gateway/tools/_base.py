from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional

from api.models import Organization
from django.contrib.auth.models import User


@dataclass(slots=True)
class ToolContext:
    """
    Per-request context passed to every tool handler.

    Contains the resolved organization, the requesting user (may be None
    for anonymous demo sessions), and an optional session id for tracing.
    Tools must not reach for global state — they should be hermetic
    given this object.
    """

    organization: Organization
    user: Optional[User] = None
    session_id: Optional[int] = None
    # Loose bag for cross-tool correlation (e.g. request id for logging)
    meta: dict[str, Any] = field(default_factory=dict)


ToolHandler = Callable[[ToolContext, dict[str, Any]], Awaitable[dict[str, Any]]]


class ToolValidationError(ValueError):
    """Raised when a tool's args don't match its declared schema."""


class ToolNotAllowedError(PermissionError):
    """Raised when a tool denies access for the current org/user."""


__all__ = ['ToolContext', 'ToolHandler', 'ToolValidationError', 'ToolNotAllowedError']
