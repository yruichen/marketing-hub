from pydantic import BaseModel, ConfigDict, Field


class ImageInput(BaseModel):
    model_config = ConfigDict(extra='allow')

    prompt: str = Field(min_length=1, max_length=3000)
    aspect_ratio: str = '1:1'


class ImageOutput(BaseModel):
    model_config = ConfigDict(extra='allow')

    prompt: str = Field(min_length=1)
    aspect_ratio: str = Field(min_length=1)
    image_url: str = Field(min_length=1)
    generated_images: int = Field(ge=1)
