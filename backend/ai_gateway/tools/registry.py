from __future__ import annotations

import inspect
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from asgiref.sync import sync_to_async
from pydantic import BaseModel, ValidationError

from ._base import ToolContext, ToolHandler, ToolNotAllowedError, ToolValidationError


@dataclass(slots=True)
class ToolSpec:
    """
    Declarative description of a callable tool.

    `parameters` is a JSON Schema dict (compatible with OpenAI / Vercel AI
    SDK's tool() signature). `handler` is an async callable receiving
    (ctx, args_dict) and returning a JSON-serializable result.
    """

    name: str
    description: str
    parameters: dict[str, Any]
    handler: ToolHandler
    # Optional pydantic model used to validate args before calling handler.
    # When set, the registry will run args through it on every invocation.
    arg_model: type[BaseModel] | None = None

    async def invoke(self, ctx: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
        if self.arg_model is not None:
            try:
                validated = self.arg_model.model_validate(args)
            except ValidationError as exc:
                raise ToolValidationError(
                    f'Tool {self.name} received invalid args: {exc.errors()}'
                ) from exc
            args = validated.model_dump()
        # Handlers may be sync or async. Wrap sync handlers so the agent
        # loop can `await` uniformly. Keep Django ORM work thread-sensitive:
        # SQLite and transaction-wrapped tests can otherwise lock tables, and
        # Django's connection handling is safer when ORM calls stay serialized.
        if inspect.iscoroutinefunction(self.handler):
            result = await self.handler(ctx, args)
        else:
            result = await sync_to_async(self.handler, thread_sensitive=True)(ctx, args)
        if not isinstance(result, dict):
            raise ToolValidationError(
                f'Tool {self.name} must return a dict, got {type(result).__name__}'
            )
        return result


def make_tool(
    *,
    name: str,
    description: str,
    arg_model: type[BaseModel] | None = None,
    extra_parameters: dict[str, Any] | None = None,
) -> Callable[[ToolHandler], ToolSpec]:
    """
    Decorator factory: turn an async function into a ToolSpec.

    Usage:
        @make_tool(
            name='list_projects',
            description='List recent projects for the current organization',
            arg_model=ListProjectsArgs,
        )
        async def list_projects(args: ListProjectsArgs, ctx: ToolContext) -> dict: ...
    """

    def decorator(fn: ToolHandler) -> ToolSpec:
        parameters: dict[str, Any] = extra_parameters or {}
        if arg_model is not None:
            parameters = arg_model.model_json_schema()
            # Remove title fields that pydantic adds; they bloat the schema
            _strip_titles(parameters)
        spec = ToolSpec(
            name=name,
            description=description,
            parameters=parameters,
            handler=fn,
            arg_model=arg_model,
        )
        return spec

    return decorator


def _strip_titles(node: Any) -> None:
    """Remove pydantic-generated 'title' keys from a JSON schema tree."""
    if isinstance(node, dict):
        node.pop('title', None)
        for value in node.values():
            _strip_titles(value)
    elif isinstance(node, list):
        for item in node:
            _strip_titles(item)


class ToolRegistry:
    """
    Static collection of ToolSpec. Lookup by name; iteration preserves
    registration order (which is also the order the LLM sees them in).
    """

    def __init__(self) -> None:
        self._tools: dict[str, ToolSpec] = {}

    def register(self, spec: ToolSpec) -> ToolSpec:
        if spec.name in self._tools:
            raise ValueError(f'Tool {spec.name!r} already registered')
        self._tools[spec.name] = spec
        return spec

    def get(self, name: str) -> ToolSpec:
        if name not in self._tools:
            raise KeyError(f'Unknown tool: {name!r}')
        return self._tools[name]

    def all(self) -> list[ToolSpec]:
        return list(self._tools.values())

    def schemas(self) -> list[dict[str, Any]]:
        """Return OpenAI-style tool schemas (for the LLM prompt)."""
        return [
            {
                'type': 'function',
                'function': {
                    'name': spec.name,
                    'description': spec.description,
                    'parameters': spec.parameters,
                },
            }
            for spec in self._tools.values()
        ]

    def __contains__(self, name: str) -> bool:
        return name in self._tools


def build_default_registry() -> ToolRegistry:
    """Build the registry with all built-in tools registered."""
    from .list_projects import build as build_list_projects
    from .get_project import build as build_get_project
    from .get_dashboard import build as build_get_dashboard
    from .create_copy import build as build_create_copy
    from .navigate import build as build_navigate

    registry = ToolRegistry()
    for builder in (
        build_list_projects,
        build_get_project,
        build_get_dashboard,
        build_create_copy,
        build_navigate,
    ):
        builder(registry)
    return registry


__all__ = [
    'ToolSpec',
    'ToolRegistry',
    'make_tool',
    'build_default_registry',
]
