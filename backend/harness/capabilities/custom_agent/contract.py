from pydantic import BaseModel, ConfigDict, Field, model_validator


class CustomAgentInput(BaseModel):
    model_config = ConfigDict(extra='allow')

    prompt: str = ''
    instruction: str = ''

    @model_validator(mode='after')
    def require_instruction(self):
        if not (self.prompt.strip() or self.instruction.strip()):
            raise ValueError('prompt or instruction is required')
        return self


class CustomAgentMetadata(BaseModel):
    model_config = ConfigDict(extra='forbid')

    notes: str = ''
    limitations: list[str] = Field(default_factory=list)


class CustomAgentOutput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    response: str = Field(min_length=1)
    metadata: CustomAgentMetadata
