from pydantic import BaseModel, ConfigDict, Field


class CopyInput(BaseModel):
    model_config = ConfigDict(extra='allow')

    brand_name: str = Field(min_length=1, max_length=200)
    product_description: str = Field(min_length=1, max_length=8000)
    tone: str = Field(default='clear and specific', min_length=1, max_length=200)
    platform: str = Field(default='general', min_length=1, max_length=100)


class CopyOutput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    title: str = Field(min_length=1)
    paragraphs: list[str] = Field(min_length=1)
    tags: list[str]
    call_to_action: str = Field(min_length=1)


class CopyResult(CopyOutput):
    platform: str = Field(min_length=1)
    tone: str = Field(min_length=1)
