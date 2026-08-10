from __future__ import annotations

from typing import Any, Protocol


class ToolRuntime(Protocol):
    def schemas(self) -> list[dict[str, Any]]: ...

    async def execute(self, name: str, context: Any, arguments: dict[str, Any]) -> dict[str, Any]: ...
