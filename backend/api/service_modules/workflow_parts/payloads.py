from __future__ import annotations

import json
from typing import Any

from api.image_style_skills import DEFAULT_IMAGE_STYLE_SKILL_ID, resolve_style_skill
from harness.graph import direct_upstream_outputs, ordered_nodes

def workflow_execution_order(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return ordered_nodes(nodes, edges)


def upstream_outputs(node_id: str, nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return direct_upstream_outputs(node_id, nodes, edges)


def extract_upstream_text(upstream: list[dict[str, Any]], max_chars: int = 2000) -> str:
    """Extract meaningful text from upstream node outputs instead of dumping raw JSON."""
    parts: list[str] = []
    for output in upstream:
        if not isinstance(output, dict):
            continue
        for key in ('summary', 'title', 'response', 'paragraphs', 'text', 'query', 'prompt', 'video_topic'):
            val = output.get(key)
            if not val:
                continue
            if isinstance(val, list):
                parts.append('\n'.join(str(item) for item in val))
            else:
                parts.append(str(val))
    text = '\n'.join(parts)
    return text[:max_chars] if text else ''


def _merge_upstream_video_params(upstream: list[dict[str, Any]]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for item in upstream:
        if not isinstance(item, dict):
            continue
        for key in ('scenes', 'video_topic', 'total_duration_seconds', 'audio_url', 'duration_seconds', 'image_url'):
            value = item.get(key)
            if value not in (None, '', []):
                merged[key] = value
        shots = item.get('shots')
        if shots and not merged.get('scenes'):
            merged['scenes'] = shots
    return merged


def _merge_upstream_image_params(upstream: list[dict[str, Any]]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for item in upstream:
        if not isinstance(item, dict):
            continue
        for key in ('prompt', 'negative_prompt', 'aspect_ratio', 'style', 'style_skill'):
            value = item.get(key)
            if value not in (None, '', []):
                merged[key] = value
    return merged


def _compose_image_prompt_text(
    config: dict[str, Any],
    *,
    upstream_text: str,
    brand_context: dict[str, Any],
    task_data: dict[str, Any] | None = None,
) -> str:
    skill_text = resolve_style_skill(config.get('style_skill'), config.get('style'))
    manual_prompt = str(config.get('prompt') or '').strip()
    ai_text = ''
    if task_data:
        if task_data.get('prompt'):
            ai_text = str(task_data.get('prompt')).strip()
        else:
            paragraphs = task_data.get('paragraphs') or []
            if isinstance(paragraphs, list) and paragraphs:
                ai_text = '\n'.join(str(item).strip() for item in paragraphs if str(item).strip())
            elif task_data.get('title'):
                ai_text = str(task_data.get('title')).strip()
    base = manual_prompt or ai_text or upstream_text or str(brand_context.get('selling_points') or '').strip()
    parts = [part for part in (skill_text, base) if part]
    return '\n'.join(parts)


def _reshape_image_prompt_output(
    config: dict[str, Any],
    task_data: dict[str, Any],
    *,
    upstream_text: str,
    brand_context: dict[str, Any],
) -> dict[str, Any]:
    style_skill_id = str(
        config.get('style_skill') or task_data.get('style_skill') or DEFAULT_IMAGE_STYLE_SKILL_ID
    ).strip()
    style_text = resolve_style_skill(style_skill_id, config.get('style'))
    aspect_ratio = str(config.get('aspect_ratio') or task_data.get('aspect_ratio') or '1:1').strip()
    negative_prompt = str(config.get('negative_prompt') or task_data.get('negative_prompt') or '').strip()

    prompt = str(task_data.get('prompt') or '').strip()
    if not prompt:
        prompt = _compose_image_prompt_text(
            config,
            upstream_text=upstream_text,
            brand_context=brand_context,
            task_data=task_data,
        )
    manual_prompt = str(config.get('prompt') or '').strip()
    if manual_prompt and manual_prompt not in prompt:
        prompt = f'{manual_prompt}\n{prompt}'

    return {
        'prompt': prompt,
        'prompt_zh': str(task_data.get('prompt_zh') or '').strip(),
        'negative_prompt': negative_prompt,
        'aspect_ratio': aspect_ratio,
        'style_skill': style_skill_id,
        'style': style_text,
        'composition_notes': str(task_data.get('composition_notes') or '').strip(),
    }


def build_payload_for_node(
    node: dict[str, Any],
    *,
    brand_context: dict[str, Any],
    upstream: list[dict[str, Any]],
    feedback: str = '',
) -> dict[str, Any]:
    config = node.get('config') if isinstance(node.get('config'), dict) else {}
    context_text = json.dumps(brand_context, ensure_ascii=False)
    upstream_text = extract_upstream_text(upstream)
    feedback_text = f'\nRevision feedback: {feedback}' if feedback else ''
    node_type = node.get('type')

    if node_type == 'copy':
        return {
            'brand_name': config.get('brand_name') or brand_context.get('brand_name') or '',
            'product_description': config.get('product_description') or upstream_text or brand_context.get('selling_points') or '',
            'tone': config.get('tone') or brand_context.get('tone') or 'clear and specific',
            'platform': config.get('platform') or 'general',
            'workflow_context': context_text,
            'feedback': feedback,
        }
    if node_type == 'image':
        merged = _merge_upstream_image_params(upstream)
        prompt = str(merged.get('prompt') or config.get('prompt') or upstream_text or '').strip()
        if not prompt:
            prompt = str(brand_context.get('visual_style') or '').strip()
        style_skill_id = merged.get('style_skill') or config.get('style_skill') or DEFAULT_IMAGE_STYLE_SKILL_ID
        style = resolve_style_skill(style_skill_id, merged.get('style') or config.get('style') or brand_context.get('visual_style'))
        aspect_ratio = str(merged.get('aspect_ratio') or config.get('aspect_ratio') or '1:1').strip()
        negative_prompt = str(merged.get('negative_prompt') or '').strip()
        if negative_prompt:
            prompt = f'{prompt}\nExclude: {negative_prompt}'
        return {
            'prompt': f'{prompt}{feedback_text}',
            'style': style,
            'style_skill': style_skill_id,
            'aspect_ratio': aspect_ratio,
            'workflow_context': context_text,
        }
    if node_type == 'storyboard':
        try:
            duration = int(str(config.get('duration', 30)).strip())
        except (ValueError, TypeError):
            duration = 30
        return {
            'video_topic': config.get('video_topic') or upstream_text or brand_context.get('campaign_goal') or '',
            'duration': duration,
            'target_audience': config.get('target_audience') or brand_context.get('audience') or 'general audience',
            'workflow_context': context_text,
            'feedback': feedback,
        }
    if node_type == 'audio':
        text = config.get('text') or ''
        if not text and upstream:
            text = upstream_text[:2000]
        return {
            'text': f'{text}{feedback_text}',
            'voice_id': config.get('voice_id') or 'female_warm',
            'speed': float(config.get('speed') or 1.0),
            'workflow_context': context_text,
        }
    if node_type == 'rag_search':
        return {
            'query': config.get('query') or upstream_text or '',
        }
    if node_type == 'retrieval':
        return {
            'query': config.get('query') or upstream_text or '',
        }
    if node_type == 'image_prompt':
        skill_id = config.get('style_skill') or DEFAULT_IMAGE_STYLE_SKILL_ID
        skill_text = resolve_style_skill(skill_id, config.get('style'))
        manual_prompt = str(config.get('prompt') or '').strip()
        subject = manual_prompt or upstream_text or brand_context.get('selling_points') or ''
        negative_prompt = str(config.get('negative_prompt') or '').strip()
        extra_feedback = feedback
        if negative_prompt:
            extra_feedback = f'{feedback}\nNegative prompt: {negative_prompt}'.strip()
        return {
            'brand_name': brand_context.get('brand_name') or '',
            'subject': subject,
            'style': skill_text,
            'style_skill': skill_id,
            'aspect_ratio': str(config.get('aspect_ratio') or '1:1').strip(),
            'platform': str(config.get('platform') or 'general').strip(),
            'negative_prompt': negative_prompt,
            'upstream_text': upstream_text,
            'workflow_context': context_text,
            'feedback': extra_feedback,
        }
    if node_type == 'image_generation':
        merged = _merge_upstream_image_params(upstream)
        prompt = str(merged.get('prompt') or upstream_text or '').strip()
        if not prompt:
            prompt = str(brand_context.get('visual_style') or '').strip()
        style_skill_id = merged.get('style_skill') or config.get('style_skill') or DEFAULT_IMAGE_STYLE_SKILL_ID
        style = resolve_style_skill(style_skill_id, merged.get('style') or brand_context.get('visual_style'))
        aspect_ratio = str(merged.get('aspect_ratio') or '1:1').strip()
        negative_prompt = str(merged.get('negative_prompt') or '').strip()
        if negative_prompt:
            prompt = f'{prompt}\nExclude: {negative_prompt}'
        return {
            'prompt': f'{prompt}{feedback_text}',
            'style': style,
            'style_skill': style_skill_id,
            'aspect_ratio': aspect_ratio,
            'workflow_context': context_text,
        }
    if node_type == 'video_generation':
        merged = _merge_upstream_video_params(upstream)
        scenes = merged.get('scenes') or []
        if not isinstance(scenes, list):
            scenes = []
        try:
            duration = int(str(config.get('duration_cap') or merged.get('total_duration_seconds') or 30).strip())
        except (ValueError, TypeError):
            duration = 30
        image_url = str(merged.get('image_url') or config.get('image_url') or '').strip()
        return {
            'video_topic': config.get('video_topic') or merged.get('video_topic') or upstream_text or brand_context.get('campaign_goal') or '',
            'scenes': scenes,
            'audio_url': str(merged.get('audio_url') or ''),
            'image_url': image_url,
            'aspect_ratio': str(config.get('aspect_ratio') or '9:16').strip(),
            'duration': duration,
            'model': config.get('model') or 'agnes-video-v2.0',
            'workflow_context': context_text,
            'feedback': feedback,
        }
    if node_type == 'review':
        upstream_title = ''
        upstream_tags: list[str] = []
        for item in upstream:
            if isinstance(item, dict):
                if item.get('title'):
                    upstream_title = str(item.get('title'))
                if isinstance(item.get('tags'), list):
                    upstream_tags = [str(t) for t in item.get('tags')]
        return {
            'content_title': upstream_title,
            'content_body': upstream_text or '',
            'tags': upstream_tags,
            'forbidden_words': str(config.get('forbidden_words') or '').strip(),
            'channel_rules': str(config.get('channel_rules') or '').strip(),
            'platform': str(config.get('platform') or brand_context.get('platform') or 'general').strip(),
            'workflow_context': context_text,
            'feedback': feedback,
        }
    if node_type == 'custom_agent':
        return {
            'name': config.get('name') or node.get('label') or 'Custom agent',
            'icon': config.get('icon') or 'Sparkles',
            'prompt': config.get('prompt') or '',
            'temperature': float(config.get('temperature') or 0.7),
            'workflow_context': context_text,
            'upstream': upstream,
            'upstream_text': upstream_text,
            'brand_context': context_text,
            'feedback': feedback,
        }
    return {
        'context': context_text,
        'upstream': upstream,
        'config': config,
        'feedback': feedback,
    }
