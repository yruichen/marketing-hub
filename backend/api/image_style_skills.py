from __future__ import annotations

IMAGE_STYLE_SKILLS: dict[str, dict[str, str]] = {
    'editorial_magazine': {
        'label': '杂志编辑风',
        'skill': '高端编辑类摄影，自然侧光，留白克制，纸质质感，低饱和大地色系，适合品牌故事与生活方式内容',
    },
    'xiaohongshu_lifestyle': {
        'label': '小红书种草',
        'skill': '明亮通透的桌面场景，俯拍或 45 度角，精致道具点缀，柔和自然光，清爽配色，突出产品使用情境与种草氛围',
    },
    'product_studio': {
        'label': '产品棚拍',
        'skill': '纯色或渐变背景的产品棚拍，主体清晰锐利，受控柔光，轻微反射与阴影，突出材质细节与包装',
    },
    'minimal_flat': {
        'label': '极简扁平',
        'skill': '极简构图，大面积留白，几何块面与干净线条，低对比配色，无杂乱元素，适合 SaaS 与科技品牌',
    },
    'cinematic_film': {
        'label': '电影质感',
        'skill': '宽画幅电影感构图，层次化景深，冷暖对比光影，轻微颗粒质感，情绪氛围强，适合短视频封面与品牌短片',
    },
    'illustration_hand': {
        'label': '手绘插画',
        'skill': '手绘插画或水彩质感，柔和笔触，温暖配色，适度夸张造型，适合年轻化传播与创意 campaign',
    },
    'corporate_b2b': {
        'label': '企业商务',
        'skill': '专业商务场景，会议室或办公环境，真实人物协作画面，稳重蓝灰色调，传达可信与效率',
    },
    'cyber_neon': {
        'label': '赛博霓虹',
        'skill': '霓虹灯与深色背景，高对比紫蓝品红点缀，未来科技感，适合游戏、AI、潮流数码主题',
    },
}

DEFAULT_IMAGE_STYLE_SKILL_ID = 'editorial_magazine'


def resolve_style_skill(style_skill_id: str | None, legacy_style: str | None = None) -> str:
    skill_id = (style_skill_id or '').strip() or DEFAULT_IMAGE_STYLE_SKILL_ID
    entry = IMAGE_STYLE_SKILLS.get(skill_id)
    if entry:
        return entry['skill']
    if legacy_style and str(legacy_style).strip():
        return str(legacy_style).strip()
    return IMAGE_STYLE_SKILLS[DEFAULT_IMAGE_STYLE_SKILL_ID]['skill']


def list_image_style_skills() -> list[dict[str, str]]:
    return [
        {'id': skill_id, 'label': entry['label'], 'skill': entry['skill']}
        for skill_id, entry in IMAGE_STYLE_SKILLS.items()
    ]
