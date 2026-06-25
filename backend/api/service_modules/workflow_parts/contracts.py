from __future__ import annotations

from typing import Any

from api.contracts import NODE_IO_SCHEMAS, normalize_schema
from api.models import Campaign, Project, WorkspaceDraft

def node_io_schema(node: dict[str, Any]) -> dict[str, dict[str, str]]:
    config = node.get('config') if isinstance(node.get('config'), dict) else {}
    base = NODE_IO_SCHEMAS.get(str(node.get('type')), NODE_IO_SCHEMAS['custom_agent'])
    return {
        'input': normalize_schema(node.get('input_schema') or config.get('input_schema'), base['input']),
        'output': normalize_schema(node.get('output_schema') or config.get('output_schema'), base['output']),
    }


def validate_workflow_contract(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    node_by_id = {str(node.get('id')): node for node in nodes if node.get('id')}
    for edge in edges:
        source = str(edge.get('source', ''))
        target = str(edge.get('target', ''))
        if source not in node_by_id or target not in node_by_id:
            warnings.append(f'连接 {source}->{target} 指向不存在的节点。')
            continue
        source_schema = node_io_schema(node_by_id[source])['output']
        target_schema = node_io_schema(node_by_id[target])['input']
        if not source_schema or not target_schema:
            continue
        source_types = set(source_schema.values())
        target_types = set(target_schema.values())
        compatible = bool(source_types.intersection(target_types)) or 'Any' in source_types or 'Any' in target_types
        if not compatible:
            warnings.append(
                f'{node_by_id[source].get("label", source)} 的输出类型 {sorted(source_types)} '
                f'与 {node_by_id[target].get("label", target)} 的输入类型 {sorted(target_types)} 不匹配。'
            )
    return warnings

def get_or_create_default_draft(project: Project, campaign: Campaign | None = None) -> WorkspaceDraft:
    default_nodes = [
        {
            'id': 'brand-brief',
            'type': 'context',
            'label': '品牌卖点提炼',
            'x': 80,
            'y': 120,
            'width': 240,
            'height': 132,
            'status': 'idle',
            'config': {
                'summary': project.brief or '整理品牌定位、卖点和受众特征。',
            },
            'input_schema': NODE_IO_SCHEMAS['context']['input'],
            'output_schema': NODE_IO_SCHEMAS['context']['output'],
            'output': {},
        },
        {
            'id': 'copy-agent',
            'type': 'copy',
            'label': '小红书文案专家',
            'x': 360,
            'y': 90,
            'width': 240,
            'height': 132,
            'status': 'idle',
            'config': {
                'tone': '爆款活泼',
                'platform': 'Xiaohongshu',
            },
            'input_schema': NODE_IO_SCHEMAS['copy']['input'],
            'output_schema': NODE_IO_SCHEMAS['copy']['output'],
            'output': {},
        },
        {
            'id': 'image-agent',
            'type': 'image',
            'label': '配图生成器',
            'x': 650,
            'y': 190,
            'width': 240,
            'height': 132,
            'status': 'idle',
            'config': {
                'style': 'minimalist',
                'aspect_ratio': '1:1',
            },
            'input_schema': NODE_IO_SCHEMAS['image']['input'],
            'output_schema': NODE_IO_SCHEMAS['image']['output'],
            'output': {},
        },
    ]
    default_edges = [
        {'id': 'edge-brand-copy', 'source': 'brand-brief', 'target': 'copy-agent'},
        {'id': 'edge-copy-image', 'source': 'copy-agent', 'target': 'image-agent'},
    ]
    draft, created = WorkspaceDraft.objects.get_or_create(
        project=project,
        campaign=campaign,
        name='Default Workflow',
        defaults={
            'organization': project.organization,
            'brand_context': project.brand_context,
            'nodes': default_nodes,
            'edges': default_edges,
            'viewport': {'x': 0, 'y': 0, 'zoom': 1},
        },
    )
    if not created and not draft.brand_context and project.brand_context:
        draft.brand_context = project.brand_context
        draft.save(update_fields=['brand_context', 'updated_at'])
    return draft
