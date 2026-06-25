from __future__ import annotations

import json
import re
from typing import Any

from ai_gateway.prompt_modules.common import _strip_json_fence

REVIEW_SYSTEM_PROMPT = (
    '你是一位营销内容合规与品牌一致性审核专家。'
    '审查给定内容的违禁词、品牌调性、平台规则符合度。'
    '只输出合法 JSON，不要用 markdown 代码块包裹。'
    'issues 需具体指出问题片段与修改建议。'
)

REVIEW_JSON_SCHEMA_HINT = """{
  "passed": true,
  "brand_consistency_score": 85,
  "sensitive_word_issues": [
    {"word": "问题词", "context": "出现上下文", "suggestion": "修改建议"}
  ],
  "channel_rule_issues": [
    {"rule": "违反的规则", "context": "出现上下文", "suggestion": "修改建议"}
  ],
  "summary": "整体审核结论与优先修改项",
  "revised_suggestions": ["建议修改 1", "建议修改 2"]
}"""


def build_review_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    title = str(payload.get('content_title') or payload.get('title') or '').strip()
    body = str(payload.get('content_body') or payload.get('product_description') or '').strip()
    tags = payload.get('tags') or []
    forbidden_words = str(payload.get('forbidden_words') or '').strip()
    channel_rules = str(payload.get('channel_rules') or '').strip()
    platform = str(payload.get('platform') or '小红书').strip()
    feedback = str(payload.get('feedback') or '').strip()
    workflow_context = payload.get('workflow_context')

    tag_text = ', '.join(str(t) for t in tags) if isinstance(tags, list) else str(tags)
    user_lines = [
        '请审核以下营销内容：',
        f'- 标题：{title or "（无标题）"}',
        f'- 正文：\n{body or "（无正文）"}',
        f'- 标签：{tag_text or "（无）"}',
        f'- 目标平台：{platform}',
        f'- 禁用词列表：{forbidden_words or "（未指定，按广告法与平台规范检查）"}',
        f'- 频道/渠道规则：{channel_rules or "（未指定，按平台通用规范检查）"}',
        f'- 输出 JSON 结构：\n{REVIEW_JSON_SCHEMA_HINT}',
    ]
    if workflow_context:
        user_lines.append(f'- 品牌上下文：{workflow_context}')
    if feedback:
        user_lines.append(f'- 额外审核要求：{feedback}')

    return [
        {'role': 'system', 'content': REVIEW_SYSTEM_PROMPT},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def _coerce_sensitive_issues(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    issues: list[dict[str, str]] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            issues.append({'word': item.strip(), 'context': '', 'suggestion': '请替换或删除'})
        elif isinstance(item, dict):
            issues.append({
                'word': str(item.get('word') or '').strip(),
                'context': str(item.get('context') or '').strip(),
                'suggestion': str(item.get('suggestion') or '请替换或删除').strip(),
            })
    return [i for i in issues if i.get('word')]


def _coerce_channel_issues(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    issues: list[dict[str, str]] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            issues.append({'rule': item.strip(), 'context': '', 'suggestion': '请按平台规范修改'})
        elif isinstance(item, dict):
            issues.append({
                'rule': str(item.get('rule') or '').strip(),
                'context': str(item.get('context') or '').strip(),
                'suggestion': str(item.get('suggestion') or '请按平台规范修改').strip(),
            })
    return [i for i in issues if i.get('rule')]


def normalize_review_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {'summary': result}
    if not isinstance(result, dict):
        result = {}

    sensitive = result.get('sensitive_word_issues') or []
    channel = result.get('channel_rule_issues') or []

    score = result.get('brand_consistency_score') or result.get('brand_consistency')
    try:
        brand_score = int(score) if score is not None else 80
    except (TypeError, ValueError):
        brand_score = 80

    passed = result.get('passed')
    if passed is None:
        passed = brand_score >= 70 and not sensitive

    return {
        'passed': bool(passed),
        'brand_consistency_score': max(0, min(100, brand_score)),
        'sensitive_word_issues': _coerce_sensitive_issues(sensitive),
        'channel_rule_issues': _coerce_channel_issues(channel),
        'summary': str(result.get('summary') or '审核完成').strip(),
        'revised_suggestions': [
            str(s).strip() for s in (result.get('revised_suggestions') or []) if str(s).strip()
        ],
    }
