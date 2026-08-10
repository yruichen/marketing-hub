import type { LucideIcon } from 'lucide-react';
import {
  Boxes,
  ClipboardCheck,
  CreditCard,
  Film,
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
import type { TranslationKey } from '../shared/i18n';

export type NavItem = {
  id: AppSection;
  labelKey: TranslationKey;
  hintKey: TranslationKey;
  icon: LucideIcon;
};

export type NavSection = {
  titleKey: TranslationKey;
  items: NavItem[];
};

/** 侧栏分组：把「写文案 / 做图」等入口放到显眼位置 */
export const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: 'nav.group.start',
    items: [
      {
        id: 'brainstorm',
        labelKey: 'nav.brainstorm.label',
        hintKey: 'nav.brainstorm.hint',
        icon: Sparkles,
      },
      {
        id: 'dashboard',
        labelKey: 'nav.dashboard.label',
        hintKey: 'nav.dashboard.hint',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    titleKey: 'nav.group.generate',
    items: [
      {
        id: 'content',
        labelKey: 'nav.content.label',
        hintKey: 'nav.content.hint',
        icon: Sparkles,
      },
      {
        id: 'copy',
        labelKey: 'nav.copy.label',
        hintKey: 'nav.copy.hint',
        icon: PenLine,
      },
      {
        id: 'image',
        labelKey: 'nav.image.label',
        hintKey: 'nav.image.hint',
        icon: ImageIcon,
      },
      {
        id: 'storyboard',
        labelKey: 'nav.storyboard.label',
        hintKey: 'nav.storyboard.hint',
        icon: Film,
      },
      {
        id: 'audio',
        labelKey: 'nav.audio.label',
        hintKey: 'nav.audio.hint',
        icon: Mic,
      },
      {
        id: 'video',
        labelKey: 'nav.video.label',
        hintKey: 'nav.video.hint',
        icon: Video,
      },
    ],
  },
  {
    titleKey: 'nav.group.manage',
    items: [
      {
        id: 'projects',
        labelKey: 'nav.projects.label',
        hintKey: 'nav.projects.hint',
        icon: Boxes,
      },
      {
        id: 'builder',
        labelKey: 'nav.builder.label',
        hintKey: 'nav.builder.hint',
        icon: Workflow,
      },
      {
        id: 'assets',
        labelKey: 'nav.assets.label',
        hintKey: 'nav.assets.hint',
        icon: Boxes,
      },
      {
        id: 'review',
        labelKey: 'nav.review.label',
        hintKey: 'nav.review.hint',
        icon: ClipboardCheck,
      },
    ],
  },
  {
    titleKey: 'nav.group.system',
    items: [
      {
        id: 'profile',
        labelKey: 'nav.profile.label',
        hintKey: 'nav.profile.hint',
        icon: UserRound,
      },
      {
        id: 'billing',
        labelKey: 'nav.billing.label',
        hintKey: 'nav.billing.hint',
        icon: CreditCard,
      },
      {
        id: 'config',
        labelKey: 'nav.config.label',
        hintKey: 'nav.config.hint',
        icon: Settings,
      },
    ],
  },
];

/** 侧栏 Logo 下方独立入口：新标签页打开，不占工作台 Tab */
export const TEMPLATE_LIBRARY_ENTRY = {
  labelKey: 'nav.templates.label' as TranslationKey,
  hintKey: 'nav.templates.hint' as TranslationKey,
  icon: Library,
} as const;

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
  'assets',
  'config',
];

export const TAB_META: Record<
  AppSection,
  { titleKey: TranslationKey; subtitleKey: TranslationKey }
> = {
  brainstorm: {
    titleKey: 'tab.brainstorm.title', subtitleKey: 'tab.brainstorm.subtitle',
  },
  dashboard: {
    titleKey: 'tab.dashboard.title', subtitleKey: 'tab.dashboard.subtitle',
  },
  content: {
    titleKey: 'tab.content.title', subtitleKey: 'tab.content.subtitle',
  },
  copy: {
    titleKey: 'tab.copy.title', subtitleKey: 'tab.copy.subtitle',
  },
  image: {
    titleKey: 'tab.image.title', subtitleKey: 'tab.image.subtitle',
  },
  storyboard: {
    titleKey: 'tab.storyboard.title', subtitleKey: 'tab.storyboard.subtitle',
  },
  audio: {
    titleKey: 'tab.audio.title', subtitleKey: 'tab.audio.subtitle',
  },
  video: {
    titleKey: 'tab.video.title', subtitleKey: 'tab.video.subtitle',
  },
  projects: {
    titleKey: 'tab.projects.title', subtitleKey: 'tab.projects.subtitle',
  },
  builder: {
    titleKey: 'tab.builder.title', subtitleKey: 'tab.builder.subtitle',
  },
  assets: {
    titleKey: 'tab.assets.title', subtitleKey: 'tab.assets.subtitle',
  },
  review: {
    titleKey: 'tab.review.title', subtitleKey: 'tab.review.subtitle',
  },
  community: {
    titleKey: 'tab.community.title', subtitleKey: 'tab.community.subtitle',
  },
  profile: {
    titleKey: 'tab.profile.title', subtitleKey: 'tab.profile.subtitle',
  },
  billing: {
    titleKey: 'tab.billing.title', subtitleKey: 'tab.billing.subtitle',
  },
  admin: {
    titleKey: 'tab.admin.title', subtitleKey: 'tab.admin.subtitle',
  },
  config: {
    titleKey: 'tab.config.title', subtitleKey: 'tab.config.subtitle',
  },
};
