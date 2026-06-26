from __future__ import annotations

import json
import re
from typing import Any

from ai_gateway.prompt_modules.common import (
    _strip_json_fence,
    append_feedback_line,
    compact_text,
    fact_guardrail_block,
    json_contract_block,
    quality_bar_block,
)

CUSTOM_AGENT_SYSTEM_PROMPT = (
    '你是 Marketing-Hub 的可定制营销智能体。'
    '根据用户定义的任务说明与上游上下文完成指定工作，必须优先遵循用户定义的任务边界。'
    f'{fact_guardrail_block()}'
)

CUSTOM_AGENT_JSON_SCHEMA_HINT = """{
  "response": "Your task output as structured text or data",
  "metadata": {"notes": "Any relevant metadata about the execution"}
}"""


def build_custom_agent_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    custom_prompt = str(payload.get('prompt') or '').strip()
    upstream_text = str(payload.get('upstream_text') or '').strip()
    brand_context = str(payload.get('brand_context') or '').strip()
    feedback = str(payload.get('feedback') or '').strip()
    name = str(payload.get('name') or '自定义智能体').strip()

    quality_bar = quality_bar_block((
        '先理解自定义任务目标，再使用上游节点信息完成输出。',
        '不得忽略品牌上下文、修改意见和用户给出的格式要求。',
        '如果任务要求与事实或合规冲突，要在 response 中给出可执行替代方案。',
    ))
    user_lines = [
        f'Agent name: {name}',
        f'Agent task definition:\n{custom_prompt or "No custom prompt provided — use upstream context to generate marketing content."}',
        f'- {quality_bar}',
        f'- {json_contract_block(CUSTOM_AGENT_JSON_SCHEMA_HINT)}',
    ]
    if upstream_text:
        user_lines.append(f'- Upstream node outputs:\n{compact_text(upstream_text, max_chars=3000)}')
    if brand_context:
        user_lines.append(f'- Brand context:\n{compact_text(brand_context, max_chars=1800)}')
    append_feedback_line(user_lines, feedback, label='Revision feedback')

    return [
        {'role': 'system', 'content': CUSTOM_AGENT_SYSTEM_PROMPT},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def normalize_custom_agent_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {'response': result, 'metadata': {}}
    if not isinstance(result, dict):
        result = {}

    response = str(result.get('response') or result.get('content') or result.get('text') or '').strip()
    metadata = result.get('metadata') if isinstance(result.get('metadata'), dict) else {}

    if not response:
        response = f"{payload.get('name', '自定义智能体')} 已完成处理。"

    return {
        'response': response,
        'metadata': {
            'model_used': metadata.get('model_used', ''),
            'upstream_count': len(payload.get('upstream', [])),
            **metadata,
        },
    }
