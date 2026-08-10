from pydantic import BaseModel, ConfigDict, Field, model_validator


class StoryboardInput(BaseModel):
    model_config = ConfigDict(extra='allow')

    video_topic: str = Field(min_length=1, max_length=500)
    duration: int = Field(default=30, ge=1, le=180)
    target_audience: str = Field(default='general audience', min_length=1, max_length=500)


class StoryboardScene(BaseModel):
    model_config = ConfigDict(extra='forbid')

    scene_number: int = Field(ge=1)
    visual_description: str = Field(min_length=1)
    audio_narration: str
    duration_seconds: int = Field(ge=1)


class StoryboardOutput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    video_topic: str = Field(min_length=1)
    total_duration_seconds: int = Field(ge=1)
    target_audience: str = Field(min_length=1)
    scenes: list[StoryboardScene] = Field(min_length=1)

    @model_validator(mode='after')
    def validate_timeline(self):
        expected_numbers = list(range(1, len(self.scenes) + 1))
        if [scene.scene_number for scene in self.scenes] != expected_numbers:
            raise ValueError('scene_number values must be sequential and start at 1')
        if sum(scene.duration_seconds for scene in self.scenes) != self.total_duration_seconds:
            raise ValueError('scene durations must sum to total_duration_seconds')
        return self
