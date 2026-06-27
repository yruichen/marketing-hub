from __future__ import annotations

import json
import re
from typing import Any

from ai_gateway.prompt_modules.common import (
    _strip_json_fence,
    append_context_lines,
    append_feedback_line,
    compact_text,
    fact_guardrail_block,
    json_contract_block,
    platform_strategy,
    quality_bar_block,
)

ASPECT_RATIO_SIZE_MAP = {
    '1:1': '1024x1024',
    '4:5': '768x1024',
    '9:16': '768x1024',
    '16:9': '1024x768',
    '3:4': '768x1024',
    '4:3': '1024x768',
}


def aspect_ratio_to_size(aspect_ratio: str) -> str:
    key = (aspect_ratio or '1:1').strip()
    return ASPECT_RATIO_SIZE_MAP.get(key, '1024x1024')


def build_image_generation_prompt(payload: dict[str, Any]) -> str:
    from api.image_style_skills import resolve_style_skill

    user_prompt = str(payload.get('prompt') or '').strip()
    style_skill = payload.get('style_skill')
    legacy_style = payload.get('style')
    style = resolve_style_skill(style_skill, legacy_style) if (style_skill or legacy_style) else ''
    aspect_ratio = str(payload.get('aspect_ratio') or payload.get('aspectRatio') or '1:1').strip()
    platform = str(payload.get('platform') or '').strip()
    negative_prompt = str(payload.get('negative_prompt') or '').strip()

    parts: list[str] = []
    if user_prompt:
        parts.append(f'Core subject and marketing idea: {user_prompt}')
    if style:
        parts.append(f'Visual style guide: {style}')
    if platform:
        parts.append(f'Use case: social marketing key visual for {platform}; {platform_strategy(platform)}')
    workflow_context = compact_text(payload.get('workflow_context'), max_chars=700)
    if workflow_context:
        parts.append(f'Brand context: {workflow_context}')
    parts.append(
        'Advertising-grade composition, clear hero subject, believable product context, '
        'precise lighting, natural shadows, high-detail materials, clean background hierarchy, '
        'room for platform crop, no overlaid text, no watermark, no distorted hands or anatomy'
    )
    parts.append(f'Aspect ratio: {aspect_ratio}')
    if negative_prompt:
        parts.append(f'Negative prompt: {negative_prompt}')
    return '. '.join(part for part in parts if part)


def normalize_image_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        result = {}

    aspect_ratio = str(
        payload.get('aspect_ratio') or payload.get('aspectRatio') or result.get('aspect_ratio') or '1:1'
    ).strip()
    prompt = str(payload.get('prompt') or result.get('prompt') or '').strip()
    style = str(payload.get('style') or result.get('style') or '').strip()
    revised_prompt = str(result.get('revised_prompt') or build_image_generation_prompt(payload)).strip()
    image_url = str(result.get('image_url') or result.get('url') or '').strip()

    if not image_url and isinstance(result.get('data'), list) and result['data']:
        first = result['data'][0]
        if isinstance(first, dict):
            image_url = str(first.get('url') or '').strip()

    return {
        'prompt': prompt,
        'style': style,
        'aspect_ratio': aspect_ratio,
        'aspectRatio': aspect_ratio,
        'image_url': image_url,
        'revised_prompt': revised_prompt,
        'generated_images': int(result.get('generated_images') or (1 if image_url else 0)),
    }


IMAGE_PROMPT_SYSTEM_PROMPT = (
    '你是一位资深 AI 视觉提示词工程师，专精营销主视觉、社交媒体封面和产品广告图。'
    '根据品牌信息、内容主题与风格 Skill，生成可直接用于文生图模型的高精度英文 prompt。'
    'prompt 字段必须用英文撰写，prompt_zh 用中文解释画面意图。'
    f'{fact_guardrail_block()}'
)

IMAGE_PROMPT_JSON_SCHEMA_HINT = """{
  "prompt": "Detailed English prompt for text-to-image model: subject, scene, lighting, composition, style",
  "prompt_zh": "中文摘要，便于运营理解画面意图",
  "negative_prompt": "Elements to avoid, comma-separated",
  "composition_notes": "Brief notes on framing and aspect ratio usage"
}"""


def build_image_prompt_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    subject = str(payload.get('subject') or payload.get('product_description') or '').strip()
    brand_name = str(payload.get('brand_name') or 'Marketing-Hub').strip()
    style_text = str(payload.get('style') or '').strip()
    style_skill_id = str(payload.get('style_skill') or '').strip()
    aspect_ratio = str(payload.get('aspect_ratio') or '1:1').strip()
    platform = str(payload.get('platform') or '小红书').strip()
    negative_prompt = str(payload.get('negative_prompt') or '').strip()
    upstream_text = str(payload.get('upstream_text') or '').strip()
    feedback = str(payload.get('feedback') or '').strip()

    quality_bar = quality_bar_block((
        '英文 prompt 必须包含 subject, scene, composition, camera/framing, lighting, material/detail, mood/style, quality constraints。',
        '画面必须服务营销目标：主体明确、卖点可感知、平台裁切友好，不生成文字海报。',
        '负面词必须合并用户显式排除项，并补充常见生成缺陷。',
        'composition_notes 要说明主体位置、留白、画幅使用和社媒封面可读性。',
    ))

    user_lines = [
        '任务：为以下营销场景生成文生图 prompt。',
        f'- 品牌：{brand_name}',
        f'- 画面主题/产品描述：{subject or upstream_text or "未指定"}',
        f'- 风格 Skill：{style_text or "默认编辑风"}',
    ]
    if style_skill_id:
        user_lines.append(f'- 风格 Skill ID：{style_skill_id}')
    user_lines.extend([
        f'- 目标画幅：{aspect_ratio}',
        f'- 发布平台：{platform}',
        f'- 平台视觉策略：{platform_strategy(platform)}',
        f'- {quality_bar}',
        f'- {json_contract_block(IMAGE_PROMPT_JSON_SCHEMA_HINT)}',
    ])
    if negative_prompt:
        user_lines.append(f'- 必须排除的元素：{negative_prompt}')
    if upstream_text and upstream_text != subject:
        user_lines.append(f'- 上游节点内容参考：{compact_text(upstream_text, max_chars=2000)}')
    append_context_lines(user_lines, payload)
    append_feedback_line(user_lines, feedback)

    return [
        {'role': 'system', 'content': IMAGE_PROMPT_SYSTEM_PROMPT},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def normalize_image_prompt_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {'prompt': result}
    if not isinstance(result, dict):
        result = {}

    style_skill = str(payload.get('style_skill') or '').strip()
    style_text = str(payload.get('style') or result.get('style') or '').strip()
    aspect_ratio = str(payload.get('aspect_ratio') or result.get('aspect_ratio') or '1:1').strip()
    negative_prompt = str(
        result.get('negative_prompt') or payload.get('negative_prompt') or ''
    ).strip()
    prompt = str(result.get('prompt') or '').strip()
    prompt_zh = str(result.get('prompt_zh') or '').strip()

    if not prompt:
        subject = str(payload.get('subject') or payload.get('upstream_text') or 'marketing visual').strip()
        prompt = f'{subject}, {style_text}, aspect ratio {aspect_ratio}, professional marketing photography'

    default_negatives = 'low quality, blurry, watermark, logo-like random text, distorted anatomy, extra fingers, cluttered layout'
    if negative_prompt:
        if default_negatives not in negative_prompt:
            negative_prompt = f'{negative_prompt}, {default_negatives}'
    else:
        negative_prompt = default_negatives

    return {
        'prompt': prompt,
        'prompt_zh': prompt_zh,
        'negative_prompt': negative_prompt,
        'aspect_ratio': aspect_ratio,
        'style_skill': style_skill,
        'style': style_text,
        'composition_notes': str(result.get('composition_notes') or '').strip(),
    }
