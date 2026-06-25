from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


PromptKind = Literal['system_prompt', 'generation_prompt', 'style_skill', 'workflow_skill']
PromptRisk = Literal['low', 'medium', 'high']


@dataclass(frozen=True, slots=True)
class PromptAsset:
    key: str
    version: str
    kind: PromptKind
    owner: str
    task_type: str
    title: str
    description: str
    output_contract: str
    quality_bar: tuple[str, ...]
    risk: PromptRisk = 'medium'
    template: str = ''


PROMPT_ASSETS: dict[str, PromptAsset] = {
    'marketing.copy.system': PromptAsset(
        key='marketing.copy.system',
        version='2026-06-25.v1',
        kind='system_prompt',
        owner='content-generation',
        task_type='copy',
        title='营销文案生成',
        description='根据品牌、产品、渠道和语气生成结构化社媒营销文案。',
        output_contract='title, paragraphs[], tags[], call_to_action, platform, tone',
        quality_bar=(
            '首句必须承担明确钩子或场景进入',
            '正文必须围绕用户场景、差异化卖点和行动转化组织',
            '标签必须符合目标平台习惯，不输出空泛标签',
            '不得编造品牌资质、疗效、价格、销量等未提供事实',
        ),
        risk='medium',
        template='营销文案生成',
    ),
    'marketing.storyboard.system': PromptAsset(
        key='marketing.storyboard.system',
        version='2026-06-25.v1',
        kind='system_prompt',
        owner='content-generation',
        task_type='storyboard',
        title='短视频分镜策划',
        description='把营销主题拆成可拍摄、可配音、可执行的短视频分镜。',
        output_contract='video_topic, total_duration_seconds, target_audience, scenes[]',
        quality_bar=(
            '每个镜头必须包含画面动作和可念读旁白',
            '总时长必须与各场景时长一致',
            '开头 3 秒必须给出明确注意力钩子',
            '结尾必须包含品牌或行动承接',
        ),
        risk='medium',
        template='短视频分镜策划',
    ),
    'marketing.image.system': PromptAsset(
        key='marketing.image.system',
        version='2026-06-25.v1',
        kind='generation_prompt',
        owner='content-generation',
        task_type='image',
        title='营销配图生成',
        description='把用户主题、画幅和视觉 Skill 合成为图像模型可执行 prompt。',
        output_contract='prompt, style, aspect_ratio, image_url, revised_prompt, generated_images',
        quality_bar=(
            '主体、场景、光线、构图和限制项必须明确',
            '必须遵守画幅比例和平台使用场景',
            '避免文字水印、畸形肢体、低质构图等常见生成缺陷',
        ),
        risk='medium',
        template='营销配图生成',
    ),
    'marketing.image_prompt.system': PromptAsset(
        key='marketing.image_prompt.system',
        version='2026-06-25.v1',
        kind='system_prompt',
        owner='content-generation',
        task_type='image_prompt',
        title='文生图提示词工程',
        description='生成英文图像 prompt、中文摘要、负面词和构图说明。',
        output_contract='prompt, prompt_zh, negative_prompt, composition_notes',
        quality_bar=(
            '英文 prompt 必须对主体、环境、镜头、光线、风格和质量约束有清晰描述',
            '中文摘要必须便于运营理解画面意图',
            '负面词必须包含用户显式排除项',
        ),
        risk='medium',
        template='文生图提示词工程',
    ),
    'marketing.review.system': PromptAsset(
        key='marketing.review.system',
        version='2026-06-25.v1',
        kind='system_prompt',
        owner='content-generation',
        task_type='review',
        title='内容合规审核',
        description='检查违禁词、品牌一致性、平台规则和修改建议。',
        output_contract='passed, brand_consistency_score, sensitive_word_issues[], channel_rule_issues[], summary, revised_suggestions[]',
        quality_bar=(
            '问题必须定位到具体片段或规则',
            '建议必须可执行，不能只说“优化一下”',
            '不得把未配置的平台规则当成确定事实',
        ),
        risk='high',
        template='内容合规审核',
    ),
    'marketing.audio.system': PromptAsset(
        key='marketing.audio.system',
        version='2026-06-25.v1',
        kind='system_prompt',
        owner='content-generation',
        task_type='audio',
        title='配音脚本优化',
        description='把文本整理成更适合 TTS 朗读的口播脚本和声音指导。',
        output_contract='optimized_text, voice_direction, estimated_duration_seconds, pause_markers[]',
        quality_bar=(
            '脚本必须自然可念读，避免书面腔和长句堆叠',
            '声音指导必须包含语气、速度和停顿建议',
            '不得改变原文核心事实和品牌承诺',
        ),
        risk='low',
        template='配音脚本优化',
    ),
    'marketing.video.system': PromptAsset(
        key='marketing.video.system',
        version='2026-06-25.v1',
        kind='generation_prompt',
        owner='content-generation',
        task_type='video',
        title='营销视频生成',
        description='把视频主题、分镜、音频和画幅转成视频模型 prompt。',
        output_contract='video_topic, aspect_ratio, video_url, thumbnail_url, duration_seconds',
        quality_bar=(
            '必须把分镜动作转成连续可执行的视频描述',
            '必须保留画幅、时长、参考图和音频限制',
            '避免文字叠加、水印和不可控品牌标识',
        ),
        risk='medium',
        template='营销视频生成',
    ),
    'marketing.custom_agent.system': PromptAsset(
        key='marketing.custom_agent.system',
        version='2026-06-25.v1',
        kind='workflow_skill',
        owner='workflow',
        task_type='custom_agent',
        title='自定义营销智能体',
        description='根据用户定义的 agent 任务和上游上下文输出结构化结果。',
        output_contract='response, metadata',
        quality_bar=(
            '必须严格遵循用户自定义任务边界',
            '必须使用上游节点信息，不能忽略工作流上下文',
            '输出必须保持 JSON 可解析',
        ),
        risk='high',
        template='自定义营销智能体',
    ),
    'marketing.brainstorm.system': PromptAsset(
        key='marketing.brainstorm.system',
        version='2026-06-25.v1',
        kind='workflow_skill',
        owner='workflow',
        task_type='brainstorm',
        title='工作流灵感风暴',
        description='把用户创意转成品牌上下文和可运行 DAG 工作流。',
        output_contract='workflow_name, brand_context, nodes[], edges[], summary',
        quality_bar=(
            '必须生成无环 DAG，节点类型必须来自系统支持列表',
            '必须推断品牌上下文并写入节点配置',
            '坐标只作为参考，最终布局由系统 layout helper 处理',
        ),
        risk='high',
        template='工作流灵感风暴',
    ),
}


def get_prompt_asset(key: str) -> PromptAsset | None:
    return PROMPT_ASSETS.get(key)


def prompt_registry_snapshot() -> dict[str, dict[str, object]]:
    return {
        key: {
            'version': asset.version,
            'kind': asset.kind,
            'owner': asset.owner,
            'task_type': asset.task_type,
            'title': asset.title,
            'description': asset.description,
            'output_contract': asset.output_contract,
            'quality_bar': list(asset.quality_bar),
            'risk': asset.risk,
            'template': asset.template,
        }
        for key, asset in PROMPT_ASSETS.items()
    }
