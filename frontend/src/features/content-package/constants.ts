import type { ContentPackage } from '../generation/types';

export const defaultContentPackage: ContentPackage = {
  platform: '小红书',
  title: '7 天把营销内容从零散灵感变成完整内容包',
  body: '围绕新品卖点、目标人群和品牌语调，先整理一个清晰 brief，再一次性产出标题、正文、标签、图片提示词和短视频分镜。团队可以直接进入审阅，不必在多个工具之间来回复制。',
  tags: ['内容日更', '品牌记忆', '营销工作流', '小红书运营'],
  imagePrompt: '明亮办公桌上的品牌内容策划板，包含渠道标签、视觉规范和审核清单，真实产品运营团队工作场景，清晰自然光，4:5',
  storyboard: [
    '镜头 1：运营同学打开项目 brief，快速确认目标人群和禁用词。',
    '镜头 2：内容包自动展开为标题、正文、标签和图片建议。',
    '镜头 3：团队在审阅区留下修改意见，一键保存最终稿。',
  ],
  voiceover: '把一次营销生成，从单篇文案升级成可审阅、可复用、可沉淀的完整内容包。',
  reviewAdvice: ['语气符合品牌记忆', '避免夸张承诺', '标题适合移动端首屏阅读'],
  exportFormats: ['Markdown', 'Docx', 'CSV'],
  version: 'AI 初稿',
};