export interface OnboardingState {
  useCase: string;
  brandName: string;
  industry: string;
  audience: string;
  tone: string;
  forbiddenWords: string;
  referenceLinks: string;
  channels: string[];
  template: string;
  brief: string;
}

export const onboardingDefaults: OnboardingState = {
  useCase: '新品上市',
  brandName: 'Marketing Hub',
  industry: 'AI 营销工具',
  audience: '品牌运营、内容团队、代理商项目经理',
  tone: '清晰专业',
  forbiddenWords: '绝对、第一、包治',
  referenceLinks: '',
  channels: ['小红书', '公众号'],
  template: '图文种草',
  brief: '为一个 AI 营销工作台生成首轮内容包，突出品牌记忆、内容生产和审阅协作。',
};

export const channelChoices = ['小红书', '抖音', '公众号', '视频号', 'B 站'];
export const useCaseChoices = ['新品上市', '内容日更', '短视频脚本', '品牌活动', '代理商客户项目'];
export const templateChoices = ['图文种草', '短视频脚本', '活动预热', '直播预告', '产品卖点拆解'];