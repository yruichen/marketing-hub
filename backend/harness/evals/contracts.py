from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EvalCase(BaseModel):
    """Provider-neutral evaluation input and named quality assertions."""

    model_config = ConfigDict(extra='forbid')

    id: str = Field(pattern=r'^[a-z0-9][a-z0-9-]*$')
    input: dict
    assertions: list[str] = Field(min_length=1)

    @field_validator('assertions')
    @classmethod
    def assertions_are_unique_and_named(cls, values: list[str]) -> list[str]:
        normalized = [value.strip() for value in values]
        if any(not value for value in normalized):
            raise ValueError('assertion names cannot be empty')
        if len(set(normalized)) != len(normalized):
            raise ValueError('assertion names must be unique within a case')
        return normalized


class EvalSuite(BaseModel):
    model_config = ConfigDict(extra='forbid')

    capability: str
    version: str
    cases: list[EvalCase] = Field(min_length=1)
    checksum: str = Field(min_length=64, max_length=64)

    @field_validator('cases')
    @classmethod
    def case_ids_are_unique(cls, values: list[EvalCase]) -> list[EvalCase]:
        ids = [case.id for case in values]
        if len(set(ids)) != len(ids):
            raise ValueError('evaluation case ids must be unique within a suite')
        return values
