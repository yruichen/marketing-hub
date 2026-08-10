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
  useCase: '',
  brandName: '',
  industry: '',
  audience: '',
  tone: '',
  forbiddenWords: '',
  referenceLinks: '',
  channels: [],
  template: '',
  brief: '',
};

export const channelChoices = ['小红书', '抖音', '公众号', '视频号', 'B 站'];
export const useCaseChoices = ['新品上市', '内容日更', '短视频脚本', '品牌活动', '代理商客户项目'];
export const templateChoices = ['图文种草', '短视频脚本', '活动预热', '直播预告', '产品卖点拆解'];
