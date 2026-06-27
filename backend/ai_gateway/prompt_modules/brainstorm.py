from __future__ import annotations

import json
import re
from typing import Any

from ai_gateway.prompt_modules.common import _strip_json_fence, compact_text, fact_guardrail_block, json_contract_block, quality_bar_block

BRAINSTORM_SYSTEM_PROMPT = (
    '你是营销工作流架构师 AI，负责把模糊创意拆成可执行的多节点内容生产流程。'
    '根据用户的创意需求，设计由 AI 处理节点组成的有向无环图（DAG）工作流。'
    '从需求中推断 brand_context（品牌名、受众、语气、卖点、视觉风格、活动目标）。'
    '根据需求选择合适的节点类型：\n'
    '- "context"：品牌/受众设定（至少一个起始节点）\n'
    '- "copy"：文案/社媒内容生成\n'
    '- "image" / "image_prompt" / "image_generation"：视觉与配图流程\n'
    '- "storyboard"：视频分镜策划\n'
    '- "video_generation"：分镜/音频合成营销视频\n'
    '- "audio"：配音生成\n'
    '- "retrieval" / "rag_search"：检索参考\n'
    '- "review"：内容审核与合规\n'
    '- "custom_agent"：自定义专项任务\n'
    '图片相关节点的 config.style_skill 请从以下 ID 中选择：'
    'editorial_magazine, xiaohongshu_lifestyle, product_studio, minimal_flat, '
    'cinematic_film, illustration_hand, corporate_b2b, cyber_neon。'
    '节点水平间距约 300px（x 从 80 起，y 约 120），width=260，height=166。'
    '边必须构成有效 DAG，无环。'
    f'{fact_guardrail_block()}'
)

BRAINSTORM_JSON_SCHEMA_HINT = """{
  "workflow_name": "Short descriptive name for the workflow",
  "brand_context": {
    "brand_name": "Inferred brand or product name",
    "audience": "Target audience description",
    "tone": "Communication tone (e.g., playful, professional, bold)",
    "selling_points": "Key selling points or value proposition",
    "visual_style": "Visual style preference (e.g., minimalist, vibrant, editorial)",
    "campaign_goal": "Overall campaign objective"
  },
  "nodes": [
    {
      "id": "context-1",
      "type": "context",
      "label": "Brand Context",
      "x": 80,
      "y": 120,
      "width": 260,
      "height": 166,
      "config": {
        "summary": "Brand and campaign brief"
      }
    }
  ],
  "edges": [
    {
      "id": "edge-context-1-copy-1",
      "source": "context-1",
      "target": "copy-1"
    }
  ],
  "summary": "Brief explanation of the workflow plan and what each node does"
}"""

_BRAINSTORM_NODE_CONFIG_HINTS = {
    'context': 'config.summary (string): 品牌/活动 brief',
    'copy': 'config.tone (string), config.platform (string), config.product_description (string)',
    'image': 'config.style_skill (string), config.aspect_ratio (string), config.prompt (string)',
    'image_prompt': 'config.style_skill (string), config.aspect_ratio (string), config.platform (string)',
    'image_generation': 'config.style_skill (string), config.aspect_ratio (string)',
    'storyboard': 'config.video_topic (string), config.duration (number), config.target_audience (string)',
    'video_generation': 'config.aspect_ratio (string), config.duration_cap (number), config.model (string)',
    'audio': 'config.text (string), config.voice_id (string), config.speed (number)',
    'retrieval': 'config.query (string)',
    'review': 'config.forbidden_words (string), config.channel_rules (string)',
    'custom_agent': 'config.name (string), config.icon (string), config.prompt (string), config.temperature (number 0-1)',
    'rag_search': 'config.query (string), config.scope (string)',
}


def build_brainstorm_messages(idea: str, brand_context_hint: dict[str, Any]) -> list[dict[str, str]]:
    from api.contracts import NODE_IO_SCHEMAS

    io_lines = []
    for node_type, schema in NODE_IO_SCHEMAS.items():
        inputs = ', '.join(f'{k}({v})' for k, v in schema.get('input', {}).items()) or 'none'
        outputs = ', '.join(f'{k}({v})' for k, v in schema.get('output', {}).items()) or 'none'
        config_hint = _BRAINSTORM_NODE_CONFIG_HINTS.get(node_type, 'config (object)')
        io_lines.append(f'  - {node_type}: inputs=[{inputs}] outputs=[{outputs}] {config_hint}')

    quality_bar = quality_bar_block((
        '工作流必须能直接运行，节点 config 要填入足够任务信息，不能只放空节点。',
        '至少包含 context 起点；需要发布内容时优先包含 copy；需要视觉时使用 image_prompt -> image_generation 或 image。',
        '高风险或对外发布内容应加入 review 节点。',
        '节点之间的数据流要合理：上游 brief/copy/storyboard/image_prompt 应连接到下游生成节点。',
        '节点数量保持克制，默认 3-7 个，除非用户需求明显复杂。',
    ))
    system_parts = [
        BRAINSTORM_SYSTEM_PROMPT,
        f'\nAvailable node types and their IO schemas:\n' + '\n'.join(io_lines),
        f'\n{quality_bar}',
        f'\n{json_contract_block(BRAINSTORM_JSON_SCHEMA_HINT)}',
    ]

    user_lines = [
        'Generate a marketing workflow for the following idea:',
        compact_text(idea, max_chars=3000),
    ]
    if brand_context_hint:
        user_lines.append(
            f'\nExisting brand context (use as hints, override if the idea suggests something different):\n'
            f'{json.dumps(brand_context_hint, ensure_ascii=False)}'
        )

    return [
        {'role': 'system', 'content': '\n'.join(system_parts)},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def _layout_brainstorm_nodes(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> None:
    """Reposition nodes in-place left-to-right using stable topological columns."""
    if len(nodes) <= 1:
        if nodes:
            nodes[0]['x'] = 80
            nodes[0]['y'] = 120
        return

    type_priority = {
        'context': 0,
        'retrieval': 1,
        'rag_search': 1,
        'copy': 2,
        'storyboard': 3,
        'image_prompt': 4,
        'image_generation': 5,
        'image': 5,
        'audio': 6,
        'video_generation': 7,
        'video': 7,
        'review': 8,
        'custom_agent': 9,
    }
    node_ids = [str(n['id']) for n in nodes if n.get('id')]
    node_id_set = set(node_ids)
    parents: dict[str, list[str]] = {nid: [] for nid in node_ids}
    children: dict[str, list[str]] = {nid: [] for nid in node_ids}
    for edge in edges:
        src, tgt = edge.get('source', ''), edge.get('target', '')
        if src in node_id_set and tgt in node_id_set and src != tgt:
            children[src].append(tgt)
            parents[tgt].append(src)

    node_map = {n['id']: n for n in nodes}
    order_index = {nid: idx for idx, nid in enumerate(node_ids)}
    column_memo: dict[str, int] = {}
    visiting: set[str] = set()

    def resolve_column(nid: str) -> int:
        if nid in column_memo:
            return column_memo[nid]
        if nid in visiting:
            return 0
        visiting.add(nid)
        parent_ids = parents.get(nid, [])
        column = 0 if not parent_ids else max(resolve_column(pid) for pid in parent_ids) + 1
        visiting.remove(nid)
        column_memo[nid] = column
        return column

    for node_id in node_ids:
        resolve_column(node_id)

    columns: dict[int, list[str]] = {}
    for node_id in node_ids:
        columns.setdefault(column_memo.get(node_id, 0), []).append(node_id)

    x_gap = 340
    y_gap = 260
    x_start = 80
    y_start = 96
    placed: dict[str, dict[str, Any]] = {}
    placed_nodes: list[dict[str, Any]] = []

    def intersects(a: dict[str, Any], b: dict[str, Any], gap: int = 48) -> bool:
        aw, ah = int(a.get('width') or 260), int(a.get('height') or 200)
        bw, bh = int(b.get('width') or 260), int(b.get('height') or 200)
        return not (
            a['x'] + aw + gap <= b['x']
            or b['x'] + bw + gap <= a['x']
            or a['y'] + ah + gap <= b['y']
            or b['y'] + bh + gap <= a['y']
        )

    for column in sorted(columns):
        column_nodes = sorted(
            columns[column],
            key=lambda nid: (
                sum((placed.get(pid, {}).get('y', 0) for pid in parents.get(nid, [])))
                / max(1, len(parents.get(nid, []))),
                type_priority.get(str(node_map[nid].get('type')), 20),
                order_index.get(nid, 0),
            ),
        )
        total_height = (len(column_nodes) - 1) * y_gap + 200
        y_base = max(y_start, y_start + round((200 * 3 - total_height) / 2)) if len(column_nodes) > 1 else y_start + y_gap

        for node_idx, nid in enumerate(column_nodes):
            node = node_map[nid]
            node['width'] = int(node.get('width') or 260)
            node['height'] = int(node.get('height') or 200)
            parent_ids = parents.get(nid, [])
            if parent_ids:
                parent_y = sum((placed.get(pid, {}).get('y', y_base) for pid in parent_ids)) / len(parent_ids)
                y = max(y_start, round(parent_y + (node_idx - (len(column_nodes) - 1) / 2) * y_gap))
            else:
                y = y_base + node_idx * y_gap
            node['x'] = x_start + column * x_gap
            node['y'] = y
            while any(intersects(node, other) for other in placed_nodes):
                node['y'] += y_gap
            placed[nid] = node
            placed_nodes.append(node)

    min_y = min((int(node.get('y') or y_start) for node in nodes), default=y_start)
    for node in nodes:
        node['y'] = int(node.get('y') or y_start) - min_y + y_start


def normalize_brainstorm_result(result: Any, idea: str) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {}
    if not isinstance(result, dict):
        result = {}

    from api.contracts import VALID_NODE_TYPES

    workflow_name = str(result.get('workflow_name') or idea[:40]).strip()
    summary = str(result.get('summary') or f'Workflow generated from: {idea[:80]}').strip()

    brand_context = result.get('brand_context')
    if not isinstance(brand_context, dict):
        brand_context = {}
    brand_context.setdefault('brand_name', idea.split()[0] if idea.split() else 'Brand')
    brand_context.setdefault('audience', 'General audience')
    brand_context.setdefault('tone', 'Professional')
    brand_context.setdefault('selling_points', idea[:100])
    brand_context.setdefault('visual_style', 'modern')
    brand_context.setdefault('campaign_goal', idea[:80])

    nodes = result.get('nodes')
    if not isinstance(nodes, list):
        nodes = []
    normalized_nodes: list[dict[str, Any]] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_type = str(node.get('type') or 'context').strip()
        if node_type not in VALID_NODE_TYPES:
            node_type = 'custom_agent'
        node_id = str(node.get('id') or f'{node_type}-{len(normalized_nodes) + 1}').strip()
        normalized_nodes.append({
            'id': node_id,
            'type': node_type,
            'label': str(node.get('label') or node_type.replace('_', ' ').title()).strip(),
            'x': 0, 'y': 0,
            'width': int(node.get('width') or 260),
            'height': int(node.get('height') or 166),
            'config': node.get('config') if isinstance(node.get('config'), dict) else {},
        })

    if not normalized_nodes:
        normalized_nodes = [
            {
                'id': 'context-1', 'type': 'context', 'label': 'Brand Context',
                'x': 0, 'y': 0, 'width': 260, 'height': 166,
                'config': {'summary': idea[:200]},
            },
            {
                'id': 'copy-1', 'type': 'copy', 'label': 'Marketing Copy',
                'x': 0, 'y': 0, 'width': 260, 'height': 166,
                'config': {'tone': brand_context.get('tone', 'Professional'), 'platform': 'Xiaohongshu'},
            },
        ]

    context_nodes = [n for n in normalized_nodes if n['type'] == 'context']
    if context_nodes and not context_nodes[0]['config'].get('summary'):
        context_nodes[0]['config']['summary'] = idea[:200]

    edges = result.get('edges')
    if not isinstance(edges, list):
        edges = []
    node_ids = {n['id'] for n in normalized_nodes}
    normalized_edges: list[dict[str, Any]] = []
    for edge in edges:
        if not isinstance(edge, dict):
            continue
        source = str(edge.get('source') or '').strip()
        target = str(edge.get('target') or '').strip()
        if source in node_ids and target in node_ids and source != target:
            edge_id = str(edge.get('id') or f'edge-{source}-{target}').strip()
            normalized_edges.append({'id': edge_id, 'source': source, 'target': target})

    if not normalized_edges and len(normalized_nodes) >= 2:
        for i in range(len(normalized_nodes) - 1):
            src = normalized_nodes[i]['id']
            tgt = normalized_nodes[i + 1]['id']
            normalized_edges.append({'id': f'edge-{src}-{tgt}', 'source': src, 'target': tgt})

    # Apply topological layer layout to avoid overlap
    _layout_brainstorm_nodes(normalized_nodes, normalized_edges)

    return {
        'workflow_name': workflow_name,
        'brand_context': brand_context,
        'nodes': normalized_nodes,
        'edges': normalized_edges,
        'summary': summary,
    }
