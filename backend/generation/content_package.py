"""Business orchestration for the multi-capability content-package flow."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from harness.contracts import GatewayResponse
from harness.facade import HarnessFacade
from api.image_style_skills import DEFAULT_IMAGE_STYLE_SKILL_ID, resolve_style_skill


REWRITE_FEEDBACK: dict[str, str] = {
    'short': 'Compress the copy for fast mobile reading.',
    'conflict': 'Open with a clearer problem tension without manufacturing anxiety.',
    'professional': 'Use a restrained professional voice with fewer exclamations and colloquialisms.',
    'young': 'Use a lighter, younger voice while preserving brand credibility.',
    'calm': 'Replace exaggerated claims with factual, scenario-based language.',
}


class ContentPackageInput(BaseModel):
    """Language-neutral contract for the copy + storyboard application workflow."""

    model_config = ConfigDict(extra='allow', str_strip_whitespace=True)

    brief: str = Field(min_length=1, max_length=8000)
    brand_name: str = Field(min_length=1, max_length=200)
    use_case: str = Field(default='', max_length=200)
    industry: str = Field(default='', max_length=200)
    audience: str = Field(min_length=1, max_length=500)
    tone: str = Field(min_length=1, max_length=200)
    forbidden_words: str = Field(default='', max_length=2000)
    reference_links: str = Field(default='', max_length=4000)
    channels: list[str] = Field(default_factory=list, max_length=12)
    platform: str = Field(default='', max_length=100)
    template: str = Field(default='', max_length=200)
    duration: int = Field(default=30, ge=1, le=180)
    output_locale: str = Field(default='zh-CN', max_length=20)
    rewrite_mode: str = Field(default='', max_length=100)
    feedback: str = Field(default='', max_length=4000)

    @model_validator(mode='after')
    def require_channel(self):
        self.channels = [str(channel).strip() for channel in self.channels if str(channel).strip()]
        self.platform = self.platform.strip()
        if not self.channels and not self.platform:
            raise ValueError('At least one channel or platform is required.')
        return self


class ContentPackageOutput(BaseModel):
    """Stable API contract for the content-package workflow result."""

    model_config = ConfigDict(extra='forbid')

    platform: str = Field(min_length=1)
    title: str = Field(min_length=1)
    body: str = Field(min_length=1)
    tags: list[str]
    imagePrompt: str = Field(min_length=1)
    storyboard: list[str] = Field(min_length=1)
    voiceover: str = Field(min_length=1)
    reviewAdvice: list[str] = Field(min_length=1)
    exportFormats: list[str] = Field(min_length=1)
    version: Literal['ai_draft', 'user_revision', 'final']


def _first_channel(payload: dict[str, Any]) -> str:
    channels = payload.get('channels') or []
    if isinstance(channels, list) and channels:
        return str(channels[0]).strip()
    return str(payload.get('platform') or '').strip()


def _workflow_context(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    mapping = {
        'use_case': 'Use case',
        'industry': 'Industry',
        'audience': 'Audience',
        'forbidden_words': 'Forbidden words',
        'reference_links': 'Reference links',
        'template': 'Template',
    }
    for key, label in mapping.items():
        value = str(payload.get(key) or '').strip()
        if value:
            parts.append(f'{label}: {value}')
    return '; '.join(parts)


def _build_image_prompt(payload: dict[str, Any], *, platform: str, brand_name: str) -> str:
    use_case = str(payload.get('use_case') or '').strip()
    audience = str(payload.get('audience') or '').strip()
    brief = str(payload.get('brief') or '').strip()
    aspect = str(payload.get('aspect_ratio') or '4:5').strip()
    style_skill = str(payload.get('style_skill') or DEFAULT_IMAGE_STYLE_SKILL_ID).strip()
    style = resolve_style_skill(style_skill, payload.get('visual_style') or payload.get('tone'))
    subject_parts = [
        f'Create a marketing key visual for {brand_name}.',
        f'Campaign brief: {brief[:120]}',
    ]
    if use_case:
        subject_parts.append(f'Use case: {use_case}')
    if audience:
        subject_parts.append(f'Target audience: {audience}')
    subject = ' '.join(subject_parts)
    return HarnessFacade.render_generation_prompt('image', {
        'prompt': subject,
        'style': style,
        'style_skill': style_skill,
        'aspect_ratio': aspect,
        'platform': platform,
    })


def _build_review_advice(payload: dict[str, Any], *, platform: str, locale: str) -> list[str]:
    advice = [
        HarnessFacade.localize('content_package.review.brand', locale),
        HarnessFacade.localize('content_package.review.channel', locale, platform=platform),
        HarnessFacade.localize('content_package.review.save', locale),
    ]
    forbidden = str(payload.get('forbidden_words') or '').strip()
    if forbidden:
        advice.insert(0, HarnessFacade.localize('content_package.review.forbidden', locale, forbidden=forbidden))
    return advice


def _storyboard_lines(storyboard: dict[str, Any], *, locale: str) -> list[str]:
    lines: list[str] = []
    for scene in storyboard.get('scenes') or []:
        if not isinstance(scene, dict):
            continue
        number = scene.get('scene_number') or len(lines) + 1
        visual = str(scene.get('visual_description') or '').strip()
        audio = str(scene.get('audio_narration') or '').strip()
        if visual and audio:
            lines.append(HarnessFacade.localize('content_package.scene.visual_audio', locale, number=number, visual=visual, audio=audio))
        elif visual:
            lines.append(HarnessFacade.localize('content_package.scene.visual', locale, number=number, visual=visual))
        elif audio:
            lines.append(HarnessFacade.localize('content_package.scene.audio', locale, number=number, audio=audio))
    return lines


def _voiceover_text(storyboard: dict[str, Any], copy_result: dict[str, Any]) -> str:
    narrations = [
        str(scene.get('audio_narration') or '').strip()
        for scene in (storyboard.get('scenes') or [])
        if isinstance(scene, dict) and str(scene.get('audio_narration') or '').strip()
    ]
    if narrations:
        return ' '.join(narrations)
    paragraphs = copy_result.get('paragraphs') or []
    if paragraphs:
        return ' '.join(str(item).strip() for item in paragraphs if str(item).strip())
    return str(copy_result.get('call_to_action') or '').strip()


def assemble_content_package(
    copy_result: dict[str, Any],
    storyboard_result: dict[str, Any],
    payload: dict[str, Any],
    *,
    version: str = 'ai_draft',
) -> dict[str, Any]:
    locale = HarnessFacade.normalize_locale(str(payload.get('output_locale') or 'zh-CN'))
    platform = str(copy_result.get('platform') or _first_channel(payload)).strip()
    brand_name = str(payload.get('brand_name') or '').strip()
    paragraphs = copy_result.get('paragraphs') or []
    body = '\n\n'.join(str(item).strip() for item in paragraphs if str(item).strip())
    if not body:
        body = str(copy_result.get('title') or payload.get('brief') or '').strip()

    storyboard_lines = _storyboard_lines(storyboard_result, locale=locale)

    tags = copy_result.get('tags') or []
    if not isinstance(tags, list):
        tags = []

    result = {
        'platform': platform,
        'title': str(copy_result.get('title') or '').strip(),
        'body': body,
        'tags': [str(tag).strip() for tag in tags if str(tag).strip()],
        'imagePrompt': _build_image_prompt(payload, platform=platform, brand_name=brand_name),
        'storyboard': storyboard_lines,
        'voiceover': _voiceover_text(storyboard_result, copy_result),
        'reviewAdvice': _build_review_advice(payload, platform=platform, locale=locale),
        'exportFormats': ['Markdown', 'Docx', 'CSV'],
        'version': version,
    }
    return ContentPackageOutput.model_validate(result).model_dump()


def generate_content_package(
    *,
    organization,
    role: str | None,
    payload: dict[str, Any],
) -> tuple[dict[str, Any], list[str], GatewayResponse, GatewayResponse]:
    payload = ContentPackageInput.model_validate(payload).model_dump()
    platform = _first_channel(payload)
    brand_name = str(payload['brand_name']).strip()
    brief = str(payload['brief']).strip()
    tone = str(payload['tone']).strip()
    audience = str(payload['audience']).strip()
    workflow_context = _workflow_context(payload)

    rewrite_mode = str(payload.get('rewrite_mode') or '').strip()
    feedback = str(payload.get('feedback') or REWRITE_FEEDBACK.get(rewrite_mode, '')).strip()
    version = 'user_revision' if rewrite_mode or feedback else 'ai_draft'

    copy_gateway = HarnessFacade.execute(
        organization=organization,
        role=role,
        task_type='copy',
        payload={
            'brand_name': brand_name,
            'product_description': brief,
            'tone': tone,
            'platform': platform,
            'workflow_context': workflow_context,
            'feedback': feedback,
        },
        prompt_key='marketing.copy.system',
    )

    storyboard_gateway = HarnessFacade.execute(
        organization=organization,
        role=role,
        task_type='storyboard',
        payload={
            'video_topic': brief,
            'duration': int(payload.get('duration') or 30),
            'target_audience': audience,
            'platform': platform,
            'workflow_context': workflow_context,
        },
        prompt_key='marketing.storyboard.system',
    )

    package = assemble_content_package(
        copy_gateway.payload,
        storyboard_gateway.payload,
        payload,
        version=version,
    )
    logs = [
        'content_package:orchestration=copy+storyboard',
        *copy_gateway.logs,
        *storyboard_gateway.logs,
    ]
    return package, logs, copy_gateway, storyboard_gateway
