from __future__ import annotations

from typing import Any

from ai_gateway.services import AIModelGateway, GatewayResponse


REWRITE_FEEDBACK: dict[str, str] = {
    'short': '整体压缩为更适合移动端快速阅读的表达。',
    'conflict': '开头加入更明确的问题冲突，但避免制造焦虑。',
    'professional': '表达更专业克制，减少口语和感叹。',
    'young': '语气更轻快，保留品牌可信度。',
    'calm': '减少夸张表达，改为事实和场景描述。',
}


def _first_channel(payload: dict[str, Any]) -> str:
    channels = payload.get('channels') or []
    if isinstance(channels, list) and channels:
        return str(channels[0]).strip()
    return str(payload.get('platform') or '小红书').strip()


def _workflow_context(payload: dict[str, Any]) -> str:
    parts: list[str] = []
    mapping = {
        'use_case': 'Use case',
        'industry': 'Industry',
        'audience': 'Audience',
        'forbidden_words': 'Forbidden words',
        'reference_links': 'Reference links',
        'template': 'Template',
    }
    for key, label in mapping.items():
        value = str(payload.get(key) or '').strip()
        if value:
            parts.append(f'{label}: {value}')
    return '; '.join(parts)


def _build_image_prompt(payload: dict[str, Any], *, platform: str, brand_name: str) -> str:
    use_case = str(payload.get('use_case') or '营销').strip()
    audience = str(payload.get('audience') or '目标用户').strip()
    tone = str(payload.get('tone') or '清晰专业').strip()
    brief = str(payload.get('brief') or '').strip()
    aspect = str(payload.get('aspect_ratio') or '4:5').strip()
    detail = brief[:120] if brief else f'{brand_name} 核心卖点场景'
    return (
        f'{brand_name} 的{use_case}营销主视觉，渠道为{platform}，目标人群是{audience}，'
        f'风格{tone}，画面需体现：{detail}，包含清晰产品场景和品牌规范，{aspect}'
    )


def _build_review_advice(payload: dict[str, Any], *, platform: str) -> list[str]:
    advice = [
        '检查是否符合品牌语调和禁用词要求',
        f'确认{platform}首屏标题长度和标签数量',
        '保存人工修改，作为本项目下次生成偏好',
    ]
    forbidden = str(payload.get('forbidden_words') or '').strip()
    if forbidden:
        advice.insert(0, f'避免使用禁用表达：{forbidden}')
    return advice


def _storyboard_lines(storyboard: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    for scene in storyboard.get('scenes') or []:
        if not isinstance(scene, dict):
            continue
        number = scene.get('scene_number') or len(lines) + 1
        visual = str(scene.get('visual_description') or '').strip()
        audio = str(scene.get('audio_narration') or '').strip()
        if visual and audio:
            lines.append(f'镜头 {number}：{visual}（旁白：{audio}）')
        elif visual:
            lines.append(f'镜头 {number}：{visual}')
        elif audio:
            lines.append(f'镜头 {number}：{audio}')
    return lines


def _voiceover_text(storyboard: dict[str, Any], copy_result: dict[str, Any]) -> str:
    narrations = [
        str(scene.get('audio_narration') or '').strip()
        for scene in (storyboard.get('scenes') or [])
        if isinstance(scene, dict) and str(scene.get('audio_narration') or '').strip()
    ]
    if narrations:
        return ' '.join(narrations)
    paragraphs = copy_result.get('paragraphs') or []
    if paragraphs:
        return ' '.join(str(item).strip() for item in paragraphs if str(item).strip())
    return str(copy_result.get('call_to_action') or '').strip()


def assemble_content_package(
    copy_result: dict[str, Any],
    storyboard_result: dict[str, Any],
    payload: dict[str, Any],
    *,
    version: str = 'AI 初稿',
) -> dict[str, Any]:
    platform = str(copy_result.get('platform') or _first_channel(payload)).strip()
    brand_name = str(payload.get('brand_name') or copy_result.get('title') or '品牌').strip()
    paragraphs = copy_result.get('paragraphs') or []
    body = '\n\n'.join(str(item).strip() for item in paragraphs if str(item).strip())
    if not body:
        body = str(copy_result.get('title') or payload.get('brief') or '').strip()

    storyboard_lines = _storyboard_lines(storyboard_result)
    if not storyboard_lines:
        storyboard_lines = [
            f'镜头 1：展示{brand_name}所处使用场景，点出用户真实问题。',
            f'镜头 2：用 2-3 个画面说明核心卖点与差异化理由。',
            '镜头 3：给出行动建议，引导收藏、咨询或进入活动页面。',
        ]

    tags = copy_result.get('tags') or []
    if not isinstance(tags, list):
        tags = []

    return {
        'platform': platform,
        'title': str(copy_result.get('title') or f'{brand_name}｜{payload.get("use_case") or "内容"}内容包').strip(),
        'body': body,
        'tags': [str(tag).strip() for tag in tags if str(tag).strip()],
        'imagePrompt': _build_image_prompt(payload, platform=platform, brand_name=brand_name),
        'storyboard': storyboard_lines,
        'voiceover': _voiceover_text(storyboard_result, copy_result),
        'reviewAdvice': _build_review_advice(payload, platform=platform),
        'exportFormats': ['Markdown', 'Docx', 'CSV'],
        'version': version,
    }


def generate_content_package(
    *,
    organization,
    role: str | None,
    payload: dict[str, Any],
) -> tuple[dict[str, Any], list[str], GatewayResponse, GatewayResponse]:
    platform = _first_channel(payload)
    brand_name = str(payload.get('brand_name') or 'Marketing Hub').strip()
    brief = str(payload.get('brief') or payload.get('product_description') or '').strip()
    tone = str(payload.get('tone') or '爆款活泼').strip()
    audience = str(payload.get('audience') or '目标用户').strip()
    workflow_context = _workflow_context(payload)

    rewrite_mode = str(payload.get('rewrite_mode') or '').strip()
    feedback = str(payload.get('feedback') or REWRITE_FEEDBACK.get(rewrite_mode, '')).strip()
    version = '用户修改稿' if rewrite_mode or feedback else 'AI 初稿'

    copy_gateway = AIModelGateway.execute(
        organization=organization,
        role=role,
        task_type='copy',
        payload={
            'brand_name': brand_name,
            'product_description': brief or f'{brand_name} 营销内容',
            'tone': tone,
            'platform': platform,
            'workflow_context': workflow_context,
            'feedback': feedback,
        },
        prompt_key='marketing.copy.system',
    )

    storyboard_gateway = AIModelGateway.execute(
        organization=organization,
        role=role,
        task_type='storyboard',
        payload={
            'video_topic': brief or brand_name,
            'duration': int(payload.get('duration') or 30),
            'target_audience': audience,
            'platform': platform,
            'workflow_context': workflow_context,
        },
        prompt_key='marketing.storyboard.system',
    )

    package = assemble_content_package(
        copy_gateway.payload,
        storyboard_gateway.payload,
        payload,
        version=version,
    )
    logs = [
        'content_package:orchestration=copy+storyboard',
        *copy_gateway.logs,
        *storyboard_gateway.logs,
    ]
    return package, logs, copy_gateway, storyboard_gateway
