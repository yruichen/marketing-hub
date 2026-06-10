from typing import Any


PLAN_LIMITS = {
    'free': {
        'name': '免费版',
        'project_limit': 3,
        'storage_gb': 1,
        'advanced_agents': False,
        'byok_discount': '0%',
    },
    'pro': {
        'name': '高级版',
        'project_limit': 30,
        'storage_gb': 50,
        'advanced_agents': True,
        'byok_discount': '70%',
    },
    'enterprise': {
        'name': '企业版',
        'project_limit': 9999,
        'storage_gb': 500,
        'advanced_agents': True,
        'byok_discount': '100%',
    },
}

NODE_IO_SCHEMAS: dict[str, dict[str, dict[str, str]]] = {
    'context': {
        'input': {},
        'output': {'summary': 'String', 'brand_context': 'Object'},
    },
    'copy': {
        'input': {'product_description': 'String', 'tone': 'String', 'platform': 'String'},
        'output': {'title': 'String', 'paragraphs': 'String[]', 'tags': 'String[]', 'call_to_action': 'String'},
    },
    'image': {
        'input': {'prompt': 'String', 'style': 'String', 'aspect_ratio': 'String'},
        'output': {'image_url': 'URL', 'revised_prompt': 'String'},
    },
    'storyboard': {
        'input': {'video_topic': 'String', 'duration': 'Number', 'target_audience': 'String'},
        'output': {'scenes': 'Scene[]', 'total_duration_seconds': 'Number'},
    },
    'audio': {
        'input': {'text': 'String', 'voice_id': 'String', 'speed': 'Number'},
        'output': {'audio_url': 'URL', 'estimated_audio_duration_seconds': 'Number'},
    },
    'custom_agent': {
        'input': {'input': 'Any'},
        'output': {'response': 'String', 'metadata': 'Object'},
    },
    'rag_search': {
        'input': {'query': 'String', 'scope': 'String'},
        'output': {'references': 'Reference[]', 'insights': 'String[]', 'brand_memory': 'Object'},
    },
    'image_prompt': {
        'input': {'title': 'String', 'body': 'String', 'brand_summary': 'String'},
        'output': {'prompt': 'String', 'negative_prompt': 'String', 'aspect_ratio': 'String', 'style': 'String'},
    },
    'image_generation': {
        'input': {'prompt': 'String', 'negative_prompt': 'String', 'aspect_ratio': 'String', 'style': 'String'},
        'output': {'image_asset': 'Asset', 'image_url': 'URL', 'revised_prompt': 'String'},
    },
    'video_generation': {
        'input': {'scenes': 'Scene[]', 'audio_url': 'URL', 'video_topic': 'String'},
        'output': {'video_asset': 'Asset', 'video_url': 'URL', 'thumbnail_url': 'URL', 'duration_seconds': 'Number'},
    },
    'retrieval': {
        'input': {'query': 'String', 'scope': 'String'},
        'output': {'references': 'Reference[]', 'insights': 'String[]', 'brand_memory': 'Object'},
    },
    'review': {
        'input': {'title': 'String', 'body': 'String', 'tags': 'String[]'},
        'output': {'sensitive_word_issues': 'Issue[]', 'brand_consistency': 'Score', 'channel_rules': 'Issue[]'},
    },
}

NODE_TYPE_ALIASES: dict[str, str] = {
    'image_prompt': 'copy',
    'image_generation': 'image',
    'video_generation': 'video',
    'retrieval': 'rag_search',
    'review': 'copy',
}


def normalize_schema(schema: Any, fallback: dict[str, str]) -> dict[str, str]:
    return schema if isinstance(schema, dict) and schema else fallback


VALID_NODE_TYPES = set(NODE_IO_SCHEMAS.keys())


def validate_workflow_graph(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[str]:
    """Validate workflow node/edge structure. Returns list of error messages (empty if valid)."""
    errors: list[str] = []
    if not isinstance(nodes, list):
        return ['nodes must be a list']
    if not isinstance(edges, list):
        return ['edges must be a list']

    node_ids: set[str] = set()
    for i, node in enumerate(nodes):
        if not isinstance(node, dict):
            errors.append(f'nodes[{i}] must be an object')
            continue
        nid = str(node.get('id', ''))
        ntype = node.get('type', '')
        if not nid:
            errors.append(f'nodes[{i}] missing required "id" field')
        elif nid in node_ids:
            errors.append(f'duplicate node id: {nid}')
        else:
            node_ids.add(nid)
        if not ntype:
            errors.append(f'nodes[{i}] (id={nid}) missing required "type" field')
        elif ntype not in VALID_NODE_TYPES:
            errors.append(f'nodes[{i}] (id={nid}) has invalid type "{ntype}"')

    for i, edge in enumerate(edges):
        if not isinstance(edge, dict):
            errors.append(f'edges[{i}] must be an object')
            continue
        source = str(edge.get('source', ''))
        target = str(edge.get('target', ''))
        if not source or not target:
            errors.append(f'edges[{i}] missing source or target')
            continue
        if source not in node_ids:
            errors.append(f'edges[{i}] references non-existent source node "{source}"')
        if target not in node_ids:
            errors.append(f'edges[{i}] references non-existent target node "{target}"')
        if source == target:
            errors.append(f'edges[{i}] is a self-loop on node "{source}"')

    return errors

