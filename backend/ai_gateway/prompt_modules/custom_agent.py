from __future__ import annotations

import json
import re
from typing import Any

from ai_gateway.prompt_modules.common import _strip_json_fence

CUSTOM_AGENT_SYSTEM_PROMPT = (
    '你是 Marketing-Hub 的可定制营销智能体。'
    '根据用户定义的任务说明与上游上下文完成指定工作。'
    '只输出合法 JSON，不要用 markdown 代码块包裹。'
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

    user_lines = [
        f'Agent name: {name}',
        f'Agent task definition:\n{custom_prompt or "No custom prompt provided — use upstream context to generate marketing content."}',
        f'- Required JSON schema:\n{CUSTOM_AGENT_JSON_SCHEMA_HINT}',
    ]
    if upstream_text:
        user_lines.append(f'- Upstream node outputs:\n{upstream_text}')
    if brand_context:
        user_lines.append(f'- Brand context:\n{brand_context}')
    if feedback:
        user_lines.append(f'- Revision feedback (apply strictly): {feedback}')

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
