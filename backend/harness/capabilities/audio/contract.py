from pydantic import BaseModel, ConfigDict, Field


class AudioInput(BaseModel):
    model_config = ConfigDict(extra='allow')

    text: str = Field(min_length=1, max_length=5000)
    voice_id: str = Field(default='female_warm', min_length=1, max_length=100)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class AudioOutput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    optimized_text: str = Field(min_length=1)
    voice_direction: str = Field(min_length=1)
    estimated_duration_seconds: int = Field(ge=1)
    pause_markers: list[str]


class AudioResult(BaseModel):
    model_config = ConfigDict(extra='forbid')

    text: str = Field(min_length=1)
    original_text: str = Field(min_length=1)
    voice_id: str = Field(min_length=1)
    speed: float = Field(ge=0.5, le=2.0)
    voice_direction: str = Field(min_length=1)
    audio_url: str
    text_length: int = Field(ge=1)
    estimated_audio_duration_seconds: int = Field(ge=1)
