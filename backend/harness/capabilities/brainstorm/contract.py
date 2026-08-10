from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BrainstormInput(BaseModel):
    model_config = ConfigDict(extra='allow')

    idea: str = Field(min_length=1, max_length=8000)


BrainstormNodeType = Literal[
    'context', 'copy', 'image', 'image_prompt', 'image_generation', 'storyboard',
    'video', 'video_generation', 'audio', 'retrieval', 'review', 'custom_agent', 'rag_search',
]


class BrainstormNode(BaseModel):
    model_config = ConfigDict(extra='forbid')

    id: str = Field(min_length=1, max_length=120)
    type: BrainstormNodeType
    label: str = Field(min_length=1, max_length=200)
    x: int = 0
    y: int = 0
    width: int = Field(default=260, ge=120, le=1200)
    height: int = Field(default=166, ge=80, le=1200)
    config: dict[str, Any] = Field(default_factory=dict)


class BrainstormEdge(BaseModel):
    model_config = ConfigDict(extra='forbid')

    id: str = Field(min_length=1, max_length=240)
    source: str = Field(min_length=1, max_length=120)
    target: str = Field(min_length=1, max_length=120)


class BrainstormOutput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    workflow_name: str = Field(min_length=1)
    brand_context: dict[str, Any]
    nodes: list[BrainstormNode] = Field(min_length=1)
    edges: list[BrainstormEdge]
    summary: str = Field(min_length=1)

    @model_validator(mode='after')
    def validate_graph(self):
        node_ids = [node.id for node in self.nodes]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError('Workflow node IDs must be unique.')
        if len(self.edges) != len({edge.id for edge in self.edges}):
            raise ValueError('Workflow edge IDs must be unique.')

        known = set(node_ids)
        parents = {node_id: 0 for node_id in node_ids}
        children = {node_id: [] for node_id in node_ids}
        undirected = {node_id: set() for node_id in node_ids}
        for edge in self.edges:
            if edge.source not in known or edge.target not in known:
                raise ValueError('Every workflow edge must reference existing nodes.')
            if edge.source == edge.target:
                raise ValueError('Workflow self-edges are not allowed.')
            parents[edge.target] += 1
            children[edge.source].append(edge.target)
            undirected[edge.source].add(edge.target)
            undirected[edge.target].add(edge.source)

        queue = [node_id for node_id, count in parents.items() if count == 0]
        visited = 0
        while queue:
            current = queue.pop()
            visited += 1
            for child in children[current]:
                parents[child] -= 1
                if parents[child] == 0:
                    queue.append(child)
        if visited != len(node_ids):
            raise ValueError('Workflow graph must be acyclic.')

        if len(node_ids) > 1:
            connected = {node_ids[0]}
            pending = [node_ids[0]]
            while pending:
                current = pending.pop()
                for neighbor in undirected[current] - connected:
                    connected.add(neighbor)
                    pending.append(neighbor)
            if connected != known:
                raise ValueError('Workflow graph must not contain disconnected nodes.')
        return self
