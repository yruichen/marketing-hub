from __future__ import annotations

import json
import re
from typing import Any

from ai_gateway.prompt_modules.common import _strip_json_fence

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
        parts.append(user_prompt)
    if style:
        parts.append(f'视觉风格：{style}')
    if platform:
        parts.append(f'适配 {platform} 社交媒体营销主视觉')
    parts.append('高清细节，专业构图，主体清晰，光影自然，无文字水印，无畸形肢体')
    parts.append(f'画幅比例：{aspect_ratio}')
    if negative_prompt:
        parts.append(f'避免：{negative_prompt}')
    return '。'.join(part for part in parts if part)


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
    '你是一位 AI 绘画提示词工程师，专精中国社交媒体营销视觉。'
    '根据品牌信息、内容主题与风格 Skill，生成可直接用于文生图模型的详细 prompt。'
    'prompt 字段用英文撰写（模型友好），同时提供 prompt_zh 中文摘要。'
    '只输出合法 JSON，不要用 markdown 代码块包裹。'
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
    workflow_context = payload.get('workflow_context')

    user_lines = [
        '请为以下营销场景生成文生图 prompt：',
        f'- 品牌：{brand_name}',
        f'- 画面主题/产品描述：{subject or upstream_text or "未指定"}',
        f'- 风格 Skill：{style_text or "默认编辑风"}',
    ]
    if style_skill_id:
        user_lines.append(f'- 风格 Skill ID：{style_skill_id}')
    user_lines.extend([
        f'- 目标画幅：{aspect_ratio}',
        f'- 发布平台：{platform}',
        f'- 输出 JSON 结构：\n{IMAGE_PROMPT_JSON_SCHEMA_HINT}',
    ])
    if upstream_text and upstream_text != subject:
        user_lines.append(f'- 上游节点内容参考：\n{upstream_text[:2000]}')
    if negative_prompt:
        user_lines.append(f'- 必须排除的元素：{negative_prompt}')
    if workflow_context:
        user_lines.append(f'- 工作流/品牌上下文：{workflow_context}')
    if feedback:
        user_lines.append(f'- 修改意见（必须严格执行）：{feedback}')

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

    return {
        'prompt': prompt,
        'prompt_zh': prompt_zh,
        'negative_prompt': negative_prompt,
        'aspect_ratio': aspect_ratio,
        'style_skill': style_skill,
        'style': style_text,
        'composition_notes': str(result.get('composition_notes') or '').strip(),
    }
