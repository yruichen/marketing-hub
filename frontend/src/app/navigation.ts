import type { LucideIcon } from 'lucide-react';
import {
  Boxes,
  ClipboardCheck,
  CreditCard,
  Film,
  FolderKanban,
  ImageIcon,
  LayoutDashboard,
  Library,
  Mic,
  PenLine,
  Settings,
  Sparkles,
  UserRound,
  Video,
  Workflow,
} from 'lucide-react';
import type { AppSection } from '../shared/stores/uiStore';

export type NavItem = {
  id: AppSection;
  label: string;
  hint: string;
  icon: LucideIcon;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

/** 侧栏分组：把「写文案 / 做图」等入口放到显眼位置 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: '开始',
    items: [
      {
        id: 'brainstorm',
        label: '灵感风暴',
        hint: '一句话，AI 自动生成工作流',
        icon: Sparkles,
      },
      {
        id: 'dashboard',
        label: '首页',
        hint: '总览数据与快捷入口',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: 'AI 内容生成',
    items: [
      {
        id: 'content',
        label: '一键内容包',
        hint: '填 brief，一次出文案+分镜',
        icon: Sparkles,
      },
      {
        id: 'copy',
        label: '写文案',
        hint: '标题、正文、话题标签',
        icon: PenLine,
      },
      {
        id: 'image',
        label: '做配图',
        hint: '根据描述生成图片',
        icon: ImageIcon,
      },
      {
        id: 'storyboard',
        label: '写分镜',
        hint: '短视频镜头脚本',
        icon: Film,
      },
      {
        id: 'audio',
        label: '配旁白',
        hint: '文字转配音稿',
        icon: Mic,
      },
      {
        id: 'video',
        label: '做视频',
        hint: 'AI 生成短视频',
        icon: Video,
      },
    ],
  },
  {
    title: '项目与管理',
    items: [
      {
        id: 'projects',
        label: '我的项目',
        hint: '品牌信息与 brief',
        icon: Boxes,
      },
      {
        id: 'builder',
        label: '工作流',
        hint: '多步骤自动编排',
        icon: Workflow,
      },
      {
        id: 'assets',
        label: '资产库',
        hint: '保存的生成结果',
        icon: Boxes,
      },
      {
        id: 'review',
        label: '审阅',
        hint: '修改意见与版本',
        icon: ClipboardCheck,
      },
    ],
  },
  {
    title: '系统',
    items: [
      {
        id: 'community',
        label: '模板库',
        hint: '参考与灵感',
        icon: Library,
      },
      {
        id: 'profile',
        label: '个人主页',
        hint: '创作者资料与作品墙',
        icon: UserRound,
      },
      {
        id: 'billing',
        label: '计费',
        hint: '用量与套餐',
        icon: CreditCard,
      },
      {
        id: 'config',
        label: 'AI 设置',
        hint: 'API Key 与模型',
        icon: Settings,
      },
    ],
  },
];

/** 主工作区占满视口、避免页面级滚动的 Tab */
export const FULL_HEIGHT_WORKSPACE_TABS: AppSection[] = [
  'copy',
  'image',
  'storyboard',
  'audio',
  'video',
  'content',
  'projects',
  'builder',
  'config',
];

export const TAB_META: Record<
  AppSection,
  { title: string; subtitle: string; primaryAction?: string }
> = {
  brainstorm: {
    title: '灵感风暴',
    subtitle: '输入创意想法，AI 自动生成完整工作流',
  },
  dashboard: {
    title: '首页',
    subtitle: '查看任务进度、费用，并从下面卡片进入常用功能',
  },
  content: {
    title: '一键内容包',
    subtitle: '左侧填写 brief，点「生成内容包」；右侧查看完整初稿',
    primaryAction: '生成内容包',
  },
  copy: {
    title: '写文案',
    subtitle: '左侧填写品牌与卖点，点「运行文案 Agent」生成',
    primaryAction: '运行文案 Agent',
  },
  image: {
    title: '做配图',
    subtitle: '左侧写画面描述，点「运行视觉 Agent」生成图片',
    primaryAction: '运行视觉 Agent',
  },
  storyboard: {
    title: '写分镜',
    subtitle: '填写视频主题与时长，点「运行分镜 Agent」',
    primaryAction: '运行分镜 Agent',
  },
  audio: {
    title: '配旁白',
    subtitle: '输入要朗读的文字，点「运行配音 Agent」',
    primaryAction: '运行配音 Agent',
  },
  video: {
    title: '做视频',
    subtitle: '填写视频主题与画面描述，点「运行视频 Agent」生成短视频',
    primaryAction: '运行视频 Agent',
  },
  projects: {
    title: '我的项目',
    subtitle: '管理品牌记忆、文件夹与 campaign',
  },
  builder: {
    title: '工作流',
    subtitle: '拖拽节点并点击运行整条流程',
  },
  assets: {
    title: '资产库',
    subtitle: '浏览已保存的文案、图片等产出',
  },
  review: {
    title: '审阅',
    subtitle: '对比版本并记录修改意见',
  },
  community: {
    title: '模板库',
    subtitle: '浏览社区模板与灵感',
  },
  profile: {
    title: '个人主页',
    subtitle: '展示创作者身份、擅长领域与公开作品',
  },
  billing: {
    title: '计费与用量',
    subtitle: '查看套餐与 Token 消耗',
  },
  admin: {
    title: '运营后台',
    subtitle: '管理测试用户、组织额度、生成任务与安全日志',
  },
  config: {
    title: 'AI 设置',
    subtitle: '配置 API Key；文本、图片与视频可分开选服务商',
    primaryAction: '保存并激活',
  },
};
