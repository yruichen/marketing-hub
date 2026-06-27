from __future__ import annotations

import json
import re
from typing import Any


def _strip_json_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\s*```$', '', cleaned)
    return cleaned.strip()


def compact_text(value: Any, *, max_chars: int = 1200) -> str:
    if value in (None, '', [], {}):
        return ''
    if isinstance(value, str):
        text = value.strip()
    else:
        text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) <= max_chars:
        return text
    return f'{text[:max_chars].rstrip()}...'


def compact_json(value: Any, *, max_chars: int = 1600) -> str:
    if value in (None, '', [], {}):
        return ''
    if isinstance(value, str):
        text = value.strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return compact_text(text, max_chars=max_chars)
        return compact_json(parsed, max_chars=max_chars)
    return compact_text(value, max_chars=max_chars)


def append_context_lines(lines: list[str], payload: dict[str, Any], *, label: str = '工作流/品牌上下文') -> None:
    context = compact_json(payload.get('workflow_context') or payload.get('brand_context'), max_chars=1800)
    if context:
        lines.append(f'- {label}：{context}')

    upstream = compact_text(payload.get('upstream_text'), max_chars=1600)
    if upstream:
        lines.append(f'- 上游内容摘要：{upstream}')


def append_feedback_line(lines: list[str], feedback: str, *, label: str = '修改意见') -> None:
    cleaned = compact_text(feedback, max_chars=1000)
    if cleaned:
        lines.append(f'- {label}（优先级高于默认风格，但不得覆盖事实与合规要求）：{cleaned}')


def json_contract_block(schema_hint: str) -> str:
    return (
        '输出要求：只输出一个可解析 JSON object；不要 markdown；不要解释性前后缀；'
        '字段缺失时使用合理空值或短文本补齐；不得输出 schema 之外的大段说明。\n'
        f'JSON 结构：\n{schema_hint}'
    )


def quality_bar_block(items: list[str] | tuple[str, ...]) -> str:
    return '质量自检（生成前内部检查，最终不要输出检查过程）：\n' + '\n'.join(
        f'{index}. {item}' for index, item in enumerate(items, 1)
    )


def fact_guardrail_block() -> str:
    return (
        '事实与合规边界：只使用输入中出现或可合理概括的信息；'
        '不要编造价格、销量、认证、疗效、奖项、用户评价、合作品牌或平台政策；'
        '缺少信息时用场景化表达替代确定性承诺。'
    )


PLATFORM_STRATEGIES = {
    'xiaohongshu': {
        'label': '小红书',
        'strategy': (
            '首屏要有具体生活场景或反差钩子；语气像真实体验分享，短段落、轻 emoji；'
            '突出使用前后、场景痛点、可收藏信息；标签 4-8 个，避免硬广和夸张承诺。'
        ),
    },
    '小红书': {
        'label': '小红书',
        'strategy': (
            '首屏要有具体生活场景或反差钩子；语气像真实体验分享，短段落、轻 emoji；'
            '突出使用前后、场景痛点、可收藏信息；标签 4-8 个，避免硬广和夸张承诺。'
        ),
    },
    'wechat': {
        'label': '微信公众号',
        'strategy': (
            '标题偏观点或利益点；正文结构清晰、信息密度高、语气可信克制；'
            '少用 emoji 和感叹号；CTA 引导关注、咨询或阅读原文。'
        ),
    },
    '微信': {
        'label': '微信公众号',
        'strategy': (
            '标题偏观点或利益点；正文结构清晰、信息密度高、语气可信克制；'
            '少用 emoji 和感叹号；CTA 引导关注、咨询或阅读原文。'
        ),
    },
    '公众号': {
        'label': '微信公众号',
        'strategy': (
            '标题偏观点或利益点；正文结构清晰、信息密度高、语气可信克制；'
            '少用 emoji 和感叹号；CTA 引导关注、咨询或阅读原文。'
        ),
    },
    'douyin': {
        'label': '抖音',
        'strategy': (
            '前 3 秒必须能口播抓人；句子短、节奏强、适合字幕；'
            '用动作或冲突推进，不写长段解释；结尾给出明确互动或转化动作。'
        ),
    },
    '抖音': {
        'label': '抖音',
        'strategy': (
            '前 3 秒必须能口播抓人；句子短、节奏强、适合字幕；'
            '用动作或冲突推进，不写长段解释；结尾给出明确互动或转化动作。'
        ),
    },
}


def platform_strategy(platform: str) -> str:
    raw = (platform or '').strip()
    key = raw.lower()
    strategy = PLATFORM_STRATEGIES.get(key) or PLATFORM_STRATEGIES.get(raw)
    if strategy:
        return f"{strategy['label']}策略：{strategy['strategy']}"
    return f'{raw or "通用社交媒体"}策略：根据该渠道的阅读节奏适配标题、结构、标签和行动号召，避免泛泛而谈。'
