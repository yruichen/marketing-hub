from pydantic import BaseModel, ConfigDict, Field, model_validator


class ImagePromptInput(BaseModel):
    model_config = ConfigDict(extra='allow')

    subject: str = ''
    product_description: str = ''
    upstream_text: str = ''

    @model_validator(mode='after')
    def require_source(self):
        if not (self.subject.strip() or self.product_description.strip() or self.upstream_text.strip()):
            raise ValueError('subject, product_description, or upstream_text is required')
        return self


class ImagePromptOutput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    prompt: str = Field(min_length=1)
    prompt_localized: str
    negative_prompt: str
    composition_notes: str


class ImagePromptResult(ImagePromptOutput):
    prompt_zh: str
    aspect_ratio: str = Field(min_length=1)
    style_skill: str
    style: str
