from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class WorkflowEditInput(BaseModel):
    model_config = ConfigDict(extra='allow')

    mode: str = 'node'
    instruction: str = Field(min_length=1, max_length=8000)
    workflow: dict[str, Any]


class WorkflowEditOutput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    summary: str = Field(min_length=1)
    changed_node_ids: list[str]
