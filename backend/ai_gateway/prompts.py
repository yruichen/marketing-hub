from __future__ import annotations

import json
import re
from typing import Any


COPY_SYSTEM_PROMPT = (
    'You are a professional marketing copywriting AI. '
    'Generate high-converting social media copy that matches the target platform and tone. '
    'Respond ONLY with valid JSON. Do not wrap the JSON in markdown code fences.'
)

COPY_JSON_SCHEMA_HINT = """{
  "title": "Catchy headline with emojis when appropriate for the platform",
  "paragraphs": [
    "Paragraph 1: engaging hook",
    "Paragraph 2: key value propositions",
    "Paragraph 3: transition toward action"
  ],
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "call_to_action": "Clear call to action"
}"""

PLATFORM_GUIDANCE = {
    'xiaohongshu': 'Use Xiaohongshu style: conversational, emoji-friendly, short punchy lines, hashtag-friendly tags.',
    '小红书': 'Use Xiaohongshu style: conversational, emoji-friendly, short punchy lines, hashtag-friendly tags.',
    'wechat': 'Use WeChat article style: informative, structured paragraphs, trustworthy tone.',
    '微信': 'Use WeChat article style: informative, structured paragraphs, trustworthy tone.',
    'douyin': 'Use Douyin short-video caption style: hook-first, spoken rhythm, strong CTA.',
    '抖音': 'Use Douyin short-video caption style: hook-first, spoken rhythm, strong CTA.',
}


def _platform_hint(platform: str) -> str:
    key = (platform or '').strip().lower()
    return PLATFORM_GUIDANCE.get(key, f'Adapt copy conventions for platform: {platform or "general social media"}.')


def build_copy_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    brand_name = str(payload.get('brand_name') or 'Marketing Hub').strip()
    product_description = str(payload.get('product_description') or '').strip()
    tone = str(payload.get('tone') or '爆款活泼').strip()
    platform = str(payload.get('platform') or 'Xiaohongshu').strip()
    feedback = str(payload.get('feedback') or '').strip()
    workflow_context = payload.get('workflow_context')

    user_lines = [
        'Generate marketing copy with the following inputs:',
        f'- Brand / product name: {brand_name}',
        f'- Product description: {product_description or "Not specified"}',
        f'- Tone: {tone}',
        f'- Target platform: {platform}',
        f'- Platform guidance: {_platform_hint(platform)}',
        f'- Required JSON schema:\n{COPY_JSON_SCHEMA_HINT}',
    ]
    if workflow_context:
        user_lines.append(f'- Workflow / brand context: {workflow_context}')
    if feedback:
        user_lines.append(f'- Revision feedback (apply strictly): {feedback}')

    return [
        {'role': 'system', 'content': COPY_SYSTEM_PROMPT},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def _strip_json_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\s*```$', '', cleaned)
    return cleaned.strip()


def _coerce_paragraphs(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [part.strip() for part in value.split('\n') if part.strip()]
    return []


def _coerce_tags(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip().lstrip('#') for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [part.strip().lstrip('#') for part in re.split(r'[,，\s]+', value) if part.strip()]
    return []


def normalize_copy_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {'title': payload.get('brand_name', 'Generated Copy'), 'paragraphs': [result], 'tags': [], 'call_to_action': ''}
    if not isinstance(result, dict):
        result = {}

    brand_name = str(payload.get('brand_name') or 'Marketing Hub').strip()
    tone = str(payload.get('tone') or '爆款活泼').strip()
    platform = str(payload.get('platform') or 'Xiaohongshu').strip()

    paragraphs = _coerce_paragraphs(result.get('paragraphs') or result.get('body') or result.get('content'))
    if not paragraphs and result.get('title'):
        paragraphs = [str(result.get('title'))]

    title = str(result.get('title') or brand_name).strip() or brand_name
    tags = _coerce_tags(result.get('tags'))
    call_to_action = str(result.get('call_to_action') or result.get('cta') or '').strip()

    if not paragraphs:
        paragraphs = [
            str(product) if (product := payload.get('product_description')) else f'{brand_name} marketing copy draft.',
        ]
    if not tags:
        tags = [platform.replace(' ', ''), tone.replace(' ', ''), brand_name.replace(' ', '')][:4]
    if not call_to_action:
        call_to_action = f'了解更多关于 {brand_name} 的信息。'

    return {
        'title': title,
        'paragraphs': paragraphs,
        'tags': tags,
        'call_to_action': call_to_action,
        'platform': platform,
        'tone': tone,
    }


STORYBOARD_SYSTEM_PROMPT = (
    'You are a professional short-video director and storyboard AI. '
    'Design a compelling scene-by-scene script with visual direction and voiceover narration. '
    'Respond ONLY with valid JSON. Do not wrap the JSON in markdown code fences.'
)

STORYBOARD_JSON_SCHEMA_HINT = """{
  "video_topic": "The video topic or campaign focus",
  "total_duration_seconds": 30,
  "target_audience": "Target audience description",
  "scenes": [
    {
      "scene_number": 1,
      "visual_description": "Detailed visual: shot type, subject, lighting, mood",
      "audio_narration": "Voiceover or narration script read aloud in this scene",
      "duration_seconds": 10
    }
  ]
}"""


def build_storyboard_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    video_topic = str(payload.get('video_topic') or 'Marketing video').strip()
    duration = int(payload.get('duration') or payload.get('total_duration_seconds') or 30)
    target_audience = str(payload.get('target_audience') or 'General audience').strip()
    feedback = str(payload.get('feedback') or '').strip()
    workflow_context = payload.get('workflow_context')
    platform = str(payload.get('platform') or '').strip()

    user_lines = [
        'Generate a storyboard script with the following inputs:',
        f'- Video topic / focus: {video_topic}',
        f'- Target total duration: {duration} seconds',
        f'- Target audience: {target_audience}',
        '- Create between 3 and 6 logical scenes.',
        f'- Ensure scene duration_seconds values sum to exactly {duration} seconds.',
        f'- Required JSON schema:\n{STORYBOARD_JSON_SCHEMA_HINT}',
    ]
    if platform:
        user_lines.insert(4, f'- Distribution platform: {platform} (adapt pacing and style accordingly)')
    if workflow_context:
        user_lines.append(f'- Workflow / brand context: {workflow_context}')
    if feedback:
        user_lines.append(f'- Revision feedback (apply strictly): {feedback}')

    return [
        {'role': 'system', 'content': STORYBOARD_SYSTEM_PROMPT},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def _coerce_scenes(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    scenes: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            continue
        scene_number = int(item.get('scene_number') or index + 1)
        visual = str(item.get('visual_description') or item.get('visual') or '').strip()
        audio = str(item.get('audio_narration') or item.get('narration') or item.get('audio') or '').strip()
        duration = int(item.get('duration_seconds') or item.get('duration') or 0)
        if visual or audio:
            scenes.append({
                'scene_number': scene_number,
                'visual_description': visual or f'Scene {scene_number} visual.',
                'audio_narration': audio or f'Scene {scene_number} narration.',
                'duration_seconds': max(duration, 1),
            })
    return sorted(scenes, key=lambda scene: scene['scene_number'])


def _balance_scene_durations(scenes: list[dict[str, Any]], total_duration: int) -> list[dict[str, Any]]:
    if not scenes:
        return scenes
    total_duration = max(total_duration, len(scenes))
    current = sum(scene['duration_seconds'] for scene in scenes)
    if current == total_duration:
        return scenes
    if current <= 0:
        per_scene = max(1, total_duration // len(scenes))
        for scene in scenes:
            scene['duration_seconds'] = per_scene
        scenes[-1]['duration_seconds'] += total_duration - sum(scene['duration_seconds'] for scene in scenes)
        return scenes
    scale = total_duration / current
    adjusted = []
    for scene in scenes:
        adjusted.append({**scene, 'duration_seconds': max(1, round(scene['duration_seconds'] * scale))})
    delta = total_duration - sum(scene['duration_seconds'] for scene in adjusted)
    adjusted[-1]['duration_seconds'] = max(1, adjusted[-1]['duration_seconds'] + delta)
    return adjusted


def _fallback_storyboard_scenes(video_topic: str, duration: int, target_audience: str) -> list[dict[str, Any]]:
    num_scenes = max(3, min(6, duration // 7 or 3))
    scene_duration = max(1, duration // num_scenes)
    templates = [
        (
            f"Opening shot establishing the theme: {video_topic}.",
            f"Have you ever struggled to create content about {video_topic}?",
        ),
        (
            f"Medium shot showing the core problem for {target_audience}.",
            f"We know what resonates with {target_audience} — authenticity, not hard selling.",
        ),
        (
            'Close-up detail shot highlighting the product or key message.',
            'Here is the turning point — a clear, memorable value proposition.',
        ),
        (
            'Dynamic montage: workflow, results, and social proof in quick cuts.',
            'See how everything comes together in one smooth creative flow.',
        ),
        (
            'Calm hero shot: satisfied creator or customer in a warm setting.',
            'That is the feeling we want viewers to remember.',
        ),
        (
            'Brand end card with logo and call to action on screen.',
            'Start your next video with confidence. Take action today.',
        ),
    ]
    scenes = []
    for index in range(num_scenes):
        visual, audio = templates[index % len(templates)]
        scenes.append({
            'scene_number': index + 1,
            'visual_description': visual,
            'audio_narration': audio,
            'duration_seconds': scene_duration,
        })
    return _balance_scene_durations(scenes, duration)


def normalize_storyboard_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {}
    if not isinstance(result, dict):
        result = {}

    video_topic = str(result.get('video_topic') or payload.get('video_topic') or 'Marketing video').strip()
    target_audience = str(result.get('target_audience') or payload.get('target_audience') or 'General audience').strip()
    total_duration = int(
        result.get('total_duration_seconds')
        or payload.get('duration')
        or payload.get('total_duration_seconds')
        or 30
    )

    scenes = _coerce_scenes(result.get('scenes'))
    if not scenes:
        scenes = _fallback_storyboard_scenes(video_topic, total_duration, target_audience)
    else:
        for index, scene in enumerate(scenes, start=1):
            scene['scene_number'] = index
        scenes = _balance_scene_durations(scenes, total_duration)

    return {
        'video_topic': video_topic,
        'total_duration_seconds': total_duration,
        'target_audience': target_audience,
        'scenes': scenes,
    }


ASPECT_RATIO_SIZE_MAP = {
    '1:1': '1024x1024',
    '4:5': '768x1024',
    '9:16': '768x1024',
    '16:9': '1024x768',
    '3:4': '768x1024',
    '4:3': '1024x768',
}


def aspect_ratio_to_size(aspect_ratio: str) -> str:
    key = (aspect_ratio or '1:1').strip()
    return ASPECT_RATIO_SIZE_MAP.get(key, '1024x1024')


def build_image_generation_prompt(payload: dict[str, Any]) -> str:
    user_prompt = str(payload.get('prompt') or '').strip()
    style = str(payload.get('style') or '').strip()
    aspect_ratio = str(payload.get('aspect_ratio') or payload.get('aspectRatio') or '1:1').strip()
    platform = str(payload.get('platform') or '').strip()

    parts: list[str] = []
    if user_prompt:
        parts.append(user_prompt)
    if style:
        parts.append(f'Artistic style: {style}')
    if platform:
        parts.append(f'Optimized for {platform} social media marketing visual')
    parts.append(
        '[Main subject] + [Scene / background] + [Style] + [Lighting] + [Composition] + [High quality, sharp details]'
    )
    parts.append(f'Composition aspect ratio: {aspect_ratio}')
    return '. '.join(part for part in parts if part)


def normalize_image_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        result = {}

    aspect_ratio = str(
        payload.get('aspect_ratio') or payload.get('aspectRatio') or result.get('aspect_ratio') or '1:1'
    ).strip()
    prompt = str(payload.get('prompt') or result.get('prompt') or '').strip()
    style = str(payload.get('style') or result.get('style') or '').strip()
    revised_prompt = str(result.get('revised_prompt') or build_image_generation_prompt(payload)).strip()
    image_url = str(result.get('image_url') or result.get('url') or '').strip()

    if not image_url and isinstance(result.get('data'), list) and result['data']:
        first = result['data'][0]
        if isinstance(first, dict):
            image_url = str(first.get('url') or '').strip()

    return {
        'prompt': prompt,
        'style': style,
        'aspect_ratio': aspect_ratio,
        'aspectRatio': aspect_ratio,
        'image_url': image_url,
        'revised_prompt': revised_prompt,
        'generated_images': int(result.get('generated_images') or (1 if image_url else 0)),
    }


CUSTOM_AGENT_SYSTEM_PROMPT = (
    'You are a customizable marketing AI agent. '
    'Execute the user-defined task using the provided context and upstream data. '
    'Respond ONLY with valid JSON. Do not wrap the JSON in markdown code fences.'
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


BRAINSTORM_SYSTEM_PROMPT = (
    'You are a marketing workflow architect AI. '
    'Given a creative marketing idea from the user, you design a complete marketing workflow '
    'consisting of interconnected AI processing nodes that form a DAG (directed acyclic graph). '
    'Analyze the idea to infer brand context (brand name, audience, tone, selling points, visual style, campaign goal). '
    'Choose appropriate node types based on the idea:\n'
    '- "context" for brand/audience setup (always include at least one as the starting node)\n'
    '- "copy" for text/social media/marketing copy generation\n'
    '- "image" for visual/image generation\n'
    '- "image_prompt" for crafting image prompts from text\n'
    '- "image_generation" for actual image creation\n'
    '- "storyboard" for video storyboard/scene planning\n'
    '- "audio" for voiceover/audio generation\n'
    '- "retrieval" for research and reference gathering\n'
    '- "review" for content review and compliance checking\n'
    '- "custom_agent" for specialized custom tasks\n'
    '- "rag_search" for semantic retrieval\n'
    'Position nodes horizontally with 300px spacing (x starts at 80, y around 120). '
    'Each node must have width=260, height=166. '
    'Create edges that form a valid DAG with no cycles. '
    'Set sensible default config values for each node based on the inferred brand context. '
    'Respond ONLY with valid JSON matching the required schema. '
    'Do not wrap the JSON in markdown code fences.'
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
    'context': 'config.summary (string): brand/campaign brief',
    'copy': 'config.tone (string), config.platform (string), config.product_description (string)',
    'image': 'config.style (string), config.aspect_ratio (string, e.g. "1:1"), config.prompt (string)',
    'image_prompt': 'config.tone (string), config.platform (string)',
    'image_generation': 'config.style (string), config.aspect_ratio (string)',
    'storyboard': 'config.video_topic (string), config.duration (number, seconds), config.target_audience (string)',
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

    system_parts = [
        BRAINSTORM_SYSTEM_PROMPT,
        f'\nAvailable node types and their IO schemas:\n' + '\n'.join(io_lines),
        f'\nRequired JSON output schema:\n{BRAINSTORM_JSON_SCHEMA_HINT}',
    ]

    user_lines = [
        'Generate a marketing workflow for the following idea:',
        idea,
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
            'x': int(node.get('x') or 80 + len(normalized_nodes) * 300),
            'y': int(node.get('y') or 120),
            'width': int(node.get('width') or 260),
            'height': int(node.get('height') or 166),
            'config': node.get('config') if isinstance(node.get('config'), dict) else {},
        })

    if not normalized_nodes:
        normalized_nodes = [
            {
                'id': 'context-1', 'type': 'context', 'label': 'Brand Context',
                'x': 80, 'y': 120, 'width': 260, 'height': 166,
                'config': {'summary': idea[:200]},
            },
            {
                'id': 'copy-1', 'type': 'copy', 'label': 'Marketing Copy',
                'x': 380, 'y': 120, 'width': 260, 'height': 166,
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

    return {
        'workflow_name': workflow_name,
        'brand_context': brand_context,
        'nodes': normalized_nodes,
        'edges': normalized_edges,
        'summary': summary,
    }
