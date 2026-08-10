from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class VideoInput(BaseModel):
    model_config = ConfigDict(extra='allow')

    video_topic: str = Field(min_length=1, max_length=500)
    prompt: str = ''
    script: str = ''
    scenes: list[dict[str, Any]] = Field(default_factory=list)
    duration: int = Field(default=5, ge=1, le=60)

    @model_validator(mode='after')
    def require_visual_source(self):
        if not (self.prompt.strip() or self.script.strip() or self.scenes):
            raise ValueError('prompt, script, or scenes is required')
        return self


class VideoOutput(BaseModel):
    model_config = ConfigDict(extra='allow')

    video_topic: str = Field(min_length=1)
    video_url: str = Field(min_length=1)
    duration_seconds: int = Field(ge=1)
    aspect_ratio: str = Field(min_length=1)
