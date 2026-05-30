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
}


def normalize_schema(schema: Any, fallback: dict[str, str]) -> dict[str, str]:
    return schema if isinstance(schema, dict) and schema else fallback

