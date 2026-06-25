from __future__ import annotations

import json
import re
from typing import Any


COPY_SYSTEM_PROMPT = (
    '你是一位专精中国社交媒体营销的资深文案策划。'
    '根据品牌、产品、语气与目标平台生成高转化营销文案。'
    '只输出合法 JSON，不要用 markdown 代码块包裹。'
    '正文以中文为主；标签与 emoji 按平台习惯使用。'
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
    'xiaohongshu': (
        '小红书风格：口语化种草语气，emoji 适度，短句分段，标签 4-8 个带 #，'
        '首句强钩子，避免硬广感，强调真实体验与使用场景。'
    ),
    '小红书': (
        '小红书风格：口语化种草语气，emoji 适度，短句分段，标签 4-8 个带 #，'
        '首句强钩子，避免硬广感，强调真实体验与使用场景。'
    ),
    'wechat': (
        '微信公众号风格：信息密度高、段落结构清晰，语气可信克制，'
        '少用感叹号，适合深度阅读，CTA 引导关注或点击阅读原文。'
    ),
    '微信': (
        '微信公众号风格：信息密度高、段落结构清晰，语气可信克制，'
        '少用感叹号，适合深度阅读，CTA 引导关注或点击阅读原文。'
    ),
    'douyin': (
        '抖音短视频文案风格：前 3 秒强钩子，口语化可念读，节奏短促，'
        '适合字幕与口播，结尾明确行动号召。'
    ),
    '抖音': (
        '抖音短视频文案风格：前 3 秒强钩子，口语化可念读，节奏短促，'
        '适合字幕与口播，结尾明确行动号召。'
    ),
}

PLATFORM_FEW_SHOT = {
    'xiaohongshu': '范例标题：「这支精华真的把熬夜脸救回来了✨」；正文短句+emoji；标签如 #护肤 #好物分享',
    '小红书': '范例标题：「这支精华真的把熬夜脸救回来了✨」；正文短句+emoji；标签如 #护肤 #好物分享',
    'wechat': '范例标题：「为什么越来越多品牌选择 AI 内容工作流」；正文分 3-4 段论述价值',
    '微信': '范例标题：「为什么越来越多品牌选择 AI 内容工作流」；正文分 3-4 段论述价值',
    'douyin': '范例钩子：「还在一条一条写脚本？这个工具 10 分钟搞定全平台内容」',
    '抖音': '范例钩子：「还在一条一条写脚本？这个工具 10 分钟搞定全平台内容」',
}


def _platform_hint(platform: str) -> str:
    key = (platform or '').strip().lower()
    guidance = PLATFORM_GUIDANCE.get(key) or PLATFORM_GUIDANCE.get(platform or '')
    few_shot = PLATFORM_FEW_SHOT.get(key) or PLATFORM_FEW_SHOT.get(platform or '')
    if guidance and few_shot:
        return f'{guidance} {few_shot}'
    if guidance:
        return guidance
    return f'按 {platform or "通用社交媒体"} 的内容习惯适配语气、结构与标签。'


def build_copy_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    brand_name = str(payload.get('brand_name') or 'Marketing Hub').strip()
    product_description = str(payload.get('product_description') or '').strip()
    tone = str(payload.get('tone') or '爆款活泼').strip()
    platform = str(payload.get('platform') or 'Xiaohongshu').strip()
    feedback = str(payload.get('feedback') or '').strip()
    workflow_context = payload.get('workflow_context')

    user_lines = [
        '请根据以下输入生成营销文案：',
        f'- 品牌/产品名：{brand_name}',
        f'- 产品描述：{product_description or "未指定"}',
        f'- 语气风格：{tone}',
        f'- 目标平台：{platform}',
        f'- 平台写作要求：{_platform_hint(platform)}',
        f'- 输出 JSON 结构：\n{COPY_JSON_SCHEMA_HINT}',
    ]
    if workflow_context:
        user_lines.append(f'- 工作流/品牌上下文：{workflow_context}')
    if feedback:
        user_lines.append(f'- 修改意见（必须严格执行）：{feedback}')

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
    '你是一位专精短视频营销的导演与分镜策划。'
    '按场景输出视觉描述与旁白脚本，适配抖音/小红书等竖屏传播节奏。'
    '只输出合法 JSON，不要用 markdown 代码块包裹。'
    'visual_description 用中文描述镜头；audio_narration 为可念读的口播文案。'
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
        '请根据以下输入生成分镜脚本：',
        f'- 视频主题：{video_topic}',
        f'- 目标总时长：{duration} 秒',
        f'- 目标受众：{target_audience}',
        '- 场景数量：3 到 6 个，逻辑连贯。',
        f'- 各场景 duration_seconds 之和必须等于 {duration} 秒。',
        f'- 输出 JSON 结构：\n{STORYBOARD_JSON_SCHEMA_HINT}',
    ]
    if platform:
        user_lines.insert(5, f'- 发布平台：{platform}（请适配该平台的内容节奏与镜头风格）')
    if workflow_context:
        user_lines.append(f'- 工作流/品牌上下文：{workflow_context}')
    if feedback:
        user_lines.append(f'- 修改意见（必须严格执行）：{feedback}')

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
    from api.image_style_skills import resolve_style_skill

    user_prompt = str(payload.get('prompt') or '').strip()
    style_skill = payload.get('style_skill')
    legacy_style = payload.get('style')
    style = resolve_style_skill(style_skill, legacy_style) if (style_skill or legacy_style) else ''
    aspect_ratio = str(payload.get('aspect_ratio') or payload.get('aspectRatio') or '1:1').strip()
    platform = str(payload.get('platform') or '').strip()
    negative_prompt = str(payload.get('negative_prompt') or '').strip()

    parts: list[str] = []
    if user_prompt:
        parts.append(user_prompt)
    if style:
        parts.append(f'视觉风格：{style}')
    if platform:
        parts.append(f'适配 {platform} 社交媒体营销主视觉')
    parts.append('高清细节，专业构图，主体清晰，光影自然，无文字水印，无畸形肢体')
    parts.append(f'画幅比例：{aspect_ratio}')
    if negative_prompt:
        parts.append(f'避免：{negative_prompt}')
    return '。'.join(part for part in parts if part)


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


IMAGE_PROMPT_SYSTEM_PROMPT = (
    '你是一位 AI 绘画提示词工程师，专精中国社交媒体营销视觉。'
    '根据品牌信息、内容主题与风格 Skill，生成可直接用于文生图模型的详细 prompt。'
    'prompt 字段用英文撰写（模型友好），同时提供 prompt_zh 中文摘要。'
    '只输出合法 JSON，不要用 markdown 代码块包裹。'
)

IMAGE_PROMPT_JSON_SCHEMA_HINT = """{
  "prompt": "Detailed English prompt for text-to-image model: subject, scene, lighting, composition, style",
  "prompt_zh": "中文摘要，便于运营理解画面意图",
  "negative_prompt": "Elements to avoid, comma-separated",
  "composition_notes": "Brief notes on framing and aspect ratio usage"
}"""


def build_image_prompt_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    subject = str(payload.get('subject') or payload.get('product_description') or '').strip()
    brand_name = str(payload.get('brand_name') or 'Marketing-Hub').strip()
    style_text = str(payload.get('style') or '').strip()
    style_skill_id = str(payload.get('style_skill') or '').strip()
    aspect_ratio = str(payload.get('aspect_ratio') or '1:1').strip()
    platform = str(payload.get('platform') or '小红书').strip()
    negative_prompt = str(payload.get('negative_prompt') or '').strip()
    upstream_text = str(payload.get('upstream_text') or '').strip()
    feedback = str(payload.get('feedback') or '').strip()
    workflow_context = payload.get('workflow_context')

    user_lines = [
        '请为以下营销场景生成文生图 prompt：',
        f'- 品牌：{brand_name}',
        f'- 画面主题/产品描述：{subject or upstream_text or "未指定"}',
        f'- 风格 Skill：{style_text or "默认编辑风"}',
    ]
    if style_skill_id:
        user_lines.append(f'- 风格 Skill ID：{style_skill_id}')
    user_lines.extend([
        f'- 目标画幅：{aspect_ratio}',
        f'- 发布平台：{platform}',
        f'- 输出 JSON 结构：\n{IMAGE_PROMPT_JSON_SCHEMA_HINT}',
    ])
    if upstream_text and upstream_text != subject:
        user_lines.append(f'- 上游节点内容参考：\n{upstream_text[:2000]}')
    if negative_prompt:
        user_lines.append(f'- 必须排除的元素：{negative_prompt}')
    if workflow_context:
        user_lines.append(f'- 工作流/品牌上下文：{workflow_context}')
    if feedback:
        user_lines.append(f'- 修改意见（必须严格执行）：{feedback}')

    return [
        {'role': 'system', 'content': IMAGE_PROMPT_SYSTEM_PROMPT},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def normalize_image_prompt_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {'prompt': result}
    if not isinstance(result, dict):
        result = {}

    style_skill = str(payload.get('style_skill') or '').strip()
    style_text = str(payload.get('style') or result.get('style') or '').strip()
    aspect_ratio = str(payload.get('aspect_ratio') or result.get('aspect_ratio') or '1:1').strip()
    negative_prompt = str(
        result.get('negative_prompt') or payload.get('negative_prompt') or ''
    ).strip()
    prompt = str(result.get('prompt') or '').strip()
    prompt_zh = str(result.get('prompt_zh') or '').strip()

    if not prompt:
        subject = str(payload.get('subject') or payload.get('upstream_text') or 'marketing visual').strip()
        prompt = f'{subject}, {style_text}, aspect ratio {aspect_ratio}, professional marketing photography'

    return {
        'prompt': prompt,
        'prompt_zh': prompt_zh,
        'negative_prompt': negative_prompt,
        'aspect_ratio': aspect_ratio,
        'style_skill': style_skill,
        'style': style_text,
        'composition_notes': str(result.get('composition_notes') or '').strip(),
    }


REVIEW_SYSTEM_PROMPT = (
    '你是一位营销内容合规与品牌一致性审核专家。'
    '审查给定内容的违禁词、品牌调性、平台规则符合度。'
    '只输出合法 JSON，不要用 markdown 代码块包裹。'
    'issues 需具体指出问题片段与修改建议。'
)

REVIEW_JSON_SCHEMA_HINT = """{
  "passed": true,
  "brand_consistency_score": 85,
  "sensitive_word_issues": [
    {"word": "问题词", "context": "出现上下文", "suggestion": "修改建议"}
  ],
  "channel_rule_issues": [
    {"rule": "违反的规则", "context": "出现上下文", "suggestion": "修改建议"}
  ],
  "summary": "整体审核结论与优先修改项",
  "revised_suggestions": ["建议修改 1", "建议修改 2"]
}"""


def build_review_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    title = str(payload.get('content_title') or payload.get('title') or '').strip()
    body = str(payload.get('content_body') or payload.get('product_description') or '').strip()
    tags = payload.get('tags') or []
    forbidden_words = str(payload.get('forbidden_words') or '').strip()
    channel_rules = str(payload.get('channel_rules') or '').strip()
    platform = str(payload.get('platform') or '小红书').strip()
    feedback = str(payload.get('feedback') or '').strip()
    workflow_context = payload.get('workflow_context')

    tag_text = ', '.join(str(t) for t in tags) if isinstance(tags, list) else str(tags)
    user_lines = [
        '请审核以下营销内容：',
        f'- 标题：{title or "（无标题）"}',
        f'- 正文：\n{body or "（无正文）"}',
        f'- 标签：{tag_text or "（无）"}',
        f'- 目标平台：{platform}',
        f'- 禁用词列表：{forbidden_words or "（未指定，按广告法与平台规范检查）"}',
        f'- 频道/渠道规则：{channel_rules or "（未指定，按平台通用规范检查）"}',
        f'- 输出 JSON 结构：\n{REVIEW_JSON_SCHEMA_HINT}',
    ]
    if workflow_context:
        user_lines.append(f'- 品牌上下文：{workflow_context}')
    if feedback:
        user_lines.append(f'- 额外审核要求：{feedback}')

    return [
        {'role': 'system', 'content': REVIEW_SYSTEM_PROMPT},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def _coerce_sensitive_issues(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    issues: list[dict[str, str]] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            issues.append({'word': item.strip(), 'context': '', 'suggestion': '请替换或删除'})
        elif isinstance(item, dict):
            issues.append({
                'word': str(item.get('word') or '').strip(),
                'context': str(item.get('context') or '').strip(),
                'suggestion': str(item.get('suggestion') or '请替换或删除').strip(),
            })
    return [i for i in issues if i.get('word')]


def _coerce_channel_issues(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    issues: list[dict[str, str]] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            issues.append({'rule': item.strip(), 'context': '', 'suggestion': '请按平台规范修改'})
        elif isinstance(item, dict):
            issues.append({
                'rule': str(item.get('rule') or '').strip(),
                'context': str(item.get('context') or '').strip(),
                'suggestion': str(item.get('suggestion') or '请按平台规范修改').strip(),
            })
    return [i for i in issues if i.get('rule')]


def normalize_review_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {'summary': result}
    if not isinstance(result, dict):
        result = {}

    sensitive = result.get('sensitive_word_issues') or []
    channel = result.get('channel_rule_issues') or []

    score = result.get('brand_consistency_score') or result.get('brand_consistency')
    try:
        brand_score = int(score) if score is not None else 80
    except (TypeError, ValueError):
        brand_score = 80

    passed = result.get('passed')
    if passed is None:
        passed = brand_score >= 70 and not sensitive

    return {
        'passed': bool(passed),
        'brand_consistency_score': max(0, min(100, brand_score)),
        'sensitive_word_issues': _coerce_sensitive_issues(sensitive),
        'channel_rule_issues': _coerce_channel_issues(channel),
        'summary': str(result.get('summary') or '审核完成').strip(),
        'revised_suggestions': [
            str(s).strip() for s in (result.get('revised_suggestions') or []) if str(s).strip()
        ],
    }


AUDIO_SYSTEM_PROMPT = (
    '你是一位中文营销配音导演。'
    '根据给定文本与音色设定，输出适合 TTS 朗读的优化脚本及元数据。'
    '只输出合法 JSON，不要用 markdown 代码块包裹。'
    'optimized_text 应口语化、停顿自然、适合口播。'
)

AUDIO_JSON_SCHEMA_HINT = """{
  "optimized_text": "优化后的配音脚本",
  "voice_direction": "语气与节奏指导",
  "estimated_duration_seconds": 15,
  "pause_markers": ["停顿位置说明"]
}"""


def build_audio_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    text = str(payload.get('text') or '').strip()
    voice_id = str(payload.get('voice_id') or 'female_warm').strip()
    try:
        speed = float(payload.get('speed') or 1.0)
    except (TypeError, ValueError):
        speed = 1.0
    feedback = str(payload.get('feedback') or '').strip()
    workflow_context = payload.get('workflow_context')

    user_lines = [
        '请优化以下配音脚本：',
        f'- 原始文本：\n{text or "（空）"}',
        f'- 音色 ID：{voice_id}',
        f'- 语速倍率：{speed}',
        f'- 输出 JSON 结构：\n{AUDIO_JSON_SCHEMA_HINT}',
    ]
    if workflow_context:
        user_lines.append(f'- 品牌上下文：{workflow_context}')
    if feedback:
        user_lines.append(f'- 修改意见：{feedback}')

    return [
        {'role': 'system', 'content': AUDIO_SYSTEM_PROMPT},
        {'role': 'user', 'content': '\n'.join(user_lines)},
    ]


def normalize_audio_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if isinstance(result, str):
        try:
            result = json.loads(_strip_json_fence(result))
        except json.JSONDecodeError:
            result = {'optimized_text': result}
    if not isinstance(result, dict):
        result = {}

    original_text = str(payload.get('text') or '').strip()
    optimized = str(result.get('optimized_text') or original_text).strip()
    voice_id = str(payload.get('voice_id') or result.get('voice_id') or 'female_warm').strip()
    try:
        speed = float(payload.get('speed') or result.get('speed') or 1.0)
    except (TypeError, ValueError):
        speed = 1.0

    try:
        duration = int(result.get('estimated_duration_seconds') or max(5, len(optimized) // 4))
    except (TypeError, ValueError):
        duration = max(5, len(optimized) // 4)

    audio_url = str(result.get('audio_url') or '').strip()
    if not audio_url:
        audio_url = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'

    return {
        'text': optimized,
        'original_text': original_text,
        'voice_id': voice_id,
        'speed': speed,
        'voice_direction': str(result.get('voice_direction') or '').strip(),
        'audio_url': audio_url,
        'text_length': len(optimized),
        'estimated_audio_duration_seconds': duration,
    }


MOCK_VIDEO_URL = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4'
MOCK_VIDEO_THUMBNAIL = 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?auto=format&fit=crop&w=640&q=80'
AGNES_VIDEO_ALLOWED_FRAMES = (81, 121, 161, 241, 441)
AGNES_VIDEO_DEFAULT_FRAME_RATE = 24


def snap_agnes_num_frames(target_seconds: int, frame_rate: int = AGNES_VIDEO_DEFAULT_FRAME_RATE) -> int:
    """Agnes Video v2.0 requires num_frames = 8n+1, max 441."""
    try:
        seconds = max(1, int(target_seconds))
    except (TypeError, ValueError):
        seconds = 5
    target_frames = seconds * max(1, int(frame_rate))
    for value in AGNES_VIDEO_ALLOWED_FRAMES:
        if value >= target_frames:
            return value
    return AGNES_VIDEO_ALLOWED_FRAMES[-1]


def aspect_ratio_to_video_dimensions(aspect_ratio: str) -> tuple[int, int]:
    """Map aspect ratio to Agnes `(width, height)` pixel dimensions."""
    ratio = (aspect_ratio or '9:16').strip()
    mapping = {
        '16:9': (1152, 648),
        '9:16': (768, 1365),
        '1:1': (1024, 1024),
        '4:5': (896, 1120),
        '4:3': (1152, 864),
        '3:4': (864, 1152),
    }
    return mapping.get(ratio, mapping['9:16'])


def build_video_generation_prompt(payload: dict[str, Any]) -> str:
    """
    Build an Agnes-friendly cinematic prompt.
    See: https://agnes-ai.com/doc/agnes-video-v20
    """
    explicit = str(payload.get('prompt') or payload.get('expanded_prompt') or '').strip()
    if explicit:
        return explicit

    video_topic = str(payload.get('video_topic') or '').strip()
    scenes = payload.get('scenes') or []
    parts: list[str] = []

    if video_topic:
        parts.append(f"Marketing video about {video_topic}.")

    if isinstance(scenes, list):
        for index, scene in enumerate(scenes[:8], 1):
            if not isinstance(scene, dict):
                continue
            visual = str(scene.get('visual_description') or scene.get('visual') or scene.get('description') or '').strip()
            narration = str(scene.get('audio_narration') or scene.get('voiceover') or scene.get('narration') or '').strip()
            if visual:
                parts.append(f"Shot {index}: {visual}")
            if narration:
                parts.append(f"Voiceover cue: {narration}")

    workflow_context = str(payload.get('workflow_context') or '').strip()
    if workflow_context and len(workflow_context) < 400:
        parts.append(f"Brand context: {workflow_context}")

    feedback = str(payload.get('feedback') or '').strip()
    if feedback:
        parts.append(f"Revision notes: {feedback}")

    if not parts:
        return (
            '电影感品牌营销短片：清晰主体、平滑运镜、专业布光、'
            '浅景深、高细节、广告级构图，无文字叠加，无水印。'
        )

    return (
        ' '.join(parts)
        + ' 电影级构图，自然流畅运镜，专业布光，浅景深，高细节，'
        '营销广告质感，无文字叠加，无水印。'
    ).strip()


def extract_agnes_video_url(body: Any) -> str:
    if not isinstance(body, dict):
        return ''
    for key in ('video_url', 'remixed_from_video_id', 'url', 'output_url', 'download_url'):
        value = body.get(key)
        if isinstance(value, str) and value.strip().startswith('http'):
            return value.strip()
    nested = body.get('data') or body.get('result') or body.get('output')
    if isinstance(nested, dict):
        return extract_agnes_video_url(nested)
    return ''


def normalize_video_result(result: Any, payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(result, dict):
        result = {}

    scenes = payload.get('scenes') or result.get('scenes') or []
    if not isinstance(scenes, list):
        scenes = []

    try:
        duration = int(payload.get('duration') or result.get('duration_seconds') or 30)
    except (TypeError, ValueError):
        duration = 30

    video_topic = str(payload.get('video_topic') or result.get('video_topic') or 'Marketing video').strip()
    aspect_ratio = str(payload.get('aspect_ratio') or result.get('aspect_ratio') or '9:16').strip()
    video_url = extract_agnes_video_url(result) or str(result.get('video_url') or result.get('url') or MOCK_VIDEO_URL).strip()
    thumbnail_url = str(result.get('thumbnail_url') or result.get('poster_url') or MOCK_VIDEO_THUMBNAIL).strip()
    frame_rate = int(result.get('frame_rate') or payload.get('frame_rate') or AGNES_VIDEO_DEFAULT_FRAME_RATE)
    num_frames = int(result.get('num_frames') or payload.get('num_frames') or snap_agnes_num_frames(duration, frame_rate))
    duration_seconds = int(result.get('duration_seconds') or max(1, round(num_frames / max(frame_rate, 1))))

    is_demo_fallback = video_url == MOCK_VIDEO_URL and not str(result.get('id') or result.get('task_id') or '').strip()

    return {
        'video_topic': video_topic,
        'aspect_ratio': aspect_ratio,
        'video_url': video_url,
        'thumbnail_url': thumbnail_url,
        'duration_seconds': duration_seconds,
        'num_frames': num_frames,
        'frame_rate': frame_rate,
        'scenes_count': len(scenes),
        'has_audio': bool(str(payload.get('audio_url') or '').strip()),
        'model': str(payload.get('model') or result.get('model') or 'agnes-video-v2.0'),
        'provider_task_id': str(result.get('id') or result.get('task_id') or ''),
        'is_demo_fallback': is_demo_fallback,
    }


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


BRAINSTORM_SYSTEM_PROMPT = (
    '你是营销工作流架构师 AI。'
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
    '只输出合法 JSON，不要用 markdown 代码块包裹。'
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
