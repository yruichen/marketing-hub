import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Grid3X3,
  ListChecks,
  PanelRight,
  Search,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import { apiFetch } from './hooks/useApi';
import { pathForSection, sectionFromPath } from './app/routes';
import { TAB_META } from './app/navigation';
import { AppSidebar } from './components/AppSidebar';
import { ProjectManager } from './features/projects';

const WorkflowBuilder = lazy(() =>
  import('./features/workflows').then((module) => ({ default: module.WorkflowBuilder })),
);
import { useUiStore, type AppSection } from './shared/stores/uiStore';
import type { BrandContext, BillingPlanResponse, CampaignRecord, ProjectRecord } from './types/workspace';

type Tab = AppSection;
type ToastType = 'success' | 'info' | 'error';

interface CopyOutput {
  platform: string;
  tone: string;
  title: string;
  paragraphs: string[];
  tags: string[];
  call_to_action: string;
}

interface ImageOutput {
  prompt: string;
  style: string;
  aspectRatio?: string;
  aspect_ratio?: string;
  image_url: string;
  revised_prompt: string;
}

interface StoryScene {
  scene_number: number;
  visual_description: string;
  audio_narration: string;
  duration_seconds: number;
}

interface StoryboardOutput {
  video_topic: string;
  total_duration_seconds: number;
  target_audience: string;
  scenes: StoryScene[];
}

interface AudioOutput {
  text: string;
  voice_id: string;
  speed: number;
  audio_url: string;
  text_length: number;
  estimated_audio_duration_seconds: number;
}

type CreationContent = Partial<CopyOutput & ImageOutput & StoryboardOutput & AudioOutput>;

interface AiConfig {
  id: number;
  provider: string;
  provider_display: string;
  api_key?: string;
  api_key_masked?: string;
  base_url: string;
  model_name: string;
  image_model_name?: string;
  config_scope?: 'all' | 'text' | 'image' | 'audio';
  config_scope_display?: string;
  billing_mode: string;
  is_active: boolean;
}

const providerDefaultScope = (provider: string): 'all' | 'text' | 'image' | 'audio' => {
  if (provider === 'anthropic') return 'text';
  return 'all';
};

const providerSupportsImageConfig = (provider: string) => ['mock', 'agnes', 'openai', 'gemini'].includes(provider);

const configScopeLabels: Record<string, string> = {
  all: '全部能力',
  text: '仅文本（文案/分镜）',
  image: '仅图片',
  audio: '仅配音',
};

interface CommunityItem {
  id: number;
  username: string;
  creation_type: 'copy' | 'image' | 'storyboard' | 'audio';
  creation_type_display: string;
  title: string;
  content: CreationContent;
  image_url?: string;
  audio_url?: string;
  likes: number;
  created_at: string;
  similarity_score?: number;
}

interface WorkspaceScope {
  organization: { id: number; name: string; slug: string };
  project: { id: number; name: string; slug: string; brief: string; brand_context?: BrandContext };
  campaign: { id: number; name: string; objective: string; status: string };
  username: string;
}

interface DashboardSnapshot {
  scope: WorkspaceScope;
  metrics: {
    task_count: number;
    queued_tasks: number;
    running_tasks: number;
    successful_tasks: number;
    failed_tasks: number;
    total_tokens: number;
    total_cost_usd: string;
    asset_count: number;
    community_count: number;
  };
  tasks_by_type: Record<string, number>;
  recent_usage: Array<{
    provider: string;
    model_name: string;
    total_tokens: number;
    cost_usd: string;
    created_at: string;
  }>;
}

interface GenerationTaskRecord {
  id: number;
  task_type: 'copy' | 'image' | 'storyboard' | 'audio' | 'rag_search';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  celery_task_id: string;
  result: {
    data?: unknown;
    logs?: string[];
  };
  error_message: string;
  token_count: number;
  cost_usd: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface ContentPackage {
  platform: string;
  title: string;
  body: string;
  tags: string[];
  imagePrompt: string;
  storyboard: string[];
  voiceover: string;
  reviewAdvice: string[];
  exportFormats: string[];
  version: 'AI 初稿' | '用户修改稿' | '最终稿';
}

interface OnboardingState {
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

const defaultContentPackage: ContentPackage = {
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

const onboardingDefaults: OnboardingState = {
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

const channelChoices = ['小红书', '抖音', '公众号', '视频号', 'B 站'];
const useCaseChoices = ['新品上市', '内容日更', '短视频脚本', '品牌活动', '代理商客户项目'];
const templateChoices = ['图文种草', '短视频脚本', '活动预热', '直播预告', '产品卖点拆解'];

const formatUsd = (value?: string | number | null) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return '0.0000';
  return parsed.toFixed(4);
};

const taskTypeLabels: Record<string, string> = {
  copy: '文案',
  image: '图片',
  storyboard: '分镜',
  audio: '配音',
  rag_search: '历史素材检索',
};

const loginSchema = z.object({
  username: z.string().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    setActiveSection,
    rightPanelOpen,
    setRightPanelOpen,
    darkMode: storedDarkMode,
    setDarkMode: setStoredDarkMode,
  } = useUiStore();
  // Theme state: Dark Chalkboard vs Light Paper Editorial
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return storedDarkMode;
  });

  const [token, setToken] = useState<string | null>(localStorage.getItem('mh_token'));
  const [username, setUsername] = useState<string | null>(localStorage.getItem('mh_username'));
  const [authError, setAuthError] = useState('');
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: 'ROOT', password: '123' },
  });
  
  const activeTab = sectionFromPath(location.pathname);
  const showAppRightPanel = rightPanelOpen;
  const showInlineRightPanel = rightPanelOpen && activeTab !== 'builder';
  const [globalSearch, setGlobalSearch] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem('mh_onboarding_complete') !== 'true');
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboarding, setOnboarding] = useState<OnboardingState>(onboardingDefaults);
  const [contentBrief, setContentBrief] = useState(onboardingDefaults.brief);
  const [contentPackage, setContentPackage] = useState<ContentPackage>(defaultContentPackage);
  const [contentVersion, setContentVersion] = useState<'AI 初稿' | '用户修改稿' | '最终稿'>('AI 初稿');
  const [loading, setLoading] = useState(false);
  const [apiLive, setApiLive] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: ToastType } | null>(null);
  const [workspaceScope, setWorkspaceScope] = useState<WorkspaceScope | null>(null);
  const [dashboardSnapshot, setDashboardSnapshot] = useState<DashboardSnapshot | null>(null);
  const [latestTask, setLatestTask] = useState<GenerationTaskRecord | null>(null);

  // Agent execution logs
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  
  // AIGC Inputs & Outputs
  const [copyInput, setCopyInput] = useState({
    brandName: 'Marketing-Hub',
    description: 'AI 营销场景全能助手，秒级生成爆款图文',
    tone: '爆款活泼',
    platform: 'Xiaohongshu',
  });
  const [copyOutput, setCopyOutput] = useState<CopyOutput>({
    platform: 'Xiaohongshu',
    tone: '爆款活泼',
    title: '🔥 救命！这个 Marketing-Hub 真的绝了！后悔没早点发现！',
    paragraphs: [
      '家人们谁懂啊！今天必须给你们安利这个神仙单品：【Marketing-Hub】！它的核心功能是 AI 营销场景全能助手，秒级生成爆款图文，简直是创作者和打工人的福利！😭',
      '用了一段时间，感觉整个工作流都顺畅了！在爆款活泼的风格调校下，操作起来非常有仪式感，幸福感直接拉满。✨',
      '姐妹们听我的，闭眼入不踩雷！早买早享受，别怪我没提醒你们哦～'
    ],
    tags: ['安利神仙单品', '好物分享', '高颜值实用', 'Marketing-Hub', '宝藏工具'],
    call_to_action: '👉 立即点击体验 Marketing-Hub，解锁你的创意生产力！'
  });

  const [imageInput, setImageInput] = useState({
    prompt: 'A hand-drawn desk sketch, elegant ink borders, minimalist layouts, raw visual balance',
    aspectRatio: '1:1',
    style: 'minimalist',
  });
  const [imageOutput, setImageOutput] = useState<ImageOutput>({
    prompt: 'A hand-drawn desk sketch, elegant ink borders, minimalist layouts, raw visual balance',
    style: 'minimalist',
    aspectRatio: '1:1',
    image_url: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80',
    revised_prompt: 'A hand-drawn desk sketch, elegant ink borders, minimalist layouts, styled in minimalist editorial aesthetic, low contrast natural lighting, matte visual details, 1:1 aspect ratio'
  });

  const [storyboardInput, setStoryboardInput] = useState({
    topic: '创意手账设计的日常',
    duration: 30,
    audience: '美学文字创作者',
  });
  const [storyboardOutput, setStoryboardOutput] = useState<StoryboardOutput>({
    video_topic: '创意手账设计的日常',
    total_duration_seconds: 30,
    target_audience: '美学文字创作者',
    scenes: [
      {
        scene_number: 1,
        visual_description: '特写微距：一叠剪裁粗糙的燕麦卡纸自然地叠放在木质书桌上，旁侧放置着一支经典复古钢笔。',
        audio_narration: '（轻柔的书页翻动声）“创作者的日常，从来不是完美的网格，而是灵感的随性交错。”',
        duration_seconds: 10
      },
      {
        scene_number: 2,
        visual_description: '中景镜头：阳光斜洒在一本点阵草稿本上，明黄色的便签上零散写着几句感悟。画面带有极淡的纸质偏角。',
        audio_narration: '（铅笔沙沙声淡入）“摒弃所有多余的喧嚣与泛滥的色彩，我们只保留纸张的原生温度，与文字的质感。”',
        duration_seconds: 10
      },
      {
        scene_number: 3,
        visual_description: '全景拉远：数张记录着文案与配音的排立得纸页堆叠在桌面中央，呈现一站式智能编排的成果。',
        audio_narration: '（盖章按压声收尾）“Marketing-Hub 纸页工坊。给文字以温度，给灵感以实感。”',
        duration_seconds: 10
      }
    ]
  });

  const [audioInput, setAudioInput] = useState({
    text: '欢迎使用 Marketing Hub 创意纸页杂志配音系统，为您流式输出极低疲劳旁白！',
    voiceId: 'female_warm',
    speed: 1.0,
  });
  const [audioOutput, setAudioOutput] = useState<AudioOutput>({
    text: '欢迎使用 Marketing Hub 创意纸页杂志配音系统，为您流式输出极低疲劳旁白！',
    voice_id: 'female_warm',
    speed: 1.0,
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    text_length: 35,
    estimated_audio_duration_seconds: 8.8
  });

  // API configurations list
  const [aiConfigs, setAiConfigs] = useState<AiConfig[]>([]);
  const [activeConfigForm, setActiveConfigForm] = useState({
    provider: 'mock',
    api_key: '',
    base_url: '',
    model_name: '',
    image_model_name: '',
    config_scope: 'all' as 'all' | 'text' | 'image' | 'audio',
    billing_mode: 'platform',
  });
  const [showKey, setShowKey] = useState(false);
  const [billingPlans, setBillingPlans] = useState<BillingPlanResponse | null>(null);

  // Community creations list
  const [communityItems, setCommunityItems] = useState<CommunityItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [ragLogs, setRagLogs] = useState<string[]>([]);
  const [isRagActive, setIsRagActive] = useState(false);

  // Sync theme
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('mh_darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('mh_darkMode', 'false');
    }
    setStoredDarkMode(darkMode);
  }, [darkMode, setStoredDarkMode]);

  useEffect(() => {
    setActiveSection(activeTab);
  }, [activeTab, setActiveSection]);

  const setActiveTab = useCallback((tab: Tab) => {
    setActiveSection(tab);
    const nextPath = pathForSection(tab);
    if (location.pathname !== nextPath) {
      navigate(nextPath);
    }
  }, [location.pathname, navigate, setActiveSection]);

  const triggerToast = useCallback((text: string, type: ToastType = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3000);
  }, []);

  const handleCopyClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      triggerToast('已复制到剪贴板', 'success');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      triggerToast('已复制到剪贴板', 'success');
    }
  }, [triggerToast]);

  const buildContentPackage = useCallback((brief: string, patch: Partial<OnboardingState> = {}) => {
    const state = { ...onboarding, ...patch };
    const platform = state.channels[0] || copyInput.platform || '小红书';
    const brandName = state.brandName || copyInput.brandName || workspaceScope?.project.name || '品牌';
    const coreBrief = brief.trim() || state.brief || workspaceScope?.project.brief || copyInput.description;
    const tags = [state.useCase, platform, state.industry, '品牌内容包']
      .filter(Boolean)
      .map((item) => item.replace(/\s+/g, ''));

    return {
      platform,
      title: `${brandName}｜${state.useCase}内容包`,
      body: `面向${state.audience || '目标用户'}，围绕“${coreBrief}”展开内容。语调保持${state.tone || '清晰专业'}，突出 ${state.industry || brandName} 的关键价值，并主动避开 ${state.forbiddenWords || '夸张承诺'} 等表达。`,
      tags,
      imagePrompt: `${brandName} 的${state.useCase}营销主视觉，渠道为${platform}，目标人群是${state.audience}，风格${state.tone}，包含清晰产品场景和品牌规范，4:5`,
      storyboard: [
        `镜头 1：展示${brandName}所处使用场景，点出用户真实问题。`,
        `镜头 2：用 2-3 个画面说明核心卖点与差异化理由。`,
        `镜头 3：给出行动建议，引导收藏、咨询或进入活动页面。`,
      ],
      voiceover: `${brandName} 为${state.audience || '运营团队'}准备了一套${state.useCase}内容包，从 brief 到审核建议一次完成。`,
      reviewAdvice: [
        '检查是否符合品牌语调和禁用词要求',
        `确认${platform}首屏标题长度和标签数量`,
        '保存人工修改，作为本项目下次生成偏好',
      ],
      exportFormats: ['Markdown', 'Docx', 'CSV'],
      version: 'AI 初稿' as const,
    };
  }, [copyInput.brandName, copyInput.description, copyInput.platform, onboarding, workspaceScope?.project.brief, workspaceScope?.project.name]);

  const buildContentPackageRequest = useCallback(() => ({
    brief: contentBrief,
    brand_name: onboarding.brandName || copyInput.brandName || workspaceScope?.project.name || 'Marketing Hub',
    use_case: onboarding.useCase,
    industry: onboarding.industry,
    audience: onboarding.audience,
    tone: onboarding.tone || copyInput.tone,
    forbidden_words: onboarding.forbiddenWords,
    reference_links: onboarding.referenceLinks,
    channels: onboarding.channels,
    template: onboarding.template,
    platform: onboarding.channels[0] || copyInput.platform,
    duration: storyboardInput.duration,
    username: username || 'ROOT',
    organization: workspaceScope?.organization.slug,
    project: workspaceScope?.project.slug,
    campaign: workspaceScope?.campaign.id,
  }), [
    contentBrief,
    copyInput.brandName,
    copyInput.platform,
    copyInput.tone,
    onboarding,
    storyboardInput.duration,
    username,
    workspaceScope,
  ]);

  const completeOnboarding = useCallback(async () => {
    localStorage.setItem('mh_onboarding_complete', 'true');
    setShowOnboarding(false);
    setContentBrief(onboarding.brief);
    const nextPackage = buildContentPackage(onboarding.brief);
    setContentPackage(nextPackage);
    setContentVersion('AI 初稿');
    setCopyInput((prev) => ({
      ...prev,
      brandName: onboarding.brandName,
      description: onboarding.brief,
      tone: onboarding.tone,
      platform: onboarding.channels[0] || prev.platform,
    }));
    setActiveTab('content');
    triggerToast('已生成第一份内容包草稿', 'success');
  }, [buildContentPackage, onboarding, setActiveTab, triggerToast]);

  const generateContentPackage = useCallback(async () => {
    setLoading(true);
    setAgentLogs(['正在调用 AI 生成内容包（文案 + 分镜）...', '正在根据 brief 和品牌记忆编排任务。']);
    try {
      const res = await apiFetch('/generate/content-package/', {
        method: 'POST',
        body: JSON.stringify(buildContentPackageRequest()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || `生成失败 (${res.status})`);
      }
      const data: { content_package: ContentPackage; logs?: string[] } = await res.json();
      setContentPackage(data.content_package);
      setContentVersion(data.content_package.version || 'AI 初稿');
      setAgentLogs(data.logs?.length ? data.logs : ['已完成内容包生成。', '可继续改写、保存到资产库或加入审阅。']);
      triggerToast('内容包已生成', 'success');
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : '内容包生成失败', 'error');
      setAgentLogs((prev) => [...prev, '内容包生成失败，请稍后重试。']);
    } finally {
      setLoading(false);
    }
  }, [buildContentPackageRequest, triggerToast]);

  const rewriteContentPackage = useCallback(async (mode: string) => {
    setLoading(true);
    setAgentLogs([`正在按「${mode}」方向改写内容包...`]);
    try {
      const res = await apiFetch('/generate/content-package/', {
        method: 'POST',
        body: JSON.stringify({ ...buildContentPackageRequest(), rewrite_mode: mode }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || data.error || `改写失败 (${res.status})`);
      }
      const data: { content_package: ContentPackage; logs?: string[] } = await res.json();
      setContentPackage(data.content_package);
      setContentVersion(data.content_package.version || '用户修改稿');
      setAgentLogs(data.logs?.length ? data.logs : ['已完成快捷改写。']);
      triggerToast('已完成快捷改写', 'success');
    } catch (err) {
      triggerToast(err instanceof Error ? err.message : '改写失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [buildContentPackageRequest, triggerToast]);

  const exportContentPackage = useCallback((format: string) => {
    const text = [
      `# ${contentPackage.title}`,
      '',
      `平台：${contentPackage.platform}`,
      '',
      contentPackage.body,
      '',
      `标签：${contentPackage.tags.map((tag) => `#${tag}`).join(' ')}`,
      '',
      `图片建议：${contentPackage.imagePrompt}`,
      '',
      '分镜/口播：',
      ...contentPackage.storyboard.map((item) => `- ${item}`),
      '',
      '审核建议：',
      ...contentPackage.reviewAdvice.map((item) => `- ${item}`),
    ].join('\n');
    if (format === 'Markdown') {
      handleCopyClipboard(text);
    }
    triggerToast(`${format} 导出内容已准备好`, 'info');
  }, [contentPackage, handleCopyClipboard, triggerToast]);

  const handleLogin = async (values: LoginFormValues) => {
    setLoading(true);
    setAuthError('');
    try {
      const response = await apiFetch('/auth/login/', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (response.ok) {
        const sessionMarker = data.auth_type === 'session' ? 'session' : (data.token || 'session');
        localStorage.setItem('mh_token', sessionMarker);
        localStorage.setItem('mh_username', data.username);
        setToken(sessionMarker);
        setUsername(data.username);
        triggerToast(`欢迎回来, ${data.username}!`, 'success');
      } else {
        setAuthError(data.error || '登录失败');
      }
    } catch {
      setAuthError('连接服务器失败，请确保后端服务已启动。');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('mh_token');
    localStorage.removeItem('mh_username');
    setToken(null);
    setUsername(null);
    triggerToast('已成功退出登录', 'info');
  };

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await apiFetch('/ai/config/');
      if (res.ok) {
        const data: AiConfig[] = await res.json();
        setAiConfigs(data);
        const active = data.find((c) => c.is_active);
        if (active) {
          setActiveConfigForm({
            provider: active.provider,
            api_key: '',
            base_url: active.base_url,
            model_name: active.model_name,
            image_model_name: active.image_model_name || '',
            config_scope: active.config_scope || providerDefaultScope(active.provider),
            billing_mode: active.billing_mode || 'platform',
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch configs', err);
    }
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch('/ai/config/', {
        method: 'POST',
        body: JSON.stringify({
          ...activeConfigForm,
          ...(activeConfigForm.api_key.trim() ? { api_key: activeConfigForm.api_key.trim() } : {}),
          username: username || 'ROOT',
        }),
      });
      if (res.ok) {
        triggerToast('AI 接口配置保存并激活成功', 'success');
        fetchConfigs();
      } else {
        const data = await res.json().catch(() => ({}));
        triggerToast(data.detail || data.error || `配置保存失败 (${res.status})`, 'error');
      }
    } catch {
      triggerToast('配置保存失败，连接异常', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchBillingPlans = useCallback(async () => {
    try {
      const params = new URLSearchParams({ username: username || 'ROOT' });
      const res = await apiFetch(`/billing/plans/?${params.toString()}`);
      if (res.ok) {
        const data: BillingPlanResponse = await res.json();
        setBillingPlans(data);
      }
    } catch (err) {
      console.error('Failed to fetch billing plans', err);
    }
  }, [username]);

  const handleSelectPlan = async (plan: 'free' | 'pro' | 'enterprise') => {
    setLoading(true);
    try {
      const res = await apiFetch('/billing/plans/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username || 'ROOT', plan }),
      });
      if (!res.ok) throw new Error('Plan update failed');
      const data: BillingPlanResponse = await res.json();
      setBillingPlans(data);
      fetchWorkspaceBootstrap();
      triggerToast('订阅方案已更新', 'success');
    } catch {
      triggerToast('订阅方案更新失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchCommunity = useCallback(async () => {
    try {
      const res = await apiFetch('/community/creations/');
      if (res.ok) {
        const data: CommunityItem[] = await res.json();
        setCommunityItems(data);
      }
    } catch (err) {
      console.error('Failed to fetch community items', err);
    }
  }, []);

  const fetchWorkspaceBootstrap = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        username: username || 'ROOT',
      });
      const storedProject = localStorage.getItem('mh_project_slug');
      const storedCampaign = localStorage.getItem('mh_campaign_id');
      if (storedProject) params.set('project', storedProject);
      if (storedCampaign) params.set('campaign', storedCampaign);
      const res = await apiFetch(`/workspace/bootstrap/?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setWorkspaceScope(data.scope);
      }
    } catch (err) {
      console.error('Failed to fetch workspace bootstrap', err);
    }
  }, [username]);

  const fetchDashboard = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        username: username || 'ROOT',
      });
      const storedProject = localStorage.getItem('mh_project_slug');
      const storedCampaign = localStorage.getItem('mh_campaign_id');
      if (storedProject) params.set('project', storedProject);
      if (storedCampaign) params.set('campaign', storedCampaign);
      const res = await apiFetch(`/dashboard/?${params.toString()}`);
      if (res.ok) {
        const data: DashboardSnapshot = await res.json();
        setDashboardSnapshot(data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics dashboard', err);
    }
  }, [username]);

  const handleSelectProjectScope = useCallback((project: ProjectRecord, campaign?: CampaignRecord) => {
    localStorage.setItem('mh_project_slug', project.slug);
    if (campaign) {
      localStorage.setItem('mh_campaign_id', String(campaign.id));
    } else {
      localStorage.removeItem('mh_campaign_id');
    }
    setWorkspaceScope((prev) => ({
      organization: prev?.organization || { id: project.organization_id, name: 'Marketing Hub', slug: 'marketing-hub' },
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        brief: project.brief,
        brand_context: project.brand_context,
      },
      campaign: campaign
        ? {
            id: campaign.id,
            name: campaign.name,
            objective: campaign.objective,
            status: campaign.status,
          }
        : prev?.campaign || { id: 0, name: 'Default Campaign', objective: '', status: 'active' },
      username: username || 'ROOT',
    }));
    setActiveTab('content');
    triggerToast('当前项目范围已切换', 'success');
  }, [setActiveTab, triggerToast, username]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchConfigs();
      fetchCommunity();
      fetchWorkspaceBootstrap();
      fetchDashboard();
      fetchBillingPlans();
      apiFetch('/ai/config/')
        .then((res) => {
          if (res.ok) setApiLive(true);
        })
        .catch(() => setApiLive(false));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchConfigs, fetchCommunity, fetchWorkspaceBootstrap, fetchDashboard, fetchBillingPlans]);

  const handleLike = async (id: number) => {
    try {
      const res = await apiFetch(`/community/creations/${id}/like/`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setCommunityItems(prev => prev.map(item => item.id === id ? { ...item, likes: data.likes } : item));
        triggerToast('点赞成功！', 'success');
      }
    } catch (err) {
      console.error('Failed to like', err);
    }
  };

  const handleShareToCommunity = async (
    type: CommunityItem['creation_type'],
    title: string,
    content: CreationContent,
    image_url = '',
    audio_url = ''
  ) => {
    try {
      const res = await apiFetch('/community/creations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username || 'ROOT',
          organization: workspaceScope?.organization.slug,
          project: workspaceScope?.project.slug,
          campaign: workspaceScope?.campaign.id,
          creation_type: type,
          title,
          content,
          image_url,
          audio_url
        })
      });
      if (res.ok) {
        triggerToast('已成功分享到手绘工坊社区！', 'success');
        fetchCommunity();
        fetchDashboard();
      } else {
        triggerToast('作品分享失败', 'error');
      }
    } catch {
      triggerToast('分享失败，无法连接服务器', 'error');
    }
  };

  const handleRAGSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setIsRagActive(false);
      fetchCommunity();
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/community/search/?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setCommunityItems(data.results);
        setRagLogs(data.rag_logs);
        setIsRagActive(true);
        triggerToast('品牌灵感已完成对齐', 'success');
      }
    } catch {
      triggerToast('灵感搜索请求失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const pollGenerationTask = async (taskId: number): Promise<GenerationTaskRecord> => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const res = await apiFetch(`/tasks/${taskId}/`);
      if (!res.ok) {
        throw new Error('Task polling failed');
      }
      const task: GenerationTaskRecord = await res.json();
      setLatestTask(task);
      if (task.status === 'succeeded' || task.status === 'failed') {
        return task;
      }
      await wait(900);
    }
    const res = await apiFetch(`/tasks/${taskId}/`);
    if (!res.ok) {
      throw new Error('Task polling failed');
    }
    const task: GenerationTaskRecord = await res.json();
    setLatestTask(task);
    return task;
  };

  const submitQueuedGeneration = async <T,>(
    taskType: GenerationTaskRecord['task_type'],
    payload: Record<string, unknown>,
    applyResult: (result: T) => void,
    initialLog: string,
    successMessage: string
  ) => {
    setLoading(true);
    setAgentLogs([initialLog, '正在连接 AI 并生成，请稍候…']);
    try {
      const res = await apiFetch('/tasks/', {
        method: 'POST',
        body: JSON.stringify({
          task_type: taskType,
          payload,
          username: username || 'ROOT',
          organization: workspaceScope?.organization.slug,
          project: workspaceScope?.project.slug,
          campaign: workspaceScope?.campaign.id,
          run_now: true,
        }),
      });
      if (!res.ok) {
        throw new Error('Task submit failed');
      }
      const data: { task: GenerationTaskRecord } = await res.json();
      setLatestTask(data.task);
      const task = data.task.status === 'succeeded' || data.task.status === 'failed'
        ? data.task
        : await pollGenerationTask(data.task.id);

      if (task.status === 'failed') {
        throw new Error(task.error_message || 'Queued task failed');
      }
      if (task.status !== 'succeeded') {
        setAgentLogs((prev) => [
          ...prev,
          `任务 #${task.id} 状态：${task.status}。若长时间无结果，请检查后端是否在运行。`,
        ]);
        triggerToast('生成未完成，请稍后重试', 'error');
        return;
      }

      const result = task.result.data as T;
      applyResult(result);
      setAgentLogs(task.result.logs || []);
      fetchDashboard();
      triggerToast(successMessage, 'success');
    } catch {
      triggerToast('异步任务提交或轮询失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Agent API triggers
  const handleGenerateCopy = async () => {
    await submitQueuedGeneration<CopyOutput>(
      'copy',
      {
          brand_name: copyInput.brandName,
          product_description: copyInput.description,
          tone: copyInput.tone,
          platform: copyInput.platform,
      },
      setCopyOutput,
      '[0.00s] [INFO] Initializing queued Editorial Copywriting Agent Workflow...',
      '文案异步任务执行完毕'
    );
  };

  const handleGenerateImage = async () => {
    await submitQueuedGeneration<ImageOutput>(
      'image',
      {
          prompt: imageInput.prompt,
          style: imageInput.style,
          aspect_ratio: imageInput.aspectRatio,
      },
      setImageOutput,
      '[0.00s] [INFO] Initializing queued Editorial Sketch Image Agent Workflow...',
      '视觉图片异步任务执行完毕'
    );
  };

  const handleGenerateStoryboard = async () => {
    await submitQueuedGeneration<StoryboardOutput>(
      'storyboard',
      {
          video_topic: storyboardInput.topic,
          duration: storyboardInput.duration,
          target_audience: storyboardInput.audience,
      },
      setStoryboardOutput,
      '[0.00s] [INFO] Initializing queued Storyboard Editorial Director Workflow...',
      '分镜脚本异步任务执行完毕'
    );
  };

  const handleGenerateAudio = async () => {
    await submitQueuedGeneration<AudioOutput>(
      'audio',
      {
          text: audioInput.text,
          voice_id: audioInput.voiceId,
          speed: audioInput.speed,
      },
      setAudioOutput,
      '[0.00s] [INFO] Initializing queued Editorial Audio Synthesis Pipeline...',
      '配音异步任务执行完毕'
    );
  };

  // Auth Guard Portal
  if (!token) {
    return (
      <div className="min-h-screen bg-[var(--editorial-bg)] flex flex-col justify-center items-center p-4 relative overflow-hidden editorial-grid transition-colors duration-250">
        
        {/* Asymmetrical hand-cut sheet container */}
        <div className="w-full max-w-md bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial p-8 paper-sheet-1 relative">
          
          <div className="flex flex-col items-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--editorial-text)] serif-header mb-1">
              Marketing-Hub
            </h1>
            <p className="text-[var(--editorial-text-gray)] text-[10px] uppercase tracking-widest font-mono font-bold">
              营销内容工作台
            </p>
          </div>

          <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-6">
            {authError && (
              <div className="border border-[var(--editorial-stroke)] text-rose-600 bg-rose-50 dark:bg-rose-950/20 p-3 text-xs font-mono font-semibold">
                <span>{authError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider block font-mono">// USERNAME</label>
              <input
                type="text"
                {...loginForm.register('username')}
                className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] px-2 py-2 text-sm focus:outline-none focus:border-b-2 font-mono transition-all"
                placeholder="输入管理员账号"
                aria-invalid={Boolean(loginForm.formState.errors.username)}
              />
              {loginForm.formState.errors.username && (
                <span className="text-[10px] text-rose-600 font-bold">{loginForm.formState.errors.username.message}</span>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider block font-mono">// PASSWORD</label>
              <input
                type="password"
                {...loginForm.register('password')}
                className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] px-2 py-2 text-sm focus:outline-none focus:border-b-2 font-mono transition-all"
                placeholder="输入密码"
                aria-invalid={Boolean(loginForm.formState.errors.password)}
              />
              {loginForm.formState.errors.password && (
                <span className="text-[10px] text-rose-600 font-bold">{loginForm.formState.errors.password.message}</span>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
              ) : null}
              {loading ? '正在登录工作台...' : '进入工作台'}
            </button>
          </form>

          {/* Quick preset credentials helper */}
          <div className="mt-6 pt-5 border-t border-dashed border-[var(--editorial-stroke)] text-center font-mono">
            <span className="text-[10px] text-[var(--editorial-text-gray)] font-semibold block">演示账号: ROOT / 123</span>
            <button 
              onClick={() => {
                loginForm.reset({ username: 'ROOT', password: '123' });
                triggerToast('预设凭据已载入', 'info');
              }}
              className="mt-2 text-[10px] text-[var(--editorial-accent-blue)] font-bold hover:underline"
            >
              [ 自动填充演示凭据 ]
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--editorial-bg)] text-[var(--editorial-text)] grid grid-cols-1 xl:grid-cols-[240px_minmax(0,1fr)] relative overflow-hidden transition-colors duration-250 font-sans">
      
      {/* Dynamic toast alerts */}
      {feedbackMsg && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-4 border-1.5 border-[var(--editorial-stroke)] shadow-editorial bg-[var(--editorial-paper)] animate-in slide-in-from-top duration-200 font-mono text-xs font-semibold toast-${feedbackMsg.type}`}>
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {showOnboarding && (
        <OnboardingModal
          state={onboarding}
          step={onboardingStep}
          setState={setOnboarding}
          setStep={setOnboardingStep}
          onClose={() => {
            localStorage.setItem('mh_onboarding_complete', 'true');
            setShowOnboarding(false);
          }}
          onComplete={completeOnboarding}
        />
      )}

      {/* 左侧导航 */}
      <AppSidebar
        activeTab={activeTab}
        onNavigate={setActiveTab}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
        username={username}
        onLogout={handleLogout}
      />

      {/* 主工作区 */}
      <main className="min-w-0 flex flex-col p-4 md:p-8 overflow-y-auto w-full xl:my-6 z-10 transition-colors duration-250">
        
        {/* Workspace Title Bar */}
        <header className="flex flex-col gap-4 mb-8 pb-4 border-b border-[var(--editorial-stroke)]">
          <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-4">
            <div>
            <h2 className="text-lg md:text-xl font-bold text-[var(--editorial-text)] serif-header">
              {TAB_META[activeTab]?.title || '工作台'}
            </h2>
            <p className="text-[11px] text-[var(--editorial-text-gray)] mt-2 leading-relaxed max-w-2xl">
              {TAB_META[activeTab]?.subtitle || '从左侧菜单选择功能'}
            </p>
            {TAB_META[activeTab]?.primaryAction && (
              <p className="text-[10px] text-[var(--editorial-accent-blue)] font-bold mt-1">
                主操作按钮文案：「{TAB_META[activeTab].primaryAction}」（一般在页面左侧或顶部）
              </p>
            )}
            </div>
          
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <label className="relative min-w-[260px] flex items-center">
                <Search className="absolute left-3 h-4 w-4 text-[var(--editorial-text-gray)]" aria-hidden="true" />
                <input
                  value={globalSearch}
                  onChange={(event) => setGlobalSearch(event.target.value)}
                  className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] pl-9 pr-3 py-2 text-xs focus:outline-none"
                  placeholder="搜索项目、brief、品牌记忆、资产或标签"
                  aria-label="全局搜索"
                />
              </label>
              <button type="button" onClick={() => setShowOnboarding(true)} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)] flex items-center gap-1.5" title="重新打开首次使用引导" aria-label="重新打开首次使用引导">
                <BookOpen className="h-3.5 w-3.5" />
                引导
              </button>
              <button type="button" onClick={() => setRightPanelOpen(!rightPanelOpen)} className="border border-[var(--editorial-stroke)] p-2 hover:bg-[var(--editorial-unselected)]" title="显示或隐藏右侧上下文" aria-label="显示或隐藏右侧上下文">
                <PanelRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] font-bold font-mono">
            <div className="flex flex-wrap items-center gap-2">
              <span className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-2 py-1 flex items-center gap-1.5">
                <BriefcaseBusiness className="h-3 w-3" />
                {workspaceScope?.organization.name || 'Marketing Hub'}
              </span>
              <span className="text-[var(--editorial-text-gray)]">/</span>
              <span className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-2 py-1">
                {workspaceScope?.project.name || 'Core Launch'}
              </span>
              <span className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-2 py-1">
                {workspaceScope?.campaign.name || 'Product Launch'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5"><ListChecks className="h-3.5 w-3.5" /> 队列 {dashboardSnapshot?.metrics.queued_tasks ?? 0}</span>
              <span className="flex items-center gap-1.5"><Bell className="h-3.5 w-3.5" /> 通知 {dashboardSnapshot?.metrics.failed_tasks ?? 0}</span>
              <span className="flex items-center gap-1.5"><UserCircle className="h-3.5 w-3.5" /> {username || 'ROOT'}</span>
              <span className={`h-2 w-2 rounded-full ${apiLive ? 'bg-emerald-500' : 'bg-yellow-500'}`} title={apiLive ? '后端服务正常' : '后端服务未确认'}></span>
            </div>
          </div>
        </header>

        {/* Workspace Panels Overlapping Paper Sheet Grid */}
        <div className={`grid grid-cols-1 ${showInlineRightPanel ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : ''} gap-6 z-0 items-start`}>
          <div className="space-y-6 min-w-0">
          {activeTab === 'projects' && (
            <ProjectManager
              organization={workspaceScope?.organization || null}
              activeProjectId={workspaceScope?.project.id}
              onSelectScope={handleSelectProjectScope}
              triggerToast={triggerToast}
            />
          )}

          {activeTab === 'builder' && (
            <Suspense fallback={<div className="p-8 text-sm text-[var(--editorial-text-gray)]">工作流模块加载中…</div>}>
            <WorkflowBuilder
              organization={workspaceScope?.organization || null}
              project={workspaceScope?.project || null}
              campaign={workspaceScope?.campaign?.id ? workspaceScope.campaign : null}
              username={username || 'ROOT'}
              triggerToast={triggerToast}
            />
            </Suspense>
          )}

          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
              <div className="xl:col-span-4 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial paper-sheet-1">
                <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono mb-5">// WORKSPACE SCOPE</h3>
                <div className="space-y-4 font-mono">
                  <div className="border-b border-dashed border-[var(--editorial-stroke)]/40 pb-3">
                    <span className="block text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">Organization</span>
                    <span className="text-sm font-bold">{dashboardSnapshot?.scope.organization.name || workspaceScope?.organization.name || 'Marketing Hub'}</span>
                  </div>
                  <div className="border-b border-dashed border-[var(--editorial-stroke)]/40 pb-3">
                    <span className="block text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">Project</span>
                    <span className="text-sm font-bold">{dashboardSnapshot?.scope.project.name || workspaceScope?.project.name || 'Core Launch'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] text-[var(--editorial-text-gray)] font-black uppercase">Campaign</span>
                    <span className="text-sm font-bold">{dashboardSnapshot?.scope.campaign.name || workspaceScope?.campaign.name || 'Product Launch'}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    fetchWorkspaceBootstrap();
                    fetchDashboard();
                    triggerToast('工作区与成本看板已刷新', 'info');
                  }}
                  className="w-full btn-editorial-secondary py-2.5 rounded-none font-bold text-[10px] uppercase tracking-wider mt-6"
                >
                  刷新工作区状态
                </button>

                <div className="mt-6 pt-5 border-t border-dashed border-[var(--editorial-stroke)]/40">
                  <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase mb-3">常用功能</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { tab: 'content' as Tab, label: '一键内容包', desc: 'brief → 全套初稿' },
                      { tab: 'copy' as Tab, label: '写文案', desc: '标题正文标签' },
                      { tab: 'image' as Tab, label: '做配图', desc: 'AI 生成图片' },
                      { tab: 'config' as Tab, label: 'AI 设置', desc: '配置 API Key' },
                    ].map((item) => (
                      <button
                        key={item.tab}
                        type="button"
                        onClick={() => setActiveTab(item.tab)}
                        className="text-left border border-[var(--editorial-stroke)] px-3 py-2 hover:bg-[var(--editorial-unselected)]"
                      >
                        <span className="block text-xs font-black">{item.label}</span>
                        <span className="block text-[9px] text-[var(--editorial-text-gray)] mt-0.5">{item.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="xl:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-5">
                {[
                  ['任务总量', dashboardSnapshot?.metrics.task_count ?? 0],
                  ['成功任务', dashboardSnapshot?.metrics.successful_tasks ?? 0],
                  ['社区作品', dashboardSnapshot?.metrics.community_count ?? 0],
                  ['资产记录', dashboardSnapshot?.metrics.asset_count ?? 0],
                  ['Token 审计', dashboardSnapshot?.metrics.total_tokens ?? 0],
                  ['账单估算 USD', formatUsd(dashboardSnapshot?.metrics.total_cost_usd)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
                    <span className="block text-[9px] text-[var(--editorial-text-gray)] font-black uppercase tracking-wider font-mono">{label}</span>
                    <span className="block mt-2 text-xl md:text-2xl font-black serif-header text-[var(--editorial-text)] truncate" title={String(value)}>{value}</span>
                  </div>
                ))}

                <div className="md:col-span-2 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial paper-sheet-2">
                  <div className="flex justify-between border-b border-[var(--editorial-stroke)] pb-3 mb-4">
                    <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono">// TASK TYPE DISTRIBUTION</h3>
                    <span className="text-[9px] font-mono text-[var(--editorial-text-gray)]">LIVE DB RECORDS</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
                    {['copy', 'image', 'storyboard', 'audio'].map((taskType) => (
                      <div key={taskType} className="min-w-0 border border-[var(--editorial-stroke)] p-3">
                        <span className="block text-[9px] text-[var(--editorial-text-gray)] font-black truncate">{taskTypeLabels[taskType]}</span>
                        <span className="block mt-1 font-black text-lg">{dashboardSnapshot?.tasks_by_type[taskType] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 border-t border-dashed border-[var(--editorial-stroke)]/40 pt-4">
                    {latestTask && (
                      <div className="mb-4 border border-[var(--editorial-stroke)] p-3 font-mono">
                        <span className="block text-[9px] text-[var(--editorial-text-gray)] uppercase font-black">Latest Queued Task</span>
                        <div className="mt-2 flex flex-wrap justify-between gap-3 text-[10px]">
                          <span>#{latestTask.id} / {taskTypeLabels[latestTask.task_type] || latestTask.task_type}</span>
                          <span>{latestTask.status}</span>
                          <span>{latestTask.celery_task_id ? 'CELERY LINKED' : 'LOCAL LEDGER'}</span>
                        </div>
                      </div>
                    )}
                    <h4 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono mb-3">// RECENT USAGE EVENTS</h4>
                    {(dashboardSnapshot?.recent_usage.length ?? 0) === 0 ? (
                      <p className="text-xs text-[var(--editorial-text-gray)] font-mono">暂无成本审计事件。运行任意生成任务后会写入 UsageEvent。</p>
                    ) : (
                      <div className="space-y-2">
                        {dashboardSnapshot?.recent_usage.slice(0, 5).map((event, idx) => (
                          <div key={`${event.created_at}-${idx}`} className="flex justify-between gap-3 text-[10px] font-mono border-b border-dashed border-[var(--editorial-stroke)]/20 pb-2">
                            <span>{event.provider || 'mock'} / {event.model_name || 'default'}</span>
                            <span>{event.total_tokens} tokens / ${formatUsd(event.cost_usd)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'content' && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              <section className="xl:col-span-5 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase">内容包输入</h3>
                    <p className="text-[10px] text-[var(--editorial-text-gray)] mt-1">一个 brief 生成标题、正文、标签、图片建议和分镜建议。</p>
                  </div>
                  <button type="button" onClick={generateContentPackage} disabled={loading} className="btn-editorial-primary px-3 py-2 text-[10px] font-black uppercase flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    生成内容包
                  </button>
                </div>

                <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
                  使用场景
                  <select value={onboarding.useCase} onChange={(event) => setOnboarding((prev) => ({ ...prev, useCase: event.target.value }))} className="border border-[var(--editorial-stroke)] bg-transparent px-3 py-2 text-xs font-normal">
                    {useCaseChoices.map((choice) => <option key={choice}>{choice}</option>)}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
                  brief
                  <textarea rows={4} value={contentBrief} onChange={(event) => setContentBrief(event.target.value)} className="border border-[var(--editorial-stroke)] bg-transparent p-3 text-xs resize-none focus:outline-none" />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
                    渠道
                    <div className="flex flex-wrap gap-2">
                      {channelChoices.map((channel) => {
                        const active = onboarding.channels.includes(channel);
                        return (
                          <button key={channel} type="button" onClick={() => setOnboarding((prev) => ({
                            ...prev,
                            channels: prev.channels.includes(channel) ? prev.channels.filter((item) => item !== channel) : [...prev.channels, channel],
                          }))} className={`border px-2 py-1 text-[9px] ${active ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-unselected)]' : 'border-[var(--editorial-stroke)]/40'}`}>
                            {channel}
                          </button>
                        );
                      })}
                    </div>
                  </label>
                  <label className="flex flex-col gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
                    起始模板
                    <select value={onboarding.template} onChange={(event) => setOnboarding((prev) => ({ ...prev, template: event.target.value }))} className="border border-[var(--editorial-stroke)] bg-transparent px-3 py-2 text-xs font-normal">
                      {templateChoices.map((choice) => <option key={choice}>{choice}</option>)}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['更短', 'short'],
                    ['更有冲突感', 'conflict'],
                    ['更专业', 'professional'],
                    ['更年轻化', 'young'],
                    ['减少夸张表达', 'calm'],
                  ].map(([label, mode]) => (
                    <button key={mode} type="button" onClick={() => rewriteContentPackage(mode)} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setActiveTab('copy')} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">文案细化</button>
                  <button type="button" onClick={() => setActiveTab('image')} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">图片提示词</button>
                  <button type="button" onClick={() => setActiveTab('storyboard')} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">分镜</button>
                  <button type="button" onClick={() => setActiveTab('audio')} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">口播</button>
                </div>
              </section>

              <section className="xl:col-span-7 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-3">
                  <div>
                    <h3 className="text-sm font-black uppercase">{contentPackage.title}</h3>
                    <p className="text-[10px] text-[var(--editorial-text-gray)] mt-1">版本：{contentVersion}</p>
                  </div>
                  <div className="flex gap-2">
                    {contentPackage.exportFormats.map((format) => (
                      <button key={format} type="button" onClick={() => exportContentPackage(format)} className="border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">
                        导出 {format}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <p className="text-xs leading-7 text-[var(--editorial-text-muted)]">{contentPackage.body}</p>
                    <div className="flex flex-wrap gap-2 text-[10px] font-black text-[var(--editorial-accent-blue)]">
                      {contentPackage.tags.map((tag) => <span key={tag}>#{tag}</span>)}
                    </div>
                    <div className="border border-[var(--editorial-stroke)] p-3 text-xs">
                      <div className="text-[10px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">图片建议</div>
                      <p>{contentPackage.imagePrompt}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="border border-[var(--editorial-stroke)] p-3">
                      <div className="text-[10px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">分镜 / 口播</div>
                      <div className="space-y-2 text-xs">
                        {contentPackage.storyboard.map((line) => <p key={line}>{line}</p>)}
                      </div>
                    </div>
                    <div className="border border-[var(--editorial-stroke)] p-3">
                      <div className="text-[10px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">审核建议</div>
                      <ul className="space-y-1 text-xs">
                        {contentPackage.reviewAdvice.map((line) => <li key={line}>• {line}</li>)}
                      </ul>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => handleCopyClipboard(contentPackage.body)} className="btn-editorial-secondary px-3 py-2 text-[10px] font-black uppercase">复制正文</button>
                      <button type="button" onClick={() => setActiveTab('review')} className="btn-editorial-secondary px-3 py-2 text-[10px] font-black uppercase">加入审阅</button>
                      <button type="button" onClick={() => setActiveTab('projects')} className="btn-editorial-secondary px-3 py-2 text-[10px] font-black uppercase">保存到项目</button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ==================== 1. COPY PANEL ==================== */}
          {activeTab === 'copy' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Input Slate (Asymmetrical Hand-Cut paper 1) */}
              <div className="col-span-1 lg:col-span-5 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial paper-sheet-1 flex flex-col gap-6 relative">
                
                {/* Exquisite Bookplate Section Indicator at top center */}
                <div className="flex justify-center border-b border-[var(--editorial-stroke)] pb-4">
                  <Sparkles className="h-6 w-6 text-[var(--editorial-text)]" />
                </div>
                
                <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono">// PARAMETERS SLATE</h3>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">品牌/产品名称</label>
                  <input
                    type="text"
                    value={copyInput.brandName}
                    onChange={(e) => setCopyInput({ ...copyInput, brandName: e.target.value })}
                    className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none focus:border-b-2 font-mono font-semibold"
                    placeholder="请输入名称..."
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">核心卖点 & 功能描述</label>
                  <textarea
                    rows={3}
                    value={copyInput.description}
                    onChange={(e) => setCopyInput({ ...copyInput, description: e.target.value })}
                    className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] p-3 text-xs focus:outline-none focus:border-slate-650 resize-none font-semibold font-mono leading-relaxed"
                    placeholder="请详细描述产品的特征和定位..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">情绪语调风格</label>
                    <select
                      value={copyInput.tone}
                      onChange={(e) => setCopyInput({ ...copyInput, tone: e.target.value })}
                      className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
                    >
                      <option value="爆款活泼">爆款活泼</option>
                      <option value="严谨学术">严谨学术</option>
                      <option value="幽默整活">幽默整活</option>
                      <option value="高端商务">高端商务</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">社会投递媒介</label>
                    <select
                      value={copyInput.platform}
                      onChange={(e) => setCopyInput({ ...copyInput, platform: e.target.value })}
                      className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
                    >
                      <option value="Xiaohongshu">小红书</option>
                      <option value="WeChat">微信公众号</option>
                      <option value="default">英文通用推广</option>
                    </select>
                  </div>
                </div>

                {/* Primary execute action btn */}
                <button
                  onClick={handleGenerateCopy}
                  disabled={loading}
                  className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {loading ? (
                    <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                  ) : null}
                  <span>{loading ? 'AGENT RUNNING...' : '运行文案编排 Agent'}</span>
                </button>
              </div>

              {/* Right Output Sheet (Tilted organic paper stack 2) */}
              <div className="col-span-1 lg:col-span-7 flex flex-col gap-6">
                
                {/* Typed Manuscript Sheet */}
                <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 pb-12 shadow-editorial paper-sheet-2 relative flex flex-col gap-6 min-h-[350px] transform rotate-[0.5deg] transition-all">
                  
                  {/* Preview section indicator */}
                  <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)] pb-3">
                    <span className="text-[10px] font-black text-[var(--editorial-text-gray)] flex items-center gap-1 font-mono uppercase">
                      <span>TYPED MANUSCRIPT PREVIEW</span>
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleShareToCommunity('copy', `[${copyOutput.platform}] ${copyInput.brandName}`, copyOutput)}
                        className="bg-transparent border border-[var(--editorial-stroke)] hover:bg-[var(--editorial-stroke)] hover:text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer"
                      >
                        <span>分享社区</span>
                      </button>
                      <button
                        onClick={() => handleCopyClipboard(`${copyOutput.title}\n\n${copyOutput.paragraphs.join('\n')}\n\n${copyOutput.tags.map((t: string) => '#' + t).join(' ')}`)}
                        className="bg-[var(--editorial-stroke)] border border-[var(--editorial-stroke)] text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-black hover:scale-103 active:scale-97 transition-all cursor-pointer"
                      >
                        复制剪贴板
                      </button>
                    </div>
                  </div>

                  <div className="space-y-5">
                    {/* Serif Title */}
                    <div className="bg-[var(--editorial-bg)]/40 p-4 border border-[var(--editorial-stroke)]/40 rounded-none">
                      <h4 className="serif-header font-bold text-base leading-snug text-[var(--editorial-text)]">{copyOutput.title}</h4>
                    </div>

                    {/* Paragraphs with generous line-height and softened color */}
                    <div className="space-y-4">
                      {copyOutput.paragraphs.map((p: string, idx: number) => (
                        <p key={idx} className="text-xs leading-[1.85] text-[var(--editorial-text-muted)] font-medium font-mono text-justify">{p}</p>
                      ))}
                    </div>

                    {/* Muted pencil blue italics tags */}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[var(--editorial-accent-blue)] italic font-semibold">
                      {copyOutput.tags.map((t: string, idx: number) => (
                        <span key={idx}>#{t}</span>
                      ))}
                    </div>
                  </div>

                  {/* Minimalist polaroid-styled bottom parameters tag */}
                  <div className="absolute bottom-3 left-6 right-6 flex justify-between items-center text-[9px] font-mono text-[var(--editorial-text-gray)] uppercase border-t border-dashed border-[var(--editorial-stroke)]/40 pt-2.5 mt-4">
                    <span>SEED: 827419-TYP</span>
                    <span>MODEL: MANUSCRIPT-V2</span>
                  </div>
                </div>

                <AgentTerminal logs={agentLogs} />
              </div>
            </div>
          )}

          {/* ==================== 2. IMAGE WORKSPACE ==================== */}
          {activeTab === 'image' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Input Slate */}
              <div className="col-span-1 lg:col-span-5 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial paper-sheet-1 flex flex-col gap-6 relative">
                <div className="flex justify-center border-b border-[var(--editorial-stroke)] pb-4">
                  <Sparkles className="h-6 w-6 text-[var(--editorial-text)]" />
                </div>
                
                <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono">// VISUAL STICKY SLATE</h3>

                <div className="flex flex-col gap-2">
                  <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">视觉 Prompt 描述</label>
                  <textarea
                    rows={4}
                    value={imageInput.prompt}
                    onChange={(e) => setImageInput({ ...imageInput, prompt: e.target.value })}
                    className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] p-3 text-xs focus:outline-none resize-none font-semibold font-mono leading-relaxed"
                    placeholder="请输入视觉图像 Prompt 描述..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  
                  {/* Geometric ratio button selector */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">尺寸比例</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['1:1', '16:9', '9:16'].map((ratio) => {
                        const isSelected = imageInput.aspectRatio === ratio;
                        return (
                          <button
                            type="button"
                            key={ratio}
                            onClick={() => setImageInput({ ...imageInput, aspectRatio: ratio })}
                            className={`border border-[var(--editorial-stroke)] p-2 text-[9px] font-black font-mono transition-all ${
                              isSelected 
                                ? 'bg-[var(--editorial-stroke)] text-[var(--editorial-bg)] scale-[1.03]'
                                : 'bg-[var(--editorial-paper)] text-[var(--editorial-text)] hover:bg-[var(--editorial-unselected)]'
                            }`}
                          >
                            {ratio}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">艺术线条风格 Style</label>
                    <select
                      value={imageInput.style}
                      onChange={(e) => setImageInput({ ...imageInput, style: e.target.value })}
                      className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
                    >
                      <option value="neo-brutalism">新粗野主义</option>
                      <option value="3d">3D 拟真手办</option>
                      <option value="minimalist">极简极白</option>
                      <option value="cinematic">电影感写实</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleGenerateImage}
                  disabled={loading}
                  className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {loading ? (
                    <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                  ) : null}
                  <span>{loading ? 'AGENT DESIGNING...' : '运行视觉设计 Agent'}</span>
                </button>
              </div>

              {/* Right Output Preview */}
              <div className="col-span-1 lg:col-span-7 flex flex-col gap-6">
                
                {/* Polaroid container */}
                <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 pb-12 shadow-editorial paper-sheet-2 relative flex flex-col gap-4 min-h-[350px] transform rotate-[-0.5deg]">
                  
                  <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)] pb-2">
                    <span className="text-[10px] font-black text-[var(--editorial-text-gray)] flex items-center gap-1 font-mono uppercase">
                      <span>VISUAL POLAROID IMAGE</span>
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleShareToCommunity('image', `[${imageOutput.style}] Graphic Polaroid`, imageOutput, imageOutput.image_url)}
                        className="bg-transparent border border-[var(--editorial-stroke)] hover:bg-[var(--editorial-stroke)] hover:text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer"
                      >
                        <span>分享社区</span>
                      </button>
                      <a
                        href={imageOutput.image_url}
                        target="_blank"
                        className="bg-[var(--editorial-stroke)] border border-[var(--editorial-stroke)] text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-black hover:scale-103 active:scale-97 transition-all cursor-pointer flex items-center text-center"
                      >
                        大图
                      </a>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    
                    {/* Generative picture canvas */}
                    <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)] p-2 relative flex justify-center items-center overflow-hidden min-h-[220px]">
                      {loading ? (
                        <div className="w-full h-full absolute inset-0 editorial-loader-bar flex flex-col items-center justify-center border-none">
                          <span className="font-mono text-[9px] font-black text-black bg-[var(--editorial-accent-yellow)] border border-black px-2 py-0.5 animate-pulse">
                            AIGC RENDERING ENGINE...
                          </span>
                        </div>
                      ) : (
                        <img
                          src={imageOutput.image_url}
                          alt="AI polaroid output sketch"
                          className="max-h-[240px] w-full object-cover object-center border border-[var(--editorial-stroke)]"
                        />
                      )}
                    </div>

                    <div className="space-y-3 font-mono">
                      <div className="bg-[var(--editorial-bg)]/40 border border-[var(--editorial-stroke)]/40 p-4 text-[10px] leading-relaxed">
                        <span className="font-black text-[var(--editorial-text)] uppercase tracking-wider block mb-1.5">// REVISED PROMPT</span>
                        <p className="text-[var(--editorial-text-muted)] font-semibold">{imageOutput.revised_prompt}</p>
                      </div>
                      
                      <button
                        onClick={() => handleCopyClipboard(imageOutput.revised_prompt)}
                        className="w-full bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] hover:bg-[var(--editorial-unselected)] text-[var(--editorial-text)] py-2 text-xs font-bold shadow-editorial-sm active:shadow-none active:translate-x-[1.5px] active:translate-y-[1.5px] cursor-pointer transition-all"
                      >
                        复制系统微调 Prompt
                      </button>
                    </div>
                  </div>

                  {/* Metadata polaroid tag */}
                  <div className="absolute bottom-3 left-6 right-6 flex justify-between items-center text-[9px] font-mono text-[var(--editorial-text-gray)] uppercase border-t border-dashed border-[var(--editorial-stroke)]/40 pt-2.5 mt-2">
                    <span>SEED: 309485-VIS</span>
                    <span>RATIO: {imageOutput.aspectRatio || imageOutput.aspect_ratio}</span>
                  </div>
                </div>

                <AgentTerminal logs={agentLogs} />
              </div>
            </div>
          )}

          {/* ==================== 3. STORYBOARD WORKSPACE ==================== */}
          {activeTab === 'storyboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Input Slate */}
              <div className="col-span-1 lg:col-span-5 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial paper-sheet-1 flex flex-col gap-6 relative">
                <div className="flex justify-center border-b border-[var(--editorial-stroke)] pb-4">
                  <Sparkles className="h-6 w-6 text-[var(--editorial-text)]" />
                </div>
                
                <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono">// TIMELINE STICKY SLATE</h3>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">视频大纲 Focus</label>
                  <input
                    type="text"
                    value={storyboardInput.topic}
                    onChange={(e) => setStoryboardInput({ ...storyboardInput, topic: e.target.value })}
                    className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none focus:border-b-2 font-mono font-semibold"
                    placeholder="输入场景焦点大纲..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">预估总时间 Duration</label>
                    <select
                      value={storyboardInput.duration}
                      onChange={(e) => setStoryboardInput({ ...storyboardInput, duration: parseInt(e.target.value) })}
                      className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
                    >
                      <option value={15}>15s 抖快极速宣传</option>
                      <option value={30}>30s 标准剧情广告</option>
                      <option value={60}>60s 深度讲解剧本</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">目标受众 Audience</label>
                    <input
                      type="text"
                      value={storyboardInput.audience}
                      onChange={(e) => setStoryboardInput({ ...storyboardInput, audience: e.target.value })}
                      className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none focus:border-b-2 font-mono font-semibold"
                      placeholder="受众群体描述..."
                    />
                  </div>
                </div>

                <button
                  onClick={handleGenerateStoryboard}
                  disabled={loading}
                  className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {loading ? (
                    <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                  ) : null}
                  <span>{loading ? 'AGENT DIRECTING...' : '运行分镜编排 Agent'}</span>
                </button>
              </div>

              {/* Right Output Preview */}
              <div className="col-span-1 lg:col-span-7 flex flex-col gap-6">
                
                {/* Manuscript storyboard timeline sheet */}
                <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 pb-12 shadow-editorial paper-sheet-2 relative flex flex-col gap-4 min-h-[350px] transform rotate-[0.4deg]">
                  
                  <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)] pb-3">
                    <span className="text-[10px] font-black text-[var(--editorial-text-gray)] flex items-center gap-1 font-mono uppercase">
                      <span>STORYBOARD MANUSCRIPT TIMELINE</span>
                    </span>
                    <button
                      onClick={() => handleShareToCommunity('storyboard', `[分镜] ${storyboardOutput.video_topic}`, storyboardOutput)}
                      className="bg-transparent border border-[var(--editorial-stroke)] hover:bg-[var(--editorial-stroke)] hover:text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer"
                    >
                      <span>分享社区</span>
                    </button>
                  </div>

                  <div className="flex flex-col gap-4 max-h-[320px] overflow-y-auto pr-1">
                    {loading ? (
                      <div className="w-full h-32 editorial-loader-bar flex flex-col items-center justify-center">
                        <span className="font-mono text-[9px] font-black text-black bg-[var(--editorial-accent-yellow)] border border-black px-2 py-0.5 animate-pulse">
                          STORYBOARD SEGMENTING IN PROGRESS...
                        </span>
                      </div>
                    ) : (
                      storyboardOutput.scenes.map((scene, idx) => (
                        <div key={idx} className="border border-[var(--editorial-stroke)]/40 bg-[var(--editorial-bg)]/20 p-4 relative shadow-editorial-sm font-mono">
                          <span className="absolute top-3 right-3 bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] text-[8px] font-mono px-2 py-0.5 font-bold">
                            SCENE {scene.scene_number} ({scene.duration_seconds}s)
                          </span>
                          
                          <div className="font-black text-[8px] text-[var(--editorial-text-gray)] uppercase mb-1 flex items-center gap-1">
                            <span>VISUAL FRAME 调度描述</span>
                          </div>
                          <p className="text-xs font-bold leading-relaxed text-[var(--editorial-text)] mb-3 pl-2 border-l border-[var(--editorial-stroke)]">
                            {scene.visual_description}
                          </p>

                          <div className="font-black text-[8px] text-[var(--editorial-text-gray)] uppercase mb-1 flex items-center gap-1">
                            <span>AUDIO SPEECH 旁白配音</span>
                          </div>
                          <p className="text-xs font-medium leading-relaxed bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)]/60 p-2 text-[var(--editorial-text-muted)]">
                            {scene.audio_narration}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Bottom parameters */}
                  <div className="absolute bottom-3 left-6 right-6 flex justify-between items-center text-[9px] font-mono text-[var(--editorial-text-gray)] uppercase border-t border-dashed border-[var(--editorial-stroke)]/40 pt-2.5 mt-2">
                    <span>TOPIC: "{storyboardOutput.video_topic}"</span>
                    <span>DURATION: {storyboardOutput.total_duration_seconds}S</span>
                  </div>
                </div>

                <AgentTerminal logs={agentLogs} />
              </div>
            </div>
          )}

          {/* ==================== 4. AUDIO WORKSPACE ==================== */}
          {activeTab === 'audio' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Input Slate */}
              <div className="col-span-1 lg:col-span-5 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial paper-sheet-1 flex flex-col gap-6 relative">
                <div className="flex justify-center border-b border-[var(--editorial-stroke)] pb-4">
                  <Sparkles className="h-6 w-6 text-[var(--editorial-text)]" />
                </div>
                
                <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono">// AUDIO STICKY SLATE</h3>

                <div className="flex flex-col gap-2">
                  <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">旁白配音脚本</label>
                  <textarea
                    rows={4}
                    value={audioInput.text}
                    onChange={(e) => setAudioInput({ ...audioInput, text: e.target.value })}
                    className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] p-3 text-xs focus:outline-none resize-none font-semibold font-mono leading-relaxed"
                    placeholder="请输入配音旁白脚本文本..."
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">物理配音声线 Speaker</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'female_warm', label: '温柔女声' },
                      { id: 'male_energetic', label: '激情男声' },
                      { id: 'child_cheerful', label: '快乐童声' },
                    ].map((v) => {
                      const isSelected = audioInput.voiceId === v.id;
                      return (
                        <button
                          type="button"
                          key={v.id}
                          onClick={() => setAudioInput({ ...audioInput, voiceId: v.id })}
                          className={`border border-[var(--editorial-stroke)] p-2 text-[9px] font-bold transition-all cursor-pointer ${
                            isSelected 
                              ? 'bg-[var(--editorial-stroke)] text-[var(--editorial-bg)] scale-[1.02]' 
                              : 'bg-[var(--editorial-paper)] text-[var(--editorial-text)] hover:bg-[var(--editorial-unselected)]'
                          }`}
                        >
                          {v.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Editorial Slider knob */}
                <div className="flex flex-col gap-1.5 font-mono">
                  <div className="flex justify-between items-center text-[10px] font-bold text-[var(--editorial-text)]">
                    <span className="uppercase">播放语速 Rate</span>
                    <span className="bg-[var(--editorial-bg)]/40 border border-[var(--editorial-stroke)]/40 px-1.5 text-xs">{audioInput.speed}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={audioInput.speed}
                    onChange={(e) => setAudioInput({ ...audioInput, speed: parseFloat(e.target.value) })}
                    className="editorial-slider mt-2"
                  />
                </div>

                <button
                  onClick={handleGenerateAudio}
                  disabled={loading}
                  className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {loading ? (
                    <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                  ) : null}
                  <span>{loading ? 'AGENT SYNTHESIZING...' : '运行配音合成 Agent'}</span>
                </button>
              </div>

              {/* Right Output Preview */}
              <div className="col-span-1 lg:col-span-7 flex flex-col gap-6">
                
                {/* Audio Polaroids manuscript */}
                <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 pb-12 shadow-editorial paper-sheet-2 relative flex flex-col gap-4 min-h-[350px] transform rotate-[-0.3deg]">
                  
                  <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)] pb-2">
                    <span className="text-[10px] font-black text-[var(--editorial-text-gray)] flex items-center gap-1 font-mono uppercase">
                      <span>AUDIO TIMELINE STREAM PREVIEW</span>
                    </span>
                    <button
                      onClick={() => handleShareToCommunity('audio', `[配音] Warm Narrator Sketch`, audioOutput, '', audioOutput.audio_url)}
                      className="bg-transparent border border-[var(--editorial-stroke)] hover:bg-[var(--editorial-stroke)] hover:text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer"
                    >
                      <span>分享社区</span>
                    </button>
                  </div>

                  {/* Mechanical Audio Synth block */}
                  <div className="bg-[var(--editorial-bg)]/20 border border-[var(--editorial-stroke)]/40 p-5 relative overflow-hidden flex flex-col gap-4 font-mono shadow-inner">
                    <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)]/40 pb-2 text-[9px] text-[var(--editorial-text-gray)]">
                      <span>AUDIO_SYNTH_DECK: [READY]</span>
                      <span className={loading ? "animate-pulse text-indigo-500 font-bold" : "text-emerald-600 font-bold"}>
                        {loading ? "RENDER_ACTIVE" : "STANDBY"}
                      </span>
                    </div>

                    {/* Zebra warning loader */}
                    {loading ? (
                      <div className="h-10 w-full editorial-loader-bar flex items-center justify-center border-none">
                        <span className="bg-[var(--editorial-accent-yellow)] text-black text-[8px] font-black border border-black px-2 py-0.5 animate-pulse">
                          SOUNDWAVE CALCULATING...
                        </span>
                      </div>
                    ) : (
                      /* Waveforms */
                      <div className="h-10 flex items-end gap-1 border-b border-[var(--editorial-stroke)]/20 pb-2">
                        {Array.from({ length: 24 }).map((_, idx) => {
                          const heights = ['h-2', 'h-8', 'h-10', 'h-6', 'h-3', 'h-9', 'h-5', 'h-2', 'h-6', 'h-8', 'h-4', 'h-2'];
                          return (
                            <span
                              key={idx}
                              className={`flex-grow bg-[var(--editorial-stroke)]/80 transition-all ${heights[idx % heights.length]}`}
                            ></span>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-[9px] text-[var(--editorial-text-gray)] font-mono uppercase">
                      <div>声线 Speaker: <span className="text-[var(--editorial-text)] font-bold">{audioOutput.voice_id}</span></div>
                      <div>语速 Tempo: <span className="text-[var(--editorial-text)] font-bold">{audioOutput.speed}x</span></div>
                      <div>旁白字数: <span className="text-[var(--editorial-text)] font-bold">{audioOutput.text_length} 字符</span></div>
                      <div>估计时长: <span className="text-[var(--editorial-text)] font-bold">~{audioOutput.estimated_audio_duration_seconds}S</span></div>
                    </div>
                  </div>

                  {/* Player node */}
                  <div className="border border-[var(--editorial-stroke)]/60 bg-[var(--editorial-bg)]/20 p-3">
                    <span className="text-[8px] font-black text-[var(--editorial-text-gray)] uppercase block mb-1.5">// SOUND STREAM PLAYER</span>
                    {loading ? (
                      <div className="p-2 border border-[var(--editorial-stroke)]/40 text-[9px] text-center font-bold text-[var(--editorial-text-gray)] animate-pulse bg-[var(--editorial-paper)]">
                        LOADING STREAMING AUDIO PIPELINE...
                      </div>
                    ) : (
                      <audio
                        key={audioOutput.audio_url}
                        controls
                        className="w-full h-8 outline-none rounded-none bg-transparent"
                      >
                        <source src={audioOutput.audio_url} type="audio/mpeg" />
                        Your browser does not support the audio element.
                      </audio>
                    )}
                  </div>

                  {/* Polaroid write area */}
                  <div className="absolute bottom-3 left-6 right-6 flex justify-between items-center text-[9px] font-mono text-[var(--editorial-text-gray)] uppercase border-t border-dashed border-[var(--editorial-stroke)]/40 pt-2.5 mt-2">
                    <span>SEED: 120489-TTS</span>
                    <span>DECK: [MANUSCRIPT_TTS]</span>
                  </div>
                </div>

                <AgentTerminal logs={agentLogs} />
              </div>
            </div>
          )}

          {/* ==================== 5. COMMUNITY Gallery Feed WORKSPACE ==================== */}
          {activeTab === 'community' && (
            <div className="flex flex-col gap-8 font-mono">
              
              <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial relative">
                
                <div>
                  <h3 className="text-sm font-black text-[var(--editorial-text)] flex items-center gap-2 font-mono uppercase">
                    <span>品牌灵感搜索</span>
                  </h3>
                  <p className="text-[10px] text-[var(--editorial-text-gray)] mt-1.5 leading-relaxed font-bold">
                    从过往作品中快速找出相近素材、表达方式和视觉方向，方便继续沿用品牌设定。
                  </p>
                </div>

                <form onSubmit={handleRAGSearch} className="flex gap-3 mt-4">
                  <div className="relative flex-grow">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] px-1 py-3 text-xs focus:outline-none focus:border-b-2 transition-all font-semibold font-mono"
                      placeholder="输入关键词，例如：小红书咖啡、视觉工作区、文案神器"
                    />
                  </div>
                  
                  <button
                    type="submit"
                    className="bg-[var(--editorial-stroke)] text-[var(--editorial-bg)] border border-[var(--editorial-stroke)] font-black px-6 py-3 text-xs transition-all shadow-editorial active:shadow-none active:translate-x-[3px] active:translate-y-[3px] cursor-pointer"
                  >
                    <span>搜索灵感</span>
                  </button>
                </form>

                {isRagActive && ragLogs.length > 0 && (
                  <div className="bg-[var(--editorial-bg)]/40 border border-[var(--editorial-stroke)]/40 p-4 mt-3">
                    <span className="text-[10px] text-[var(--editorial-text-gray)] font-black block">
                      已完成素材对齐，共返回 {communityItems.length} 条相近作品。
                    </span>
                  </div>
                )}
              </div>

              {/* Creations gallery list */}
              <div>
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-sm font-black text-[var(--editorial-text)] flex items-center gap-2 font-mono uppercase">
                    <span>CREATOR MANUSCRIPTS FEED</span>
                  </h3>
                  {isRagActive && (
                    <button 
                      onClick={() => {
                        setSearchQuery('');
                        setIsRagActive(false);
                        fetchCommunity();
                      }}
                      className="text-xs text-[var(--editorial-accent-blue)] hover:underline font-bold"
                    >
                      [ 显示全部作品 ]
                    </button>
                  )}
                </div>

                {communityItems.length === 0 ? (
                  <div className="text-center py-16 bg-[var(--editorial-bg)]/40 border border-dashed border-[var(--editorial-stroke)]/45">
                    <p className="text-xs text-[var(--editorial-text-gray)] font-bold font-mono">暂无分享作品，请使用 AIGC Agent 生成并分享出来！</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {communityItems.map((item, index) => {
                      // Alternating rotation classes
                      const rotations = ['rotate-[0.5deg]', 'rotate-[-0.6deg]', 'rotate-[0.4deg]', 'rotate-[-0.3deg]'];
                      const rotClass = rotations[index % rotations.length];
                      
                      return (
                        <div key={item.id} className={`bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 pb-12 shadow-editorial relative flex flex-col justify-between hover:scale-[1.01] transition-all group ${rotClass}`}>
                          
                          {/* Similarity Score Tag */}
                          {item.similarity_score !== undefined && (
                            <span className="absolute top-4 right-4 bg-[var(--editorial-accent-yellow)] border border-[var(--editorial-stroke)] text-black text-[8px] font-bold px-2 py-0.5 shadow-editorial-sm z-10">
                              SIM: {Math.round(item.similarity_score * 100)}%
                            </span>
                          )}
                          
                          <div>
                            {/* Type header */}
                            <div className="flex items-center justify-between mb-3 border-b border-dashed border-[var(--editorial-stroke)]/40 pb-2">
                              <span className="bg-[var(--editorial-unselected)] border border-[var(--editorial-stroke)]/60 px-1.5 py-0.5 text-[8px] font-black uppercase text-[var(--editorial-text)] font-mono">
                                {item.creation_type_display}
                              </span>
                              <span className="text-[8px] text-[var(--editorial-text-gray)] font-bold flex items-center gap-1 font-mono">
                                <span>{item.created_at}</span>
                              </span>
                            </div>

                            <h4 className="text-xs font-black text-[var(--editorial-text)] mb-3 line-clamp-1">{item.title}</h4>

                            {/* Content render body based on type */}
                            <div className="bg-[var(--editorial-bg)]/20 border border-[var(--editorial-stroke)]/40 p-3 text-[10px] min-h-[140px] max-h-[180px] overflow-y-auto mb-4 font-mono leading-relaxed">
                              {item.creation_type === 'copy' && (
                                <div className="space-y-2">
                                  <h5 className="font-black text-[var(--editorial-text)]">{item.content.title}</h5>
                                  {item.content.paragraphs?.map((p: string, i: number) => (
                                    <p key={i} className="text-[var(--editorial-text-gray)] font-semibold leading-relaxed">{p}</p>
                                  ))}
                                  <div className="text-[9px] text-[var(--editorial-accent-blue)] mt-2 font-bold italic">
                                    {item.content.tags?.map((t: string) => `#${t} `)}
                                  </div>
                                </div>
                              )}

                              {item.creation_type === 'image' && (
                                <div className="flex flex-col gap-2">
                                  <img
                                    src={item.image_url || 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80'}
                                    alt="Community Visual Sketch"
                                    className="h-24 w-full object-cover border border-[var(--editorial-stroke)]"
                                  />
                                  <p className="text-[9px] text-[var(--editorial-text-gray)] line-clamp-2 leading-relaxed">
                                    {item.content.revised_prompt}
                                  </p>
                                </div>
                              )}

                              {item.creation_type === 'storyboard' && (
                                <div className="space-y-2.5">
                                  {item.content.scenes?.map((scene, i) => (
                                    <div key={i} className="border-b border-[var(--editorial-stroke)]/40 pb-1.5 mb-1.5 last:border-0 last:pb-0 last:mb-0">
                                      <div className="font-black text-[8px] text-[var(--editorial-text-gray)] mb-0.5">SCENE {scene.scene_number} ({scene.duration_seconds}s)</div>
                                      <p className="text-[var(--editorial-text)] leading-snug line-clamp-2 font-semibold">{scene.visual_description}</p>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {item.creation_type === 'audio' && (
                                <div className="flex flex-col justify-center items-center py-3 gap-2">
                                  <span className="text-[8px] text-[var(--editorial-text-gray)] text-center font-bold">EST DURATION: ~{item.content.estimated_audio_duration_seconds}S</span>
                                  <audio controls className="w-full h-8 mt-1 border border-[var(--editorial-stroke)]/40 rounded-none bg-transparent">
                                    <source src={item.audio_url || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'} type="audio/mpeg" />
                                  </audio>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Polaroid bottom metadata */}
                          <div className="absolute bottom-2 left-4 right-4 flex justify-between items-center text-[8px] font-mono text-[var(--editorial-text-gray)] border-t border-dashed border-[var(--editorial-stroke)]/40 pt-2.5">
                            <span className="font-bold flex items-center gap-1">
                              <span className="h-4.5 w-4.5 bg-[var(--editorial-stroke)] text-[var(--editorial-bg)] border border-[var(--editorial-stroke)] flex items-center justify-center text-[8px] font-black uppercase">
                                {item.username.substring(0, 2)}
                              </span>
                              <span>{item.username}</span>
                            </span>
                            
                            <button
                              onClick={() => handleLike(item.id)}
                              className="bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] hover:bg-rose-500 hover:text-white px-2 py-1 font-black flex items-center gap-1.5 cursor-pointer text-black active:translate-x-[1px] active:translate-y-[1px] shadow-editorial-sm active:shadow-none transition-all"
                            >
                              <span>{item.likes}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}

          {activeTab === 'assets' && (
            <EmptyOperationalState
              icon={Grid3X3}
              title="资产库"
              description="图片、音频、文案、分镜和文档会按项目沉淀在这里。"
              actionLabel="先生成内容包"
              onAction={() => setActiveTab('content')}
            />
          )}

          {activeTab === 'review' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
                <h3 className="text-sm font-black uppercase mb-4">待审核内容</h3>
                <div className="border border-[var(--editorial-stroke)] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black">{contentPackage.title}</span>
                    <span className="text-[9px] border border-[var(--editorial-stroke)] px-2 py-0.5">待确认</span>
                  </div>
                  <p className="text-xs text-[var(--editorial-text-gray)] leading-6">{contentPackage.body}</p>
                  <button type="button" onClick={() => {
                    setContentVersion('最终稿');
                    setContentPackage((prev) => ({ ...prev, version: '最终稿' }));
                    triggerToast('已标记为最终稿', 'success');
                  }} className="btn-editorial-primary px-3 py-2 text-[10px] font-black uppercase flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    通过审阅
                  </button>
                </div>
              </section>
              <section className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
                <h3 className="text-sm font-black uppercase mb-4">版本对比</h3>
                <div className="grid grid-cols-1 gap-3 text-xs">
                  {['AI 初稿', '用户修改稿', '最终稿'].map((version) => (
                    <div key={version} className={`border p-3 ${contentVersion === version ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/40' : 'border-[var(--editorial-stroke)]/40'}`}>
                      <div className="font-black mb-1">{version}</div>
                      <p className="text-[var(--editorial-text-gray)] line-clamp-2">{contentPackage.body}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {billingPlans && (['free', 'pro', 'enterprise'] as const).map((planKey) => {
                const plan = billingPlans.plans[planKey];
                const active = billingPlans.current_plan === planKey;
                return (
                  <button key={planKey} type="button" onClick={() => handleSelectPlan(planKey)} className={`text-left bg-[var(--editorial-paper)] border-1.5 p-5 shadow-editorial-sm ${active ? 'border-[var(--editorial-stroke)]' : 'border-[var(--editorial-stroke)]/40'}`}>
                    <span className="block text-sm font-black">{plan.name}</span>
                    <span className="block mt-3 text-xs text-[var(--editorial-text-gray)]">{plan.project_limit >= 9999 ? '不限项目' : `${plan.project_limit} 个项目`} / {plan.storage_gb}GB 存储</span>
                    <span className="block mt-2 text-xs text-[var(--editorial-text-gray)]">使用自己的模型密钥抵扣 {plan.byok_discount}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ==================== 6. CONFIG ROUTER WORKSPACE ==================== */}
          {activeTab === 'config' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start font-mono">
              
              {/* Form config panel */}
              <form onSubmit={handleSaveConfig} className="col-span-1 lg:col-span-6 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial relative flex flex-col gap-5">
                <div className="flex justify-center border-b border-[var(--editorial-stroke)] pb-4">
                  <Sparkles className="h-6 w-6 text-[var(--editorial-text)]" />
                </div>
                
                <h3 className="text-sm font-black text-[var(--editorial-text)] border-b border-[var(--editorial-stroke)] pb-2 flex items-center gap-2 font-mono uppercase">
                  <span>模型接口与自有密钥</span>
                </h3>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">选择服务商</label>
                  <select
                    value={activeConfigForm.provider}
                    onChange={(e) => {
                      const provider = e.target.value;
                      setActiveConfigForm({
                        ...activeConfigForm,
                        provider,
                        config_scope: providerDefaultScope(provider),
                      });
                    }}
                    className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
                  >
                    <option value="mock">演示模式</option>
                    <option value="agnes">Agnes AI</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">配置用途</label>
                  <select
                    value={activeConfigForm.config_scope}
                    onChange={(e) => setActiveConfigForm({
                      ...activeConfigForm,
                      config_scope: e.target.value as 'all' | 'text' | 'image' | 'audio',
                    })}
                    className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
                  >
                    {Object.entries(configScopeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <p className="text-[9px] text-[var(--editorial-text-gray)] leading-relaxed">
                    不同用途可分别保存并同时激活。例如：OpenAI 仅文本 + Agnes 仅图片。
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'platform', label: '使用平台额度' },
                    { id: 'byok', label: '使用自有密钥' },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setActiveConfigForm({ ...activeConfigForm, billing_mode: mode.id })}
                      className={`border px-3 py-2 text-[10px] font-black ${
                        activeConfigForm.billing_mode === mode.id
                          ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-unselected)]'
                          : 'border-[var(--editorial-stroke)]/40'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {activeConfigForm.provider !== 'mock' && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">API KEY 密钥</label>
                      <div className="relative">
                        <input
                          type={showKey ? "text" : "password"}
                          value={activeConfigForm.api_key}
                          onChange={(e) => setActiveConfigForm({ ...activeConfigForm, api_key: e.target.value })}
                          className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono"
                          placeholder="请输入 API Key（留空则保留已保存的密钥）"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-0 top-1/2 -translate-y-1/2 text-[9px] text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)] cursor-pointer font-bold"
                        >
                          {showKey ? '[HIDE]' : '[SHOW]'}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider flex items-center justify-between font-mono">
                        <span>自定义代理网关 Base URL</span>
                        <span className="text-[8px] text-[var(--editorial-text-gray)] lowercase tracking-normal">可选配置</span>
                      </label>
                      <input
                        type="url"
                        value={activeConfigForm.base_url}
                        onChange={(e) => setActiveConfigForm({ ...activeConfigForm, base_url: e.target.value })}
                        className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono"
                        placeholder={
                          activeConfigForm.provider === 'agnes'
                            ? 'https://apihub.agnes-ai.com/v1'
                            : 'e.g. https://api.openai-proxy.org/v1'
                        }
                      />
                    </div>

                    {activeConfigForm.config_scope !== 'image' && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider flex items-center justify-between font-mono">
                        <span>文本模型名称</span>
                        <span className="text-[8px] text-[var(--editorial-text-gray)] lowercase tracking-normal">文案 / 分镜</span>
                      </label>
                      <input
                        type="text"
                        value={activeConfigForm.model_name}
                        onChange={(e) => setActiveConfigForm({ ...activeConfigForm, model_name: e.target.value })}
                        className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono"
                        placeholder={
                          activeConfigForm.provider === 'agnes'
                            ? 'agnes-2.0-flash'
                            : activeConfigForm.provider === 'gemini'
                              ? 'gemini-1.5-flash'
                              : activeConfigForm.provider === 'anthropic'
                                ? 'claude-3-5-sonnet'
                                : 'gpt-4o-mini'
                        }
                      />
                    </div>
                    )}

                    {providerSupportsImageConfig(activeConfigForm.provider)
                      && (activeConfigForm.config_scope === 'all' || activeConfigForm.config_scope === 'image') && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider flex items-center justify-between font-mono">
                        <span>图片模型名称</span>
                        <span className="text-[8px] text-[var(--editorial-text-gray)] lowercase tracking-normal">图片任务专用</span>
                      </label>
                      <input
                        type="text"
                        value={activeConfigForm.image_model_name}
                        onChange={(e) => setActiveConfigForm({ ...activeConfigForm, image_model_name: e.target.value })}
                        className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono"
                        placeholder={
                          activeConfigForm.provider === 'agnes'
                            ? 'agnes-image-2.0-flash'
                            : activeConfigForm.provider === 'openai'
                              ? 'dall-e-3'
                              : 'image-model'
                        }
                      />
                    </div>
                    )}
                  </>
                )}

                {/* Lead save action */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {loading ? (
                    <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                  ) : null}
                  <span>保存并激活配置</span>
                </button>
              </form>

              {/* Status list */}
              <div className="col-span-1 lg:col-span-6 flex flex-col gap-6 font-mono">
                <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial relative flex flex-col gap-4">
                  
                  <h4 className="text-sm font-black text-[var(--editorial-text)] border-b border-[var(--editorial-stroke)] pb-2 flex items-center gap-2 font-mono uppercase">
                    <span>订阅与接口状态</span>
                  </h4>

                  {billingPlans && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {(['free', 'pro', 'enterprise'] as const).map((planKey) => {
                        const plan = billingPlans.plans[planKey];
                        const active = billingPlans.current_plan === planKey;
                        return (
                          <button
                            key={planKey}
                            type="button"
                            onClick={() => handleSelectPlan(planKey)}
                            className={`text-left border-1.5 p-3 transition-all ${
                              active
                                ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/40 shadow-editorial-sm'
                                : 'border-dashed border-[var(--editorial-stroke)]/40 hover:border-[var(--editorial-stroke)]'
                            }`}
                          >
                            <span className="block text-xs font-black">{plan.name}</span>
                            <span className="block mt-2 text-[9px] text-[var(--editorial-text-gray)]">
                              {plan.project_limit >= 9999 ? '不限项目' : `${plan.project_limit} 个项目`} / {plan.storage_gb}GB
                            </span>
                            <span className="block mt-1 text-[9px] text-[var(--editorial-text-gray)]">
                              自有密钥抵扣 {plan.byok_discount}
                            </span>
                          </button>
                        );
                      })}
                      <div className="md:col-span-3 text-[10px] text-[var(--editorial-text-gray)]">
                        当前项目数：{billingPlans.project_count} / {billingPlans.current_limits.project_limit >= 9999 ? '不限' : billingPlans.current_limits.project_limit}
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    {aiConfigs.map((config) => (
                      <div key={config.id} className={`p-4 border-1.5 flex items-center justify-between ${
                        config.is_active 
                          ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/40 text-[var(--editorial-text)]' 
                          : 'border-dashed border-[var(--editorial-stroke)]/40 bg-[var(--editorial-paper)] text-[var(--editorial-text-gray)]'
                      }`}>
                        <div>
                          <span className="text-xs font-black block">{config.provider_display}</span>
                          <div className="flex items-center gap-2.5 mt-1 text-[8px] font-bold uppercase font-mono flex-wrap">
                            <span>{config.config_scope_display || configScopeLabels[config.config_scope || 'all']}</span>
                            <span>•</span>
                            <span>Key: {config.api_key_masked || 'Unset'}</span>
                            {config.model_name && config.config_scope !== 'image' && (
                              <>
                                <span>•</span>
                                <span>Text: {config.model_name}</span>
                              </>
                            )}
                            {config.image_model_name && (
                              <>
                                <span>•</span>
                                <span>Image: {config.image_model_name}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>{config.billing_mode === 'byok' ? '自有密钥' : '平台额度'}</span>
                          </div>
                        </div>
                        {config.is_active ? (
                          <span className="bg-[var(--editorial-stroke)] text-[var(--editorial-bg)] text-[8px] font-black px-2 py-0.5 border border-[var(--editorial-stroke)]">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="bg-transparent text-[var(--editorial-text-gray)] text-[8px] font-bold px-2 py-0.5 border border-dashed border-[var(--editorial-stroke)]/40">
                            STANDBY
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="border border-dashed border-[var(--editorial-stroke)]/40 bg-[var(--editorial-bg)]/40 p-4 text-[10px] text-[var(--editorial-text-gray)] font-medium leading-relaxed mt-2">
                    <span className="font-bold text-[var(--editorial-text)] block mb-1">计费说明</span>
                    1. 使用自有密钥时，平台只保留必要的配置记录，生成消耗走您自己的模型账户。
                    <br />
                    2. 未配置密钥时，系统会使用演示模式，便于本地试用和流程演练。
                    <br />
                    3. 文本与图片可分别配置不同服务商，同一用途下保存时会替换该用途的旧配置。
                  </div>
                </div>
              </div>

            </div>
          )}

          </div>
          {showAppRightPanel && (
            <aside className={`${activeTab === 'builder' ? 'fixed right-4 top-24 z-40 w-[320px] max-h-[calc(100vh-7rem)] overflow-y-auto' : 'sticky top-6'} bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial-sm p-4 space-y-4`}>
              <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-3">
                <h3 className="text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">上下文面板</h3>
                <button type="button" onClick={() => setRightPanelOpen(false)} className="text-[9px] font-black hover:text-rose-500" aria-label="隐藏上下文面板">隐藏</button>
              </div>

              <section className="border border-[var(--editorial-stroke)] p-3">
                <div className="text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">当前项目</div>
                <h4 className="text-sm font-black">{workspaceScope?.project.name || '未选择项目'}</h4>
                <p className="text-[10px] text-[var(--editorial-text-gray)] leading-5 mt-2">{workspaceScope?.project.brief || '先创建或选择项目，再开始生成内容包。'}</p>
                <button type="button" onClick={() => setActiveTab('projects')} className="mt-3 w-full border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)] flex items-center justify-center gap-1.5">
                  管理项目 <ChevronRight className="h-3 w-3" />
                </button>
              </section>

              <section className="border border-[var(--editorial-stroke)] p-3">
                <div className="text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">任务队列</div>
                {latestTask ? (
                  <div className="space-y-2 text-[10px]">
                    <div className="flex justify-between"><span>生成任务 #{latestTask.id}</span><span>{latestTask.status}</span></div>
                    <p className="text-[var(--editorial-text-gray)] leading-5">
                      {latestTask.status === 'queued' && '正在排队处理，本次任务预计需要约 8 秒。'}
                      {latestTask.status === 'running' && '正在根据品牌记忆生成内容。'}
                      {latestTask.status === 'succeeded' && '任务已完成，可保存到资产库或加入审阅。'}
                      {latestTask.status === 'failed' && (latestTask.error_message || '生成失败，可重试、换模型或减少输入长度。')}
                    </p>
                  </div>
                ) : (
                  <p className="text-[10px] text-[var(--editorial-text-gray)] leading-5">暂无生成任务。生成内容包后会在这里显示排队、生成和失败原因。</p>
                )}
              </section>

              <section className="border border-[var(--editorial-stroke)] p-3">
                <div className="text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">用量摘要</div>
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">任务</span><b>{dashboardSnapshot?.metrics.task_count ?? 0}</b></div>
                  <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">资产</span><b>{dashboardSnapshot?.metrics.asset_count ?? 0}</b></div>
                  <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">成功</span><b>{dashboardSnapshot?.metrics.successful_tasks ?? 0}</b></div>
                  <div className="border border-[var(--editorial-stroke)]/40 p-2"><span className="block text-[var(--editorial-text-gray)]">失败</span><b>{dashboardSnapshot?.metrics.failed_tasks ?? 0}</b></div>
                </div>
                <button type="button" onClick={() => setActiveTab('billing')} className="mt-3 w-full border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">查看计费详情</button>
              </section>

              <section className="border border-[var(--editorial-stroke)] p-3">
                <div className="text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">当前内容包</div>
                <p className="text-[10px] font-black leading-5">{contentPackage.title}</p>
                <p className="text-[10px] text-[var(--editorial-text-gray)] leading-5 mt-1">{contentPackage.platform} / {contentPackage.version}</p>
                <button type="button" onClick={() => setActiveTab('content')} className="mt-3 w-full border border-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black hover:bg-[var(--editorial-unselected)]">继续编辑</button>
              </section>
            </aside>
          )}
        </div>

        {/* Paper style footer */}
        <footer className="w-full border-t border-[var(--editorial-stroke)]/45 py-4 mt-6 flex flex-col md:flex-row justify-between items-center gap-4 text-[9px] font-mono font-bold text-[var(--editorial-text-gray)] uppercase">
          <span>© 2026 MARKETING-HUB DRAFTBOOK INC. ALL RIGHTS RESERVED.</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-[var(--editorial-text)] transition-all">[TERMS]</a>
            <span>//</span>
            <a href="#" className="hover:text-[var(--editorial-text)] transition-all">[PRIVACY]</a>
            <span>//</span>
            <a href="#" className="hover:text-[var(--editorial-text)] transition-all">[SUPPORT]</a>
          </div>
        </footer>

      </main>

    </div>
  );
}

function AgentTerminal({ logs }: { logs: string[] }) {
  const [open, setOpen] = useState(true);
  const hasActivity = logs.length > 0;
  
  return (
    <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] overflow-hidden shadow-editorial transform rotate-[0.1deg]">
      <button 
        onClick={() => setOpen(!open)}
        className="w-full bg-[var(--editorial-unselected)] px-5 py-3 border-b-1.5 border-[var(--editorial-stroke)] flex items-center justify-between text-[10px] font-black text-[var(--editorial-text)] font-mono tracking-wider cursor-pointer transition-all"
      >
        <span className="flex items-center gap-2">
          <span>创作进度</span>
        </span>
        <span className="text-[9px] bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] px-2 py-0.5 font-bold">
          {open ? '收起' : '展开'}
        </span>
      </button>

      {open && (
        <div className="bg-[var(--editorial-bg)]/60 p-4 font-mono text-[9px] leading-relaxed text-[var(--editorial-text)] max-h-[140px] overflow-y-auto pr-1 border-t border-[var(--editorial-stroke)]">
          <div className="space-y-2">
            <div className="flex items-center justify-between border border-[var(--editorial-stroke)]/30 px-3 py-2">
              <span>{hasActivity ? '素材已整理完成' : '等待开始创作'}</span>
              <span className={hasActivity ? 'text-emerald-600 font-black' : 'text-[var(--editorial-text-gray)]'}>{hasActivity ? '完成' : '待处理'}</span>
            </div>
            <div className="flex items-center justify-between border border-[var(--editorial-stroke)]/30 px-3 py-2">
              <span>品牌设定同步</span>
              <span className="text-emerald-600 font-black">{hasActivity ? '已同步' : '准备中'}</span>
            </div>
            <div className="text-[var(--editorial-text-gray)] leading-relaxed">
              {hasActivity ? '已根据当前输入生成结果，可继续修改参数或发布到作品库。' : '点击生成后，这里会显示面向创作者的进度摘要。'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyOperationalState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: typeof Grid3X3;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-8 shadow-editorial-sm min-h-[360px] flex flex-col items-center justify-center text-center gap-4">
      <Icon className="h-8 w-8 text-[var(--editorial-text-gray)]" aria-hidden="true" />
      <div>
        <h3 className="text-sm font-black uppercase">{title}</h3>
        <p className="text-xs text-[var(--editorial-text-gray)] mt-2 max-w-md leading-6">{description}</p>
      </div>
      <button type="button" onClick={onAction} className="btn-editorial-primary px-4 py-2 text-[10px] font-black uppercase">
        {actionLabel}
      </button>
    </div>
  );
}

function OnboardingModal({
  state,
  step,
  setState,
  setStep,
  onClose,
  onComplete,
}: {
  state: OnboardingState;
  step: number;
  setState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  setStep: React.Dispatch<React.SetStateAction<number>>;
  onClose: () => void;
  onComplete: () => void;
}) {
  const steps = ['使用场景', '创建品牌', '选择渠道', '起始模板', '生成内容包'];
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial p-6">
        <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-4">
          <div>
            <h2 className="text-lg serif-header font-bold">首次使用引导</h2>
            <p className="text-[10px] text-[var(--editorial-text-gray)] mt-1">5 步完成第一轮内容生成，后续可以再补品牌细节。</p>
          </div>
          <button type="button" onClick={onClose} className="text-xs font-black hover:text-rose-500" aria-label="关闭首次使用引导">关闭</button>
        </div>

        <div className="flex flex-wrap gap-2 my-5">
          {steps.map((label, index) => (
            <button key={label} type="button" onClick={() => setStep(index)} className={`border px-3 py-1.5 text-[10px] font-black ${step === index ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-unselected)]' : 'border-[var(--editorial-stroke)]/40'}`}>
              {index + 1}. {label}
            </button>
          ))}
        </div>

        <div className="min-h-[300px]">
          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {useCaseChoices.map((choice) => (
                <button key={choice} type="button" onClick={() => setState((prev) => ({ ...prev, useCase: choice }))} className={`border p-4 text-left text-sm font-black ${state.useCase === choice ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/50' : 'border-[var(--editorial-stroke)]/40'}`}>
                  {choice}
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                ['brandName', '品牌名称'],
                ['industry', '行业'],
                ['audience', '目标人群'],
                ['tone', '语调'],
                ['forbiddenWords', '禁用词'],
                ['referenceLinks', '参考链接'],
              ].map(([key, label]) => (
                <label key={key} className="flex flex-col gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
                  {label}
                  <input value={String(state[key as keyof OnboardingState] || '')} onChange={(event) => setState((prev) => ({ ...prev, [key]: event.target.value }))} className="border border-[var(--editorial-stroke)] bg-transparent px-3 py-2 text-xs font-normal focus:outline-none" />
                </label>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {channelChoices.map((channel) => {
                const active = state.channels.includes(channel);
                return (
                  <button key={channel} type="button" onClick={() => setState((prev) => ({ ...prev, channels: active ? prev.channels.filter((item) => item !== channel) : [...prev.channels, channel] }))} className={`border p-4 text-left text-sm font-black ${active ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/50' : 'border-[var(--editorial-stroke)]/40'}`}>
                    {channel}
                  </button>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {templateChoices.map((template) => (
                <button key={template} type="button" onClick={() => setState((prev) => ({ ...prev, template }))} className={`border p-4 text-left text-sm font-black ${state.template === template ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/50' : 'border-[var(--editorial-stroke)]/40'}`}>
                  {template}
                </button>
              ))}
            </div>
          )}

          {step === 4 && (
            <label className="flex flex-col gap-2 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
              第一份内容包 brief
              <textarea value={state.brief} onChange={(event) => setState((prev) => ({ ...prev, brief: event.target.value }))} rows={7} className="border border-[var(--editorial-stroke)] bg-transparent p-3 text-xs font-normal resize-none focus:outline-none" />
            </label>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--editorial-stroke)] pt-4">
          <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0} className="border border-[var(--editorial-stroke)] px-4 py-2 text-[10px] font-black disabled:opacity-40">
            上一步
          </button>
          <button type="button" onClick={() => isLast ? onComplete() : setStep((value) => Math.min(steps.length - 1, value + 1))} className="btn-editorial-primary px-4 py-2 text-[10px] font-black uppercase">
            {isLast ? '生成第一份内容包' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  );
}
