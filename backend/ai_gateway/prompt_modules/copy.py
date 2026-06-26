from __future__ import annotations

import json
import re
from typing import Any

from ai_gateway.prompt_modules.common import (
    append_context_lines,
    append_feedback_line,
    fact_guardrail_block,
    json_contract_block,
    platform_strategy,
    quality_bar_block,
)


COPY_SYSTEM_PROMPT = (
    '你是一位资深中文增长文案策划，专精中国社交媒体内容转化。'
    '你的任务不是写空泛广告语，而是把品牌事实、用户场景、差异化卖点和平台语感组织成可发布初稿。'
    '正文以中文为主；标签与 emoji 必须符合平台习惯。'
    f'{fact_guardrail_block()}'
)

COPY_JSON_SCHEMA_HINT = """{
  "title": "Catchy headline with emojis when appropriate for the platform",
  "paragraphs": [
    "Paragraph 1: engaging hook",
    "Paragraph 2: key value propositions",
    "Paragraph 3: transition toward action"
  ],
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "call_to_action": "Clear call to action"
}"""

PLATFORM_GUIDANCE = {
    'xiaohongshu': (
        '小红书风格：口语化种草语气，emoji 适度，短句分段，标签 4-8 个带 #，'
        '首句强钩子，避免硬广感，强调真实体验与使用场景。'
    ),
    '小红书': (
        '小红书风格：口语化种草语气，emoji 适度，短句分段，标签 4-8 个带 #，'
        '首句强钩子，避免硬广感，强调真实体验与使用场景。'
    ),
    'wechat': (
        '微信公众号风格：信息密度高、段落结构清晰，语气可信克制，'
        '少用感叹号，适合深度阅读，CTA 引导关注或点击阅读原文。'
    ),
    '微信': (
        '微信公众号风格：信息密度高、段落结构清晰，语气可信克制，'
        '少用感叹号，适合深度阅读，CTA 引导关注或点击阅读原文。'
    ),
    'douyin': (
        '抖音短视频文案风格：前 3 秒强钩子，口语化可念读，节奏短促，'
        '适合字幕与口播，结尾明确行动号召。'
    ),
    '抖音': (
        '抖音短视频文案风格：前 3 秒强钩子，口语化可念读，节奏短促，'
        '适合字幕与口播，结尾明确行动号召。'
    ),
}

PLATFORM_FEW_SHOT = {
    'xiaohongshu': '范例标题：「这支精华真的把熬夜脸救回来了✨」；正文短句+emoji；标签如 #护肤 #好物分享',
    '小红书': '范例标题：「这支精华真的把熬夜脸救回来了✨」；正文短句+emoji；标签如 #护肤 #好物分享',
    'wechat': '范例标题：「为什么越来越多品牌选择 AI 内容工作流」；正文分 3-4 段论述价值',
    '微信': '范例标题：「为什么越来越多品牌选择 AI 内容工作流」；正文分 3-4 段论述价值',
    'douyin': '范例钩子：「还在一条一条写脚本？这个工具 10 分钟搞定全平台内容」',
    '抖音': '范例钩子：「还在一条一条写脚本？这个工具 10 分钟搞定全平台内容」',
}


def _platform_hint(platform: str) -> str:
    key = (platform or '').strip().lower()
    guidance = PLATFORM_GUIDANCE.get(key) or PLATFORM_GUIDANCE.get(platform or '') or platform_strategy(platform)
    few_shot = PLATFORM_FEW_SHOT.get(key) or PLATFORM_FEW_SHOT.get(platform or '')
    if guidance and few_shot:
        return f'{guidance} {few_shot}'
    if guidance:
        return guidance
    return f'按 {platform or "通用社交媒体"} 的内容习惯适配语气、结构与标签。'


def build_copy_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    brand_name = str(payload.get('brand_name') or 'Marketing Hub').strip()
    product_description = str(payload.get('product_description') or '').strip()
    tone = str(payload.get('tone') or '爆款活泼').strip()
    platform = str(payload.get('platform') or 'Xiaohongshu').strip()
    feedback = str(payload.get('feedback') or '').strip()

    quality_bar = quality_bar_block((
        '标题必须具体，能体现用户场景、问题、结果或反差，不写“震撼发布”等空泛词。',
        '第一段承担钩子：让目标用户知道“这和我有关”。',
        '正文至少包含一个使用场景、一个核心卖点、一个信任理由或差异化表达。',
        'CTA 要与平台动作匹配，例如收藏、评论、咨询、阅读原文、试用；不要只写“了解更多”。',
        '标签要具体且可搜索，避免“品牌”“营销”“好物”等孤立泛词过多。',
    ))

    user_lines = [
        '任务：根据以下输入生成一版可发布的营销文案初稿。',
        f'- 品牌/产品名：{brand_name}',
        f'- 产品描述：{product_description or "未指定"}',
        f'- 语气风格：{tone}',
        f'- 目标平台：{platform}',
        f'- 平台写作要求：{_platform_hint(platform)}',
        f'- {quality_bar}',
        f'- {json_contract_block(COPY_JSON_SCHEMA_HINT)}',
    ]
    append_context_lines(user_lines, payload)
    append_feedback_line(user_lines, feedback)

    return [
        {'role': 'system', 'content': COPY_SYSTEM_PROMPT},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def _strip_json_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\s*```$', '', cleaned)
    return cleaned.strip()


def _coerce_paragraphs(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [part.strip() for part in value.split('\n') if part.strip()]
    return []


def _coerce_tags(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip().lstrip('#') for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [part.strip().lstrip('#') for part in re.split(r'[,，\s]+', value) if part.strip()]
    return []


def normalize_copy_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {'title': payload.get('brand_name', 'Generated Copy'), 'paragraphs': [result], 'tags': [], 'call_to_action': ''}
    if not isinstance(result, dict):
        result = {}

    brand_name = str(payload.get('brand_name') or 'Marketing Hub').strip()
    tone = str(payload.get('tone') or '爆款活泼').strip()
    platform = str(payload.get('platform') or 'Xiaohongshu').strip()

    paragraphs = _coerce_paragraphs(result.get('paragraphs') or result.get('body') or result.get('content'))
    if not paragraphs and result.get('title'):
        paragraphs = [str(result.get('title'))]

    title = str(result.get('title') or brand_name).strip() or brand_name
    tags = _coerce_tags(result.get('tags'))
    call_to_action = str(result.get('call_to_action') or result.get('cta') or '').strip()

    if not paragraphs:
        paragraphs = [
            str(product) if (product := payload.get('product_description')) else f'{brand_name} marketing copy draft.',
        ]
    if not tags:
        tags = [platform.replace(' ', ''), tone.replace(' ', ''), brand_name.replace(' ', '')][:4]
    if not call_to_action:
        call_to_action = f'了解更多关于 {brand_name} 的信息。'

    return {
        'title': title,
        'paragraphs': paragraphs,
        'tags': tags,
        'call_to_action': call_to_action,
        'platform': platform,
        'tone': tone,
    }
