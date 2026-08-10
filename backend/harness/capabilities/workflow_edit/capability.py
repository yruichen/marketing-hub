from __future__ import annotations

import json
from typing import Any

from harness.capabilities._shared import (
    compact_text,
    output_locale_instruction,
    render_user_prompt,
    resolve_prompt_asset,
)


def build_workflow_edit_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    asset = resolve_prompt_asset('marketing.workflow_edit.system', payload)
    source = payload.get('workflow') if isinstance(payload.get('workflow'), dict) else {}
    user_prompt = render_user_prompt(asset, {
        'output_locale_instruction': output_locale_instruction(payload),
        'mode': str(payload.get('mode') or 'node'),
        'node_id': str(payload.get('node_id') or ''),
        'instruction': compact_text(payload.get('instruction'), max_chars=1600),
        'brand_context': json.dumps(payload.get('brand_context') or {}, ensure_ascii=False),
        'workflow': json.dumps(source, ensure_ascii=False),
        'response_schema': asset.schema_hint,
    })
    return [
        {'role': 'system', 'content': asset.system_prompt},
        {'role': 'user', 'content': user_prompt},
    ]


def normalize_workflow_edit_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    return result if isinstance(result, dict) else {}
