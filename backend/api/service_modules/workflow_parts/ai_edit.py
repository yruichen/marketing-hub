from __future__ import annotations

import copy
import json
import re
from typing import Any

from django.contrib.auth.models import User

from ai_gateway.services import AIModelGateway
from api.audit import record_audit_log
from api.contracts import NODE_IO_SCHEMAS, validate_workflow_graph
from api.models import Organization, WorkspaceDraft
from api.service_modules.workspace import membership_role


EDIT_PROMPT = """你是 Marketing-Hub 工作流编辑器。
根据用户修改意见，返回严格 JSON，不要解释，不要 markdown。
JSON 结构：
{
  "nodes": [完整节点数组],
  "edges": [完整连线数组],
  "summary": "简短说明修改了什么",
  "changed_node_ids": ["被修改节点 id"]
}
规则：
- node 模式只允许修改目标 node_id 的 label/config，不要改其它节点和连线。
- workflow 模式可批量修改 label/config/x/y 和 edges，但不要删除用户节点。
- 不要修改 id、type、input_schema、output_schema、status、output、task_id、error_message。
- config 只能合并/更新已有配置或增加 ai_edit_instruction/reference_urls/asset_ids 等前端配置字段。
- 返回必须是合法 JSON。
"""


def _loads_json(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    try:
        loaded = json.loads(text)
        return loaded if isinstance(loaded, dict) else None
    except json.JSONDecodeError:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if not match:
            return None
        try:
            loaded = json.loads(match.group(0))
            return loaded if isinstance(loaded, dict) else None
        except json.JSONDecodeError:
            return None


def _normalize_node(node: dict[str, Any]) -> dict[str, Any]:
    node_type = str(node.get('type') or 'custom_agent')
    schema = NODE_IO_SCHEMAS.get(node_type, NODE_IO_SCHEMAS['custom_agent'])
    next_node = copy.deepcopy(node)
    next_node.setdefault('config', {})
    if not isinstance(next_node['config'], dict):
        next_node['config'] = {}
    next_node.setdefault('input_schema', schema['input'])
    next_node.setdefault('output_schema', schema['output'])
    next_node.setdefault('status', 'idle')
    next_node.setdefault('output', {})
    next_node.setdefault('width', 320)
    next_node.setdefault('height', 360)
    return next_node


def _fallback_edit(
    *,
    mode: str,
    instruction: str,
    node_id: str,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
) -> dict[str, Any]:
    next_nodes = [_normalize_node(node) for node in nodes]
    changed_node_ids: list[str] = []
    target_ids = [node_id] if mode == 'node' and node_id else [str(node.get('id')) for node in next_nodes if node.get('id')]
    for node in next_nodes:
        if str(node.get('id')) not in target_ids:
            continue
        config = node.setdefault('config', {})
        config['ai_edit_instruction'] = instruction
        if mode == 'node':
            node['label'] = str(node.get('label') or node.get('type') or '节点')
        changed_node_ids.append(str(node.get('id')))
        if mode == 'node':
            break
    return {
        'nodes': next_nodes,
        'edges': [copy.deepcopy(edge) for edge in edges],
        'summary': '已记录 AI 修改意见，可继续应用或运行。',
        'changed_node_ids': changed_node_ids,
    }


def _constrain_result(
    *,
    mode: str,
    node_id: str,
    original_nodes: list[dict[str, Any]],
    original_edges: list[dict[str, Any]],
    candidate: dict[str, Any],
    fallback: dict[str, Any],
) -> dict[str, Any]:
    original_by_id = {str(node.get('id')): _normalize_node(node) for node in original_nodes if node.get('id')}
    candidate_nodes = candidate.get('nodes')
    if not isinstance(candidate_nodes, list):
        candidate_nodes = fallback['nodes']

    next_nodes: list[dict[str, Any]] = []
    changed_node_ids: list[str] = []
    candidate_by_id = {str(node.get('id')): node for node in candidate_nodes if isinstance(node, dict) and node.get('id')}

    for original_id, original in original_by_id.items():
        proposed = candidate_by_id.get(original_id)
        if mode == 'node' and original_id != node_id:
            next_nodes.append(copy.deepcopy(original))
            continue
        if not isinstance(proposed, dict):
            next_nodes.append(copy.deepcopy(original))
            continue
        next_node = copy.deepcopy(original)
        label = proposed.get('label')
        if isinstance(label, str) and label.strip():
            next_node['label'] = label.strip()[:180]
        if isinstance(proposed.get('x'), (int, float)):
            next_node['x'] = proposed['x']
        if isinstance(proposed.get('y'), (int, float)):
            next_node['y'] = proposed['y']
        proposed_config = proposed.get('config')
        if isinstance(proposed_config, dict):
            next_node['config'] = {**(next_node.get('config') or {}), **proposed_config}
        if next_node != original:
            changed_node_ids.append(original_id)
        next_nodes.append(_normalize_node(next_node))

    if mode == 'node':
        next_edges = [copy.deepcopy(edge) for edge in original_edges]
    else:
        proposed_edges = candidate.get('edges')
        next_edges = [copy.deepcopy(edge) for edge in proposed_edges] if isinstance(proposed_edges, list) else [copy.deepcopy(edge) for edge in original_edges]

    errors = validate_workflow_graph(next_nodes, next_edges)
    if errors:
        return fallback | {'summary': f'AI 返回的工作流不合法，已使用安全修改。{"; ".join(errors[:2])}'}

    return {
        'nodes': next_nodes,
        'edges': next_edges,
        'summary': str(candidate.get('summary') or fallback.get('summary') or '已应用 AI 修改。')[:400],
        'changed_node_ids': changed_node_ids or fallback.get('changed_node_ids', []),
    }


def ai_edit_workflow(
    draft: WorkspaceDraft,
    *,
    mode: str,
    instruction: str,
    node_id: str = '',
    nodes: list[dict[str, Any]] | None = None,
    edges: list[dict[str, Any]] | None = None,
    brand_context: dict[str, Any] | None = None,
    username: str | None = None,
) -> dict[str, Any]:
    mode = mode if mode in {'node', 'workflow'} else 'node'
    instruction = instruction.strip()
    source_nodes = [_normalize_node(node) for node in (nodes if isinstance(nodes, list) else draft.nodes or []) if isinstance(node, dict)]
    source_edges = [edge for edge in (edges if isinstance(edges, list) else draft.edges or []) if isinstance(edge, dict)]
    fallback = _fallback_edit(mode=mode, instruction=instruction, node_id=node_id, nodes=source_nodes, edges=source_edges)

    if not instruction:
        return fallback | {'summary': '请输入 AI 修改意见。'}
    if mode == 'node' and not any(str(node.get('id')) == node_id for node in source_nodes):
        return fallback | {'summary': '目标节点不存在。'}

    user = User.objects.filter(username=username).first() if username else None
    role = membership_role(user, draft.organization)
    candidate: dict[str, Any] | None = None
    try:
        gateway = AIModelGateway.execute(
            organization=draft.organization if isinstance(draft.organization, Organization) else None,
            role=role,
            task_type='custom_agent',
            prompt_key='marketing.custom_agent.system',
            payload={
                'name': 'Workflow AI Editor',
                'prompt': EDIT_PROMPT,
                'feedback': instruction,
                'brand_context': json.dumps(brand_context or draft.brand_context or {}, ensure_ascii=False),
                'upstream_text': json.dumps({
                    'mode': mode,
                    'node_id': node_id,
                    'nodes': source_nodes,
                    'edges': source_edges,
                }, ensure_ascii=False),
            },
        )
        payload = gateway.payload if isinstance(gateway.payload, dict) else {}
        candidate = _loads_json(payload.get('response')) or _loads_json(payload.get('metadata'))
    except Exception:
        candidate = None

    result = _constrain_result(
        mode=mode,
        node_id=node_id,
        original_nodes=source_nodes,
        original_edges=source_edges,
        candidate=candidate or fallback,
        fallback=fallback,
    )
    record_audit_log(
        action='assistant_step',
        actor=user,
        organization=draft.organization,
        target_type='workspace_draft',
        target_id=str(draft.id),
        metadata={'mode': mode, 'node_id': node_id, 'changed_node_ids': result.get('changed_node_ids', [])},
    )
    return result
