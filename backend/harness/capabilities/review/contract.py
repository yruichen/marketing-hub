from pydantic import BaseModel, ConfigDict, Field, model_validator


class ReviewInput(BaseModel):
    model_config = ConfigDict(extra='allow')

    content_body: str = ''
    product_description: str = ''

    @model_validator(mode='after')
    def require_content(self):
        if not (self.content_body.strip() or self.product_description.strip()):
            raise ValueError('content_body or product_description is required')
        return self


class SensitiveWordIssue(BaseModel):
    model_config = ConfigDict(extra='forbid')

    word: str = Field(min_length=1)
    context: str = Field(min_length=1)
    suggestion: str = Field(min_length=1)


class ChannelRuleIssue(BaseModel):
    model_config = ConfigDict(extra='forbid')

    rule: str = Field(min_length=1)
    context: str = Field(min_length=1)
    suggestion: str = Field(min_length=1)


class ReviewOutput(BaseModel):
    model_config = ConfigDict(extra='forbid')

    passed: bool
    brand_consistency_score: int = Field(ge=0, le=100)
    sensitive_word_issues: list[SensitiveWordIssue]
    channel_rule_issues: list[ChannelRuleIssue]
    summary: str = Field(min_length=1)
    revised_suggestions: list[str]
