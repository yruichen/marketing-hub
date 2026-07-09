import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { LoginPortal } from './features/auth';
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  CheckCircle2,
  Clock3,
  ChevronDown,
  Loader2,
  Menu,
  PanelRight,
  UserCircle,
  XCircle,
} from 'lucide-react';
import { apiFetch, ensureCsrfToken, buildErrorToast, formatErrorForToast, parseApiErrorResponse, type ErrorActionId, type ToastMessage } from './hooks/useApi';
import Toast from './components/Toast';
import { pathForSection, sectionFromPath } from './app/routes';
import { FULL_HEIGHT_WORKSPACE_TABS, TAB_META } from './app/navigation';
import { AppSidebar } from './components/AppSidebar';
import { ProjectManager } from './features/projects';
import { AssetsLibrary } from './features/assets';
import { publishAssetToCommunity } from './features/assets/publishAssetToCommunity';
import { CopyPanel, ImagePanel, StoryboardPanel, AudioPanel, VideoPanel } from './features/generation';
import { taskTypeLabels, type CreationContent, type StoryboardOutput } from './features/generation';
import { ContentPackagePanel, buildContentPackage, buildContentPackageRequest } from './features/content-package';
import type { ContentPackage } from './features/generation';
import { TemplateLibraryPage } from './features/community';
import { ProfilePage } from './features/profile';
import { DashboardPage, useDashboardSnapshot, useWorkspaceScope } from './features/dashboard';
import { AiConfigPage } from './features/ai-config';
import { BillingPage } from './features/billing';
import { AdminConsolePage } from './features/admin-console';
import { ReviewPage } from './features/review';
import { ContextPanel } from './features/context-panel';
import { OnboardingModal, onboardingDefaults } from './features/onboarding';
import type { OnboardingState } from './features/onboarding';
import { GlobalSearchBox, type GlobalSearchResult } from './features/search';
import {
  AssistantBubble,
  AssistantPanel,
  PageContextTracker,
  type PageContext,
} from './features/assistant';
import { useUiStore, type AppSection } from './shared/stores/uiStore';
import type { AssetRecord, CampaignRecord, ProjectRecord, GenerationTaskRecord, BillingPlanResponse } from './types/workspace';

const WorkflowBuilder = lazy(() =>
  import('./features/workflows').then((module) => ({ default: module.WorkflowBuilder })),
);
const BrainstormPage = lazy(() =>
  import('./features/brainstorm').then((module) => ({ default: module.BrainstormPage })),
);

const loginSchema = z.object({
  username: z.string().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

type AuthMeResponse = {
  authenticated: boolean;
  username?: string;
  email?: string;
  admin_mode?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
  demo_account?: boolean;
  organization?: string;
  project?: string;
  campaign?: number;
  role?: string;
  policy_consents?: {
    requires_consent: boolean;
    missing?: Array<{
      policy_type: string;
      version: string;
      title: string;
      content_url: string;
    }>;
  };
};

type TopbarNotification = {
  id: string;
  kind: 'processing' | 'success' | 'warning' | 'system';
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
};

const ENABLE_DEMO_LOGIN = import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true' || import.meta.env.DEV;
const DEMO_USERNAME = import.meta.env.VITE_DEMO_USERNAME || 'DEMO';
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || '123';

const ACTIVE_TASK_STATUSES = new Set(['queued', 'running']);

function uniqueTasks(tasks: GenerationTaskRecord[]) {
  const seen = new Set<number>();
  return tasks.filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
}

function taskLabel(task: GenerationTaskRecord) {
  return `${taskTypeLabels[task.task_type] ?? task.task_type} #${task.id}`;
}

function relativeTime(value?: string | null) {
  if (!value) return '刚刚';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '刚刚';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s 前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m 前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h 前`;
  return `${Math.floor(hours / 24)}d 前`;
}

function NotificationIcon({ kind }: { kind: TopbarNotification['kind'] }) {
  if (kind === 'processing') return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--info-accent)]" />;
  if (kind === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success-accent)]" />;
  if (kind === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-[var(--danger-accent)]" />;
  return <Activity className="h-3.5 w-3.5 text-[var(--warning-accent)]" />;
}

function profileUsernameFromPath(pathname: string) {
  if (!pathname.startsWith('/profile/')) return null;
  const raw = pathname.replace(/^\/profile\/?/, '').split('/')[0];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const LEGAL_COPY: Record<string, { title: string; body: string[] }> = {
  terms: {
    title: '服务条款（Beta）',
    body: [
      '这是 Marketing Hub beta 阶段的服务条款占位页，用于测试版本追踪和用户同意流程。',
      '正式上线前，服务范围、账户责任、可接受使用、AI 输出责任、暂停/终止、免责声明和争议处理条款必须由法务复核后替换。',
      '当前产品中的 AI 生成内容均为初稿，发布前需要用户自行进行真实性、合法性、广告合规和知识产权审核。',
    ],
  },
  privacy: {
    title: '隐私政策（Beta）',
    body: [
      '这是 Marketing Hub beta 阶段的隐私政策占位页，用于测试个人信息告知、版本追踪和同意记录。',
      '正式上线前，需要补齐运营主体、联系方式、数据类型、处理目的、保存期限、第三方共享、跨境数据和用户权利流程。',
      '平台会处理账号信息、组织成员信息、项目/品牌上下文、生成输入输出、素材、AI provider 调用记录、审计日志和额度记录。',
    ],
  },
  'ai-usage': {
    title: 'AI 生成内容使用规则（Beta）',
    body: [
      'AI 输出仅作为营销内容初稿，不构成平台对广告真实性、合规性、版权或商业效果的担保。',
      '用户公开发布前必须进行人工审核，高风险行业内容应经过专业人士复核。',
    ],
  },
  community: {
    title: '社区发布规则（Beta）',
    body: [
      '社区内容不得包含违法、侵权、虚假广告、未授权素材、个人敏感信息或规避审核的内容。',
      '被举报内容可被临时隐藏、下架并进入复核流程。',
    ],
  },
  'asset-rights': {
    title: '素材上传授权声明（Beta）',
    body: [
      '上传素材前，用户必须确认其拥有权利或已取得在工作区内使用、编辑、生成和发布所需授权。',
      '未经授权的商标、肖像、字体、音乐、图片和视频素材不得用于公开模板或社区内容。',
    ],
  },
  billing: {
    title: '订阅、额度、退款和发票规则（Beta）',
    body: [
      '正式收费前必须明确价格、额度消耗、超额策略、退款、取消、发票和税务说明。',
      '当前 beta 文本仅用于产品流程验证，不作为正式商业收费条款。',
    ],
  },
  byok: {
    title: 'BYOK 数据处理和密钥安全说明（Beta）',
    body: [
      '用户配置自有模型 key 时，应确认其遵守第三方 provider 的服务条款和数据处理规则。',
      '平台应加密存储 key，不在日志和响应中输出明文 key，并支持删除和轮换。',
    ],
  },
};

function LegalPage({ slug, onBack }: { slug: string; onBack: () => void }) {
  const doc = LEGAL_COPY[slug] || LEGAL_COPY.terms;
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] px-4 py-8 text-[var(--editorial-text)]">
      <section className="mx-auto max-w-3xl border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-6 shadow-[8px_8px_0_var(--editorial-stroke)]">
        <span className="font-mono text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">Marketing Hub Legal</span>
        <h1 className="serif-header mt-3 text-3xl font-black">{doc.title}</h1>
        <div className="mt-5 grid gap-4 text-sm font-semibold leading-7 text-[var(--editorial-text-muted)]">
          {doc.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
        <div className="mt-6 border-t border-dashed border-[var(--editorial-stroke)] pt-4 text-xs font-bold text-[var(--danger-accent)]">
          Beta 占位文本，不构成正式法律意见；公开上线前必须由律师复核替换。
        </div>
        <button type="button" onClick={onBack} className="mt-5 border border-[var(--editorial-stroke)] bg-[var(--editorial-stroke)] px-4 py-2 font-mono text-xs font-black text-[var(--editorial-bg)]">
          返回
        </button>
      </section>
    </main>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    activeSection,
    setActiveSection,
    rightPanelOpen,
    setRightPanelOpen,
    darkMode: storedDarkMode,
    setDarkMode: setStoredDarkMode,
  } = useUiStore();

  const [darkMode, setDarkMode] = useState<boolean>(() => storedDarkMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarToggled, setSidebarToggled] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'authenticated' | 'anonymous'>('checking');
  const mainRef = useRef<HTMLElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const [username, setUsername] = useState<string | null>(localStorage.getItem('mh_username'));
  const [authUser, setAuthUser] = useState<AuthMeResponse | null>(null);
  const [authError, setAuthError] = useState('');
  const [routeSynced, setRouteSynced] = useState(false);
  const [resetPasswordToken, setResetPasswordToken] = useState('');
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordError, setResetPasswordError] = useState('');
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: ENABLE_DEMO_LOGIN ? { username: DEMO_USERNAME, password: DEMO_PASSWORD } : { username: '', password: '' },
  });

  const routeSection = sectionFromPath(location.pathname);
  const routeProfileUsername = profileUsernameFromPath(location.pathname);
  const isAdminLoginRoute = location.pathname.startsWith('/admin-login');
  const isLegalRoute = location.pathname.startsWith('/legal/');
  const isTemplateLibraryRoute = location.pathname.startsWith('/templates');
  const legalSlug = location.pathname.replace(/^\/legal\/?/, '').split('/')[0] || 'terms';
  const activeTab = routeSynced ? activeSection : routeSection;
  const sidebarOpen = activeTab === 'brainstorm' ? sidebarToggled : true;
  const sidebarIconOnly = activeTab !== 'brainstorm' && sidebarCollapsed;
  const rightPanelAvailable = activeTab !== 'builder';
  const showAppRightPanel = rightPanelOpen && activeTab !== 'builder';
  const showInlineRightPanel = rightPanelOpen && activeTab !== 'builder';

  const [globalSearch, setGlobalSearch] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem('mh_onboarding_complete') !== 'true');
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);
  const [onboardingError, setOnboardingError] = useState('');
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [headerOpen, setHeaderOpen] = useState(true);

  const [onboarding, setOnboarding] = useState<OnboardingState>(onboardingDefaults);
  const [contentPackage, setContentPackage] = useState<ContentPackage>(() => {
    return buildContentPackage(
      { onboarding, copyInput: { brandName: 'Marketing-Hub', description: onboardingDefaults.brief, tone: onboardingDefaults.tone, platform: '小红书' }, workspaceScope: null, contentBrief: onboardingDefaults.brief },
      onboardingDefaults.brief,
    );
  });
  const [contentVersion, setContentVersion] = useState<'AI 初稿' | '用户修改稿' | '最终稿'>('AI 初稿');
  const [latestStoryboardOutput, setLatestStoryboardOutput] = useState<StoryboardOutput | null>(null);

  const [loading, setLoading] = useState(false);
  const [apiLive, setApiLive] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<ToastMessage | null>(null);
  const [latestTask, setLatestTask] = useState<GenerationTaskRecord | null>(null);
  const [retryingTaskId, setRetryingTaskId] = useState<number | null>(null);
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [billingPlans, setBillingPlans] = useState<BillingPlanResponse | null>(null);

  const setActiveTab = useCallback((tab: AppSection) => {
    setActiveSection(tab);
    navigate(pathForSection(tab));
  }, [navigate, setActiveSection]);

  // Workspace & dashboard state (shared across panels)
  const { workspaceScope, fetchWorkspaceBootstrap, selectProjectScope } = useWorkspaceScope(username);
  const { dashboardSnapshot, fetchDashboard } = useDashboardSnapshot(username);
  const recentTasks = useMemo(() => dashboardSnapshot?.recent_tasks ?? [], [dashboardSnapshot?.recent_tasks]);
  const activeTasks = useMemo(
    () => uniqueTasks([
      ...(latestTask && ACTIVE_TASK_STATUSES.has(latestTask.status) ? [latestTask] : []),
      ...recentTasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status)),
    ]).slice(0, 5),
    [latestTask, recentTasks],
  );
  const failedTasks = useMemo(
    () => uniqueTasks([
      ...(latestTask?.status === 'failed' ? [latestTask] : []),
      ...recentTasks.filter((task) => task.status === 'failed'),
    ]).slice(0, 4),
    [latestTask, recentTasks],
  );
  const completedTasks = useMemo(
    () => uniqueTasks([
      ...(latestTask?.status === 'succeeded' ? [latestTask] : []),
      ...recentTasks.filter((task) => task.status === 'succeeded'),
    ]).slice(0, 3),
    [latestTask, recentTasks],
  );
  const activeTaskCount = dashboardSnapshot?.metrics.active_task_count
    ?? ((dashboardSnapshot?.metrics.queued_tasks ?? 0) + (dashboardSnapshot?.metrics.running_tasks ?? 0));
  const notificationItems = useMemo<TopbarNotification[]>(() => {
    const items: TopbarNotification[] = [];
    if (activeTaskCount > 0) {
      items.push({
        id: 'active-tasks',
        kind: 'processing',
        title: `${activeTaskCount} 个任务正在处理`,
        detail: activeTasks[0] ? `${taskLabel(activeTasks[0])} · ${activeTasks[0].status === 'running' ? '运行中' : '排队中'}` : '队列仍在推进',
        actionLabel: '查看队列',
        onAction: () => {
          setRightPanelOpen(true);
          setActiveTab('dashboard');
        },
      });
    }
    failedTasks.forEach((task) => {
      items.push({
        id: `failed-${task.id}`,
        kind: 'warning',
        title: `${taskLabel(task)} 失败`,
        detail: task.error_message || '模型、网络或输入内容可能需要检查。',
        actionLabel: '查看详情',
        onAction: () => {
          setRightPanelOpen(true);
          setActiveTab('dashboard');
        },
      });
    });
    completedTasks.slice(0, Math.max(0, 3 - items.length)).forEach((task) => {
      items.push({
        id: `done-${task.id}`,
        kind: 'success',
        title: `${taskLabel(task)} 已完成`,
        detail: `${relativeTime(task.completed_at || task.updated_at || task.created_at)} · 可继续审阅或沉淀为资产。`,
        actionLabel: '查看结果',
        onAction: () => {
          setRightPanelOpen(true);
          setActiveTab('dashboard');
        },
      });
    });
    if (!apiLive) {
      items.push({
        id: 'api-health',
        kind: 'system',
        title: '后端连接未确认',
        detail: '部分生成、任务状态和通知可能延迟刷新。',
        actionLabel: '重新检查',
        onAction: () => {
          void ensureCsrfToken()
            .then(() => setApiLive(true))
            .catch(() => setApiLive(false));
        },
      });
    }
    if (!authUser?.email) {
      items.push({
        id: 'profile-email',
        kind: 'system',
        title: '账户资料不完整',
        detail: '建议补齐邮箱，便于接收团队和系统通知。',
        actionLabel: '账户状态',
        onAction: () => setActiveTab('dashboard'),
      });
    }
    return items.slice(0, 8);
  }, [activeTaskCount, activeTasks, apiLive, authUser?.email, completedTasks, failedTasks, setActiveTab, setRightPanelOpen]);
  const unreadCount = notificationItems.filter((item) => item.kind === 'warning' || item.kind === 'processing' || item.kind === 'system').length;
  const currentActiveTask = activeTasks[0] ?? null;

  // AI assistant: current page context. The tracker inside the
  // <AssistantPanel> tree just needs an object describing where the
  // user is — derive it from activeTab + workspace scope so we don't
  // hand-maintain a path→tab mapping. The tracker only reads `route`
  // + extra fields; we just push the resolved values.
  const assistantPageContext = useMemo<PageContext>(
    () => ({
      tab: activeTab,
      projectId: workspaceScope?.project.id,
      campaignId: workspaceScope?.campaign.id,
    }),
    [activeTab, workspaceScope?.project.id, workspaceScope?.campaign.id],
  );

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

  const triggerToast = useCallback((input: string | ToastMessage, type: ToastMessage['type'] = 'success') => {
    const message: ToastMessage = typeof input === 'string'
      ? { text: input, type }
      : { ...input, type: input.type || type };
    setFeedbackMsg(message);
    const duration = message.actions?.length ? 8000 : 3000;
    window.setTimeout(() => setFeedbackMsg(null), duration);
  }, []);

  const dismissToast = useCallback(() => setFeedbackMsg(null), []);

  const refreshAuthUser = useCallback(async () => {
    try {
      const response = await apiFetch('/auth/me/');
      const data = await response.json() as AuthMeResponse;
      if (!response.ok || !data.authenticated || !data.username) {
        localStorage.removeItem('mh_token');
        localStorage.removeItem('mh_username');
        setToken(null);
        setUsername(null);
        setAuthUser(null);
        setAuthStatus('anonymous');
        return null;
      }
      localStorage.setItem('mh_token', 'session');
      localStorage.setItem('mh_username', data.username);
      setToken('session');
      setUsername(data.username);
      setAuthUser(data);
      setAuthStatus('authenticated');
      return data;
    } catch {
      localStorage.removeItem('mh_token');
      localStorage.removeItem('mh_username');
      setToken(null);
      setUsername(null);
      setAuthUser(null);
      setAuthStatus('anonymous');
      return null;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshAuthUser();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshAuthUser]);

  useEffect(() => {
    const handleAuthExpired = () => {
      setToken(null);
      setUsername(null);
      setAuthUser(null);
      setAuthStatus('anonymous');
    };
    window.addEventListener('mh:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('mh:auth-expired', handleAuthExpired);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const verifyToken = params.get('verify_email');
    const resetToken = params.get('reset_password');
    if (verifyToken) {
      void (async () => {
        try {
          const response = await apiFetch('/auth/email/verify/', {
            method: 'POST',
            body: JSON.stringify({ token: verifyToken }),
          });
          const data = await response.json();
          triggerToast(data.message || (response.ok ? '邮箱验证成功' : '邮箱验证失败'), response.ok ? 'success' : 'error');
        } catch {
          triggerToast('邮箱验证失败', 'error');
        } finally {
          navigate(location.pathname, { replace: true });
        }
      })();
    }
    if (resetToken) {
      window.setTimeout(() => {
        setResetPasswordToken(resetToken);
        navigate(location.pathname, { replace: true });
      }, 0);
    }
  }, [location.pathname, location.search, navigate, triggerToast]);

  const submitPasswordReset = useCallback(async () => {
    setResetPasswordError('');
    try {
      const response = await apiFetch('/auth/password-reset/confirm/', {
        method: 'POST',
        body: JSON.stringify({ token: resetPasswordToken, password: resetPasswordValue }),
      });
      const data = await response.json();
      if (!response.ok) {
        setResetPasswordError(data.error || '密码重置失败');
        return;
      }
      setResetPasswordToken('');
      setResetPasswordValue('');
      triggerToast(data.message || '密码已重置', 'success');
    } catch {
      setResetPasswordError('连接服务器失败');
    }
  }, [resetPasswordToken, resetPasswordValue, triggerToast]);

  // AI assistant navigation handler. The assistant may also pass a
  // project_id/asset_id to deep-link into a specific project or asset
  // detail view, and a human-readable reason for the jump.
  const onAssistantNavigate = useCallback(
    (tab: string, projectId?: number, assetId?: number, reason?: string) => {
      setActiveTab(tab as AppSection);
      if (typeof projectId === 'number' && projectId > 0) {
        // Resolve the project, then push it into the workspace scope so
        // downstream panels (brief, generation, assets) re-render with
        // the new context. Best-effort: failure is silent.
        apiFetch(`/workspaces/projects/${projectId}/`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            // The detail view returns serialized project fields at the
            // top level (see ProjectDetailView.get). Only switch scope
            // when the payload looks like a real project.
            if (data && typeof data === 'object' && 'id' in data && 'slug' in data) {
              selectProjectScope(data as ProjectRecord, undefined, username);
            }
          })
          .catch(() => undefined);
      }
      if (reason) {
        triggerToast(reason, 'info');
      }
      // asset_id is reserved for a future asset-detail surface; nothing
      // to do with it yet beyond the type.
      void assetId;
    },
    [setActiveTab, selectProjectScope, username, triggerToast],
  );

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

  const acceptCurrentPolicies = useCallback(async () => {
    try {
      const response = await apiFetch('/legal/consents/', {
        method: 'POST',
        body: JSON.stringify({ policy_types: ['terms', 'privacy'], source: 'app_policy_banner' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        triggerToast(data.error || '条款同意记录失败', 'error');
        return;
      }
      await refreshAuthUser();
      triggerToast('已记录当前服务条款和隐私政策同意', 'success');
    } catch {
      triggerToast('条款同意记录失败', 'error');
    }
  }, [refreshAuthUser, triggerToast]);

  const handleErrorAction = useCallback((actionId: ErrorActionId) => {
    dismissToast();
    switch (actionId) {
      case 'open_billing':
        setActiveTab('billing');
        break;
      case 'open_ai_config':
        setActiveTab('config');
        break;
      case 'open_projects':
        setActiveTab('projects');
        break;
      case 'open_dashboard':
        setActiveTab('dashboard');
        setRightPanelOpen(true);
        break;
      case 'accept_policies':
        void acceptCurrentPolicies();
        break;
      case 'refresh_page':
        window.location.reload();
        break;
      default:
        break;
    }
  }, [acceptCurrentPolicies, dismissToast, setActiveTab, setRightPanelOpen]);

  const completeOnboarding = useCallback(async () => {
    if (onboardingSubmitting) return;
    setOnboardingSubmitting(true);
    setOnboardingError('');
    setAgentLogs(['正在保存品牌记忆...', '随后会生成第一份内容包草稿。']);

    try {
      const scope = workspaceScope ?? await fetchWorkspaceBootstrap();
      if (!scope?.organization?.slug || !scope?.project?.id) {
        throw new Error('还没有可用项目，请稍后重试或先进入「我的项目」创建项目。');
      }

      const brandContext = {
        ...(scope.project.brand_context || {}),
        brand_name: onboarding.brandName,
        industry: onboarding.industry,
        audience: onboarding.audience,
        tone: onboarding.tone,
        forbidden_words: onboarding.forbiddenWords,
        reference_links: onboarding.referenceLinks,
        preferred_channels: onboarding.channels,
        starter_template: onboarding.template,
        use_case: onboarding.useCase,
        campaign_goal: onboarding.brief,
        onboarding_completed_at: new Date().toISOString(),
      };

      const projectResponse = await apiFetch(`/projects/${scope.project.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          brief: onboarding.brief,
          brand_context: brandContext,
          platform_tags: onboarding.channels,
        }),
      });
      if (!projectResponse.ok) {
        throw await parseApiErrorResponse(projectResponse, `/projects/${scope.project.id}/`);
      }
      const updatedProject: ProjectRecord = await projectResponse.json();

      let campaign = scope.campaign;
      let createdCampaign: CampaignRecord | undefined;
      if (!campaign?.id) {
        const campaignResponse = await apiFetch('/campaigns/', {
          method: 'POST',
          body: JSON.stringify({
            project_id: updatedProject.id,
            name: `${onboarding.useCase} Launch`,
            objective: onboarding.brief,
            status: 'active',
          }),
        });
        if (campaignResponse.ok) {
          createdCampaign = await campaignResponse.json() as CampaignRecord;
          campaign = createdCampaign;
        }
      }

      selectProjectScope(updatedProject, campaign?.id ? campaign : createdCampaign, username);
      setAgentLogs((prev) => [...prev, '品牌记忆已保存到当前项目。', '正在调用 AI 生成内容包...']);

      const payload = buildContentPackageRequest({
        onboarding,
        contentBrief: onboarding.brief,
        copyInput: {
          brandName: onboarding.brandName,
          description: onboarding.brief,
          tone: onboarding.tone,
          platform: onboarding.channels[0] || '小红书',
        },
        workspaceScope: {
          ...scope,
          project: {
            ...scope.project,
            ...updatedProject,
          },
          campaign,
        },
        username,
        storyboardDuration: 30,
      });

      const packageResponse = await apiFetch('/generate/content-package/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!packageResponse.ok) {
        throw await parseApiErrorResponse(packageResponse, '/generate/content-package/');
      }
      const packageData: { content_package: ContentPackage; logs?: string[] } = await packageResponse.json();

      setContentPackage(packageData.content_package);
      setContentVersion(packageData.content_package.version || 'AI 初稿');
      setAgentLogs(packageData.logs?.length ? packageData.logs : ['已生成第一份内容包草稿。']);
      localStorage.setItem('mh_onboarding_complete', 'true');
      setShowOnboarding(false);
      setActiveTab('content');
      await fetchWorkspaceBootstrap();
      await fetchDashboard();
      triggerToast('品牌记忆已保存，并生成第一份内容包', 'success');
    } catch (err) {
      const message = formatErrorForToast(err, '首次引导保存失败，请稍后重试');
      setOnboardingError(message);
      setAgentLogs((prev) => [...prev, message]);
      triggerToast(message, 'error');
    } finally {
      setOnboardingSubmitting(false);
    }
  }, [
    fetchDashboard,
    fetchWorkspaceBootstrap,
    onboarding,
    onboardingSubmitting,
    selectProjectScope,
    setActiveTab,
    triggerToast,
    username,
    workspaceScope,
  ]);

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
        setToken(sessionMarker);
        setAuthStatus('checking');
        const me = await refreshAuthUser();
        if (!me) {
          setAuthError('登录已通过验证，但会话未能保持。请确认服务器已设置 SESSION_COOKIE_SECURE=false（HTTP 部署），然后重试。');
          return;
        }
        const nextUsername = me.username || values.username;
        localStorage.setItem('mh_username', nextUsername);
        setUsername(nextUsername);
        setActiveSection('brainstorm');
        triggerToast(`欢迎回来, ${nextUsername}!`, 'success');
      } else {
        if (data.admin_login_required) {
          navigate('/admin-login');
        }
        setAuthError(data.error || '登录失败');
      }
    } catch {
      setAuthError('连接服务器失败，请确保后端服务已启动。');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (values: LoginFormValues) => {
    setLoading(true);
    setAuthError('');
    try {
      const response = await apiFetch('/admin-auth/login/', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) {
        setAuthError(data.error || '管理员登录失败');
        return;
      }
      localStorage.setItem('mh_token', 'session');
      localStorage.setItem('mh_username', data.username);
      setToken('session');
      setUsername(data.username);
      setAuthStatus('checking');
      const me = await refreshAuthUser();
      setAuthUser(me);
      navigate('/admin-console', { replace: true });
      triggerToast(`管理员 ${data.username} 已登录`, 'success');
    } catch {
      setAuthError('连接服务器失败，请确保后端服务已启动。');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    void apiFetch('/auth/logout/', { method: 'POST' }).catch(() => undefined);
    localStorage.removeItem('mh_token');
    localStorage.removeItem('mh_username');
    setToken(null);
    setUsername(null);
    setAuthUser(null);
    setAuthStatus('anonymous');
    triggerToast('已成功退出登录', 'info');
  };

  const handleRedeemProInvite = useCallback(async (code: string) => {
    setLoading(true);
    try {
      const res = await apiFetch('/billing/redeem-pro-invite/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username || DEMO_USERNAME, code }),
      });
      const data = await res.json();
      if (!res.ok) throw await parseApiErrorResponse(res, '/billing/redeem-pro-invite/');
      setBillingPlans(data as BillingPlanResponse);
      await fetchWorkspaceBootstrap();
      triggerToast('Pro 邀请码兑换成功', 'success');
    } catch (err) {
      triggerToast(buildErrorToast(err, '邀请码兑换失败', '请检查邀请码后重试'));
    } finally {
      setLoading(false);
    }
  }, [username, triggerToast, fetchWorkspaceBootstrap]);

  const handleSubmitEnterpriseRequest = useCallback(async (payload: {
    company_name: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    team_size: string;
    requirements: string;
  }) => {
    setLoading(true);
    try {
      const res = await apiFetch('/billing/enterprise-requests/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username || DEMO_USERNAME, ...payload }),
      });
      const data: BillingPlanResponse = await res.json();
      if (!res.ok) throw await parseApiErrorResponse(res, '/billing/enterprise-requests/');
      setBillingPlans(data);
      triggerToast('企业定制需求已提交', 'success');
    } catch (err) {
      triggerToast(buildErrorToast(err, '企业定制提交失败', '请稍后重试'));
    } finally {
      setLoading(false);
    }
  }, [username, triggerToast]);

  const handleSelectProjectScope = useCallback(async (project: ProjectRecord, campaign?: CampaignRecord) => {
    try {
      const res = await apiFetch(`/projects/${project.id}/`);
      if (res.ok) {
        const detail: ProjectRecord = await res.json();
        selectProjectScope({ ...project, ...detail }, campaign, username);
      } else {
        selectProjectScope(project, campaign, username);
      }
    } catch {
      selectProjectScope(project, campaign, username);
    }
    setActiveTab('content');
    triggerToast('当前项目范围已切换', 'success');
  }, [selectProjectScope, username, setActiveTab, triggerToast]);

  const handleOpenProfile = useCallback((targetUsername?: string | null) => {
    setActiveSection('profile');
    const target = targetUsername?.trim();
    navigate(target ? `/profile/${encodeURIComponent(target)}` : '/profile');
  }, [navigate, setActiveSection]);

  const handleGlobalSearchSelect = useCallback(async (result: GlobalSearchResult) => {
    if (result.kind === 'project' && result.project) {
      try {
        const response = await apiFetch(`/projects/${result.project.id}/`);
        const detail = response.ok ? await response.json() as ProjectRecord : result.project;
        selectProjectScope(detail, undefined, username);
        setActiveTab('projects');
        triggerToast(`已切换到项目：${detail.name}`, 'success');
      } catch {
        selectProjectScope(result.project, undefined, username);
        setActiveTab('projects');
      }
      return;
    }
    if (result.kind === 'asset') {
      setActiveTab('assets');
      triggerToast('已打开资产库，可继续筛选查看该资产。', 'info');
      return;
    }
    if (result.kind === 'task' && result.task) {
      setLatestTask(result.task);
      setRightPanelOpen(true);
      setActiveTab('dashboard');
      triggerToast(`已定位到任务 #${result.task.id}`, 'info');
      return;
    }
    setActiveTab(result.tab);
  }, [selectProjectScope, setActiveTab, setRightPanelOpen, triggerToast, username]);

  const handlePublishAsset = useCallback(async (asset: AssetRecord, creatorNote?: string, projectSlug?: string) => {
    const ok = await publishAssetToCommunity({
      asset,
      workspaceScope,
      username,
      triggerToast,
      creatorNote,
      projectSlug,
    });
    return ok;
  }, [workspaceScope, username, triggerToast]);

  const handleOpenTemplateLibrary = useCallback(() => {
    window.open('/templates', '_blank', 'noopener,noreferrer');
  }, []);

  const handleOpenAssetsLibrary = useCallback(() => {
    navigate('/assets');
  }, [navigate]);

  const handleOpenProjectFromAssets = useCallback((projectId: number) => {
    setActiveTab('projects');
    window.dispatchEvent(new CustomEvent('mh:open-project', { detail: { projectId, openInspector: true } }));
    triggerToast('资产已加入项目，可在右侧检查器中查看并发布到模板库', 'success');
  }, [setActiveTab, triggerToast]);

  const handleShareToCommunity = useCallback(async (
    type: 'copy' | 'image' | 'storyboard' | 'audio' | 'video',
    title: string,
    content: CreationContent,
    imageUrl = '',
    audioUrl = '',
  ) => {
    try {
      const res = await apiFetch('/community/creations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username || DEMO_USERNAME,
          organization: workspaceScope?.organization.slug,
          project: workspaceScope?.project.slug,
          campaign: workspaceScope?.campaign.id,
          creation_type: type,
          title,
          content,
          image_url: imageUrl,
          audio_url: audioUrl,
          source_task_id: latestTask?.status === 'succeeded' ? latestTask.id : undefined,
          visibility: 'public',
          responsibility_confirmed: true,
          ai_generated: true,
        }),
      });
      if (res.ok) {
        triggerToast('已成功分享到手绘工坊社区！', 'success');
        await fetchDashboard();
      } else {
        const err = await parseApiErrorResponse(res, '/community/creations/');
        triggerToast(buildErrorToast(err, '作品分享失败'));
      }
    } catch (err) {
      triggerToast(buildErrorToast(err, '分享失败', '无法连接服务器，请稍后重试'));
    }
  }, [username, workspaceScope, triggerToast, fetchDashboard, latestTask]);

  const handleRetryTask = useCallback(async (task: GenerationTaskRecord) => {
    if (retryingTaskId) return;
    setRetryingTaskId(task.id);
    setAgentLogs((prev) => [...prev, `正在重试任务 #${task.id}...`]);
    try {
      const response = await apiFetch(`/tasks/${task.id}/`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': `retry-${task.id}-${Date.now()}`,
        },
        body: JSON.stringify({
          username: username || DEMO_USERNAME,
          organization: workspaceScope?.organization.slug,
          project: workspaceScope?.project.slug,
          campaign: workspaceScope?.campaign.id,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw await parseApiErrorResponse(response, `/tasks/${task.id}/`);
      }
      const retriedTask = data as GenerationTaskRecord;
      setLatestTask(retriedTask);
      await fetchDashboard();
      await fetchWorkspaceBootstrap();
      triggerToast(
        retriedTask.status === 'succeeded' ? `任务 #${retriedTask.id} 已重试成功` : `任务 #${retriedTask.id} 已重新执行`,
        retriedTask.status === 'failed' ? 'error' : 'success',
      );
    } catch (err) {
      triggerToast(buildErrorToast(err, '任务重试失败', '请稍后重试'));
    } finally {
      setRetryingTaskId(null);
    }
  }, [fetchDashboard, fetchWorkspaceBootstrap, retryingTaskId, triggerToast, username, workspaceScope]);

  // One-time URL → store sync on mount, so deep links / refresh land
  // on the right tab. After that, store is the source of truth: every
  // sidebar click / programmatic jump goes through setActiveSection,
  // and the URL is the projection (handled by each call site).
  // (Earlier we tried a two-way sync here and it re-introduced the
  // "Maximum update depth exceeded" loop, so it's intentionally
  // one-way.)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const section = sectionFromPath(location.pathname);
      if (section !== activeSection) {
        setActiveSection(section);
      }
      setRouteSynced(true);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authUser && !authUser.admin_mode && location.pathname.startsWith('/admin-console')) {
      setActiveSection('dashboard');
      navigate('/dashboard', { replace: true });
    }
  }, [authUser, location.pathname, navigate, setActiveSection]);

  useEffect(() => {
    const handleOpenProjectBrandMemory = () => {
      setActiveTab('projects');
    };
    window.addEventListener('mh:open-project-brand-memory', handleOpenProjectBrandMemory);
    return () => window.removeEventListener('mh:open-project-brand-memory', handleOpenProjectBrandMemory);
  }, [setActiveTab]);

  // Initial bootstrap: API status + workspace + dashboard + billing
  useEffect(() => {
    if (!token || !authUser || authUser.admin_mode) return;
    const timer = window.setTimeout(() => {
      fetchWorkspaceBootstrap();
      fetchDashboard();
      ensureCsrfToken()
        .then(() => setApiLive(true))
        .catch(() => setApiLive(false));

      apiFetch(`/billing/plans/?username=${username || DEMO_USERNAME}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data: BillingPlanResponse | null) => data && setBillingPlans(data))
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authUser, fetchWorkspaceBootstrap, fetchDashboard, token, username]);

  useEffect(() => {
    if (!token || !authUser || authUser.admin_mode || activeTaskCount <= 0) return;
    const interval = window.setInterval(() => {
      void fetchDashboard();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [activeTaskCount, authUser, fetchDashboard, token]);

  useEffect(() => {
    if (!notificationOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const insideButton = notificationRef.current?.contains(target);
      const insidePanel = notificationPanelRef.current?.contains(target);
      if (!insideButton && !insidePanel) {
        setNotificationOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotificationOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [notificationOpen]);

  if (isLegalRoute) {
    return <LegalPage slug={legalSlug} onBack={() => navigate(-1)} />;
  }

  // Auth Guard Portal
  if (authStatus === 'checking') {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-canvas)] font-mono text-xs font-black text-[var(--editorial-text-gray)]">
        正在确认会话...
      </div>
    );
  }

  if (authStatus === 'anonymous' || !token) {
    if (isAdminLoginRoute) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--surface-canvas)] p-4 text-[var(--editorial-text)]">
          <div className="w-full max-w-sm border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-6 shadow-[8px_8px_0_var(--editorial-stroke)]">
            <div className="mb-5">
              <span className="inline-flex border border-[var(--editorial-stroke)] bg-[var(--brand-accent)] px-2 py-1 font-mono text-[10px] font-black uppercase text-black">Admin Only</span>
              <h1 className="serif-header mt-3 text-3xl font-black">管理后台登录</h1>
            </div>
            <form onSubmit={loginForm.handleSubmit(handleAdminLogin)} className="grid gap-3 font-mono">
              {authError ? <div className="border border-red-700 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{authError}</div> : null}
              <label className="grid gap-1 text-xs font-black">
                管理员账号 / 邮箱
                <input type="text" {...loginForm.register('username')} className="border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] px-3 py-2 text-sm outline-none" />
              </label>
              <label className="grid gap-1 text-xs font-black">
                密码
                <input type="password" {...loginForm.register('password')} className="border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] px-3 py-2 text-sm outline-none" />
              </label>
              <button type="submit" disabled={loading} className="mt-2 border border-[var(--editorial-stroke)] bg-[var(--editorial-stroke)] px-4 py-2 text-xs font-black text-[var(--editorial-bg)]">
                {loading ? '正在验证...' : '进入纯后台'}
              </button>
              <button type="button" onClick={() => navigate('/')} className="text-left text-xs font-bold text-[var(--editorial-text-gray)]">
                返回普通登录
              </button>
            </form>
          </div>
        </div>
      );
    }
    return (
      <>
        <LoginPortal
          loading={loading}
          authError={authError}
          loginForm={loginForm}
          handleLogin={handleLogin}
          triggerToast={triggerToast}
          enableDemoLogin={ENABLE_DEMO_LOGIN}
        />
        {resetPasswordToken ? (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4">
            <div className="w-full max-w-sm border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-5 shadow-[6px_6px_0_var(--editorial-stroke)]">
              <h2 className="serif-header text-xl font-black text-[var(--editorial-text)]">Reset password</h2>
              <p className="mt-1 text-xs text-[var(--editorial-text-gray)]">Enter a new password for your account.</p>
              <input
                type="password"
                value={resetPasswordValue}
                onChange={(event) => setResetPasswordValue(event.target.value)}
                className="mt-4 w-full border border-[var(--border-default)] bg-[var(--surface-panel)] px-3 py-2 text-sm outline-none focus:border-[var(--editorial-stroke)]"
                placeholder="New password"
              />
              {resetPasswordError ? <p className="mt-2 text-xs font-bold text-[var(--danger-accent)]">{resetPasswordError}</p> : null}
              <div className="mt-4 flex gap-2">
                <button type="button" className="btn-editorial-primary flex-1 py-2 text-xs font-black" onClick={submitPasswordReset}>
                  Save password
                </button>
                <button type="button" className="btn-editorial-secondary px-3 py-2 text-xs font-black" onClick={() => setResetPasswordToken('')}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (!authUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--surface-canvas)] font-mono text-xs font-black text-[var(--editorial-text-gray)]">
        正在恢复会话...
      </div>
    );
  }

  if (authUser.admin_mode) {
    return (
      <div className="h-screen overflow-hidden bg-[var(--surface-canvas)] p-4 text-[var(--editorial-text)]">
        {feedbackMsg ? (
          <Toast message={feedbackMsg} onAction={handleErrorAction} onDismiss={dismissToast} />
        ) : null}
        <AdminConsolePage
          isStaff={!!authUser.is_superuser}
          username={authUser.username || username || 'admin'}
          onLogout={handleLogout}
          triggerToast={triggerToast}
        />
      </div>
    );
  }

  if (isTemplateLibraryRoute) {
    return (
      <div className="template-library-shell h-full min-h-0 overflow-hidden">
        <Toast message={feedbackMsg} onAction={handleErrorAction} onDismiss={dismissToast} />
        <TemplateLibraryPage
          workspaceScope={workspaceScope}
          username={username}
          triggerToast={triggerToast}
          onBack={() => navigate('/dashboard')}
          onOpenProfile={handleOpenProfile}
          onOpenAssetsLibrary={handleOpenAssetsLibrary}
        />
      </div>
    );
  }

  const isFullHeightTab = FULL_HEIGHT_WORKSPACE_TABS.includes(activeTab);

  return (
    <div className="h-screen bg-[var(--surface-canvas)] text-[var(--editorial-text)] relative overflow-hidden transition-colors duration-250 font-sans">

      {/* Dynamic toast alerts */}
      <Toast message={feedbackMsg} onAction={handleErrorAction} onDismiss={dismissToast} />

      {authUser.policy_consents?.requires_consent ? (
        <div className="fixed left-1/2 top-4 z-[70] flex w-[min(720px,calc(100vw-24px))] -translate-x-1/2 items-center justify-between gap-3 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-4 py-3 shadow-[6px_6px_0_var(--editorial-stroke)] font-mono text-xs">
          <span className="font-bold text-[var(--editorial-text)]">
            当前服务条款或隐私政策已更新，继续生成、上传或发布前需要确认。
          </span>
          <button type="button" onClick={acceptCurrentPolicies} className="shrink-0 border border-[var(--editorial-stroke)] bg-[var(--editorial-stroke)] px-3 py-1.5 font-black text-[var(--editorial-bg)]">
            同意并继续
          </button>
        </div>
      ) : null}

      {showOnboarding && (
        <OnboardingModal
          state={onboarding}
          setState={setOnboarding}
          onClose={() => {
            localStorage.setItem('mh_onboarding_complete', 'true');
            setShowOnboarding(false);
          }}
          onComplete={completeOnboarding}
          isCompleting={onboardingSubmitting}
          error={onboardingError}
        />
      )}

      {/* 左侧导航 */}
      <div className={`app-sidebar-shell ${sidebarOpen ? 'app-sidebar-shell--open' : ''} ${sidebarIconOnly ? 'app-sidebar-shell--collapsed' : ''}`}>
        {activeTab !== 'brainstorm' && (
          <button
            type="button"
            className={`app-sidebar-scrim xl:hidden ${sidebarOpen && !sidebarIconOnly ? 'app-sidebar-scrim--open' : ''}`}
            onClick={() => setSidebarCollapsed(true)}
            aria-label="关闭侧栏遮罩"
          />
        )}
        <AppSidebar
          activeTab={activeTab}
          onNavigate={setActiveTab}
          onOpenTemplateLibrary={handleOpenTemplateLibrary}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          username={username}
          isSuperuser={!!authUser?.is_superuser}
          collapsed={sidebarIconOnly}
          onOpenProfile={() => handleOpenProfile()}
          onLogout={handleLogout}
          className="app-sidebar-shell__panel"
        />
      </div>

      {/* 主工作区 */}
      <main ref={mainRef} className={`app-main-shell ${sidebarOpen ? 'app-main-shell--sidebar-open' : ''} ${sidebarIconOnly ? 'app-main-shell--sidebar-collapsed' : ''} min-w-0 h-full min-h-0 flex flex-col overflow-y-auto w-full z-10 transition-colors duration-250 ${activeTab === 'brainstorm' ? 'p-0' : 'px-3 md:px-5 pt-3 md:pt-5 pb-3'}`}>

        {/* Workspace Title Bar */}
        {activeTab !== 'brainstorm' && (
          activeTab === 'builder' && !headerOpen ? (
          <header className="shrink-0 mb-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-panel)]/86 shadow-[var(--shadow-panel)] backdrop-blur">
            <div className="flex min-w-0 items-center py-1 px-3">
              <button
                type="button"
                onClick={() => setHeaderOpen(true)}
                className="h-6 w-6 rounded border border-[var(--border-default)] bg-[var(--surface-elevated)] inline-flex items-center justify-center hover:bg-[var(--surface-hover)]"
                title="展开顶部"
              >
                <ChevronDown className="h-3 w-3 -rotate-90" />
              </button>
            </div>
          </header>
          ) : (
          <header className="shrink-0 mb-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-panel)]/86 px-3 py-3 shadow-[var(--shadow-panel)] backdrop-blur">
            <div className="flex min-w-0 items-center gap-2 pb-2">
              {activeTab === 'builder' && (
              <button
                type="button"
                onClick={() => setHeaderOpen(false)}
                className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border-default)] bg-[var(--surface-elevated)] inline-flex items-center justify-center hover:bg-[var(--surface-hover)]"
                title="收起顶部"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
              )}
              <button
                type="button"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border-default)] bg-[var(--surface-elevated)] inline-flex items-center justify-center hover:bg-[var(--surface-hover)]"
                title={sidebarIconOnly ? '展开侧栏' : '收起侧栏'}
                aria-label={sidebarIconOnly ? '展开侧栏' : '收起侧栏'}
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="min-w-0">
                  <h2 className="text-sm md:text-base font-bold text-[var(--editorial-text)] serif-header whitespace-nowrap">
                    {TAB_META[activeTab]?.title || '工作台'}
                  </h2>
                  <span className="hidden md:block text-[10px] text-[var(--editorial-text-gray)] truncate min-w-0">
                    {workspaceScope?.campaign?.objective || workspaceScope?.project?.brief
                      ? `${workspaceScope.campaign?.objective || workspaceScope.project?.brief}`
                      : workspaceScope?.project?.name
                      ? `${workspaceScope.project.name}${workspaceScope.campaign?.name ? ` · ${workspaceScope.campaign.name}` : ''}`
                      : TAB_META[activeTab]?.subtitle || '从左侧菜单选择功能'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-1.5 flex-1 text-[var(--editorial-text-gray)]">
                <button
                  type="button"
                  onClick={() => {
                    setRightPanelOpen(true);
                    setActiveTab('dashboard');
                  }}
                  className={`hidden h-6 items-center gap-1 rounded-full border px-2 text-[9px] font-black transition sm:inline-flex ${
                    activeTaskCount > 0
                      ? 'border-[color-mix(in_srgb,var(--info-accent)_45%,var(--border-default))] bg-[color-mix(in_srgb,var(--info-accent)_12%,var(--surface-elevated))] text-[var(--editorial-text)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-elevated)]'
                  }`}
                  title="查看正在处理的任务"
                >
                  {activeTaskCount > 0 ? <Loader2 className="h-3 w-3 animate-spin text-[var(--info-accent)]" /> : <Clock3 className="h-3 w-3" />}
                  运行中 {activeTaskCount}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className={`hidden h-6 items-center gap-1 rounded-full border px-2 text-[9px] font-black transition sm:inline-flex ${
                    (dashboardSnapshot?.metrics.failed_tasks ?? 0) > 0
                      ? 'border-[color-mix(in_srgb,var(--danger-accent)_45%,var(--border-default))] bg-[color-mix(in_srgb,var(--danger-accent)_10%,var(--surface-elevated))] text-[var(--editorial-text)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-elevated)]'
                  }`}
                  title="查看失败任务"
                >
                  {(dashboardSnapshot?.metrics.failed_tasks ?? 0) > 0 ? <XCircle className="h-3 w-3 text-[var(--danger-accent)]" /> : <CheckCircle2 className="h-3 w-3 text-[var(--success-accent)]" />}
                  异常 {dashboardSnapshot?.metrics.failed_tasks ?? 0}
                </button>
                <span className="hidden h-6 items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2 text-[9px] font-black md:inline-flex" title={apiLive ? '后端服务正常' : '后端服务未确认'}>
                  <span className={`h-1.5 w-1.5 rounded-full ${apiLive ? 'bg-emerald-500' : 'bg-yellow-500'}`} />
                  {apiLive ? '在线' : '待确认'}
                </span>
                <span className="hidden h-6 max-w-[160px] items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2 text-[9px] font-black md:inline-flex">
                  <UserCircle className="h-3 w-3" />
                  <span className="truncate">{username || DEMO_USERNAME}</span>
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <GlobalSearchBox
                  organizationSlug={workspaceScope?.organization.slug}
                  recentTasks={recentTasks}
                  value={globalSearch}
                  onChange={setGlobalSearch}
                  onSelect={handleGlobalSearchSelect}
                />
                {currentActiveTask ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRightPanelOpen(true);
                      setActiveTab('dashboard');
                    }}
                    className="hidden h-8 max-w-[220px] items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--info-accent)_45%,var(--border-default))] bg-[color-mix(in_srgb,var(--info-accent)_12%,var(--surface-elevated))] px-2 text-[10px] font-black text-[var(--editorial-text)] hover:bg-[var(--surface-hover)] md:inline-flex"
                    title={`正在处理：${taskLabel(currentActiveTask)}`}
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--info-accent)]" />
                    <span className="truncate">{taskLabel(currentActiveTask)}</span>
                  </button>
                ) : null}
                <button type="button" onClick={() => setShowOnboarding(true)} className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--surface-elevated)] px-2 text-[10px] font-black hover:bg-[var(--surface-hover)] inline-flex items-center gap-1 whitespace-nowrap" title="重新打开首次使用引导" aria-label="重新打开首次使用引导">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">引导</span>
                </button>
                <div className="relative" ref={notificationRef}>
                  <button
                    type="button"
                    onClick={() => setNotificationOpen((prev) => !prev)}
                    className={`relative h-8 w-8 rounded-lg border border-[var(--border-default)] inline-flex items-center justify-center hover:bg-[var(--surface-hover)] ${notificationOpen ? 'bg-[var(--brand-accent)] text-black' : 'bg-[var(--surface-elevated)]'}`}
                    title="打开通知中心"
                    aria-label="打开通知中心"
                    aria-expanded={notificationOpen}
                  >
                    <Bell className="h-3.5 w-3.5" />
                    {unreadCount > 0 ? (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-[var(--surface-panel)] bg-[var(--danger-accent)] px-1 text-[8px] font-black leading-none text-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    ) : null}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setRightPanelOpen(!rightPanelOpen)}
                  disabled={activeTab === 'builder'}
                  className={`h-8 w-8 rounded-lg border border-[var(--border-default)] inline-flex items-center justify-center hover:bg-[var(--surface-hover)] disabled:opacity-40 disabled:hover:bg-[var(--surface-panel)] ${rightPanelOpen && activeTab !== 'builder' ? 'bg-[var(--brand-accent)] text-black' : 'bg-[var(--surface-elevated)]'}`}
                  title={activeTab === 'builder' ? '工作流页使用内置右侧面板' : '显示或隐藏右侧上下文'}
                  aria-label={activeTab === 'builder' ? '工作流页使用内置右侧面板' : '显示或隐藏右侧上下文'}
                >
                  <PanelRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </header>
          )
        )}

        {/* Workspace Panels Overlapping Paper Sheet Grid */}
        <div className={`workspace-panel-layout ${showInlineRightPanel ? 'workspace-panel-layout--right-open' : ''} mt-1 z-0 flex-1 min-h-0 overflow-y-auto ${isFullHeightTab ? 'items-stretch' : ''}`}>
          <div className={`min-w-0 h-full min-h-0 ${isFullHeightTab && activeTab !== 'builder' ? 'overflow-hidden' : 'overflow-y-auto'} ${isFullHeightTab ? '' : 'space-y-4 pr-1'}`}>
            {activeTab === 'projects' && (
              <ProjectManager
                organization={workspaceScope?.organization || null}
                activeProjectId={workspaceScope?.project.id}
                onSelectScope={handleSelectProjectScope}
                triggerToast={triggerToast}
                onOpenAssetsLibrary={handleOpenAssetsLibrary}
                onOpenTemplateLibrary={handleOpenTemplateLibrary}
                onPublishAsset={handlePublishAsset}
              />
            )}

            {activeTab === 'assets' && workspaceScope?.organization && (
              <AssetsLibrary
                organizationSlug={workspaceScope.organization.slug}
                onOpenProject={handleOpenProjectFromAssets}
                onOpenTemplateLibrary={handleOpenTemplateLibrary}
              />
            )}

            {activeTab === 'builder' && (
              <Suspense fallback={<div className="p-8 text-sm text-[var(--editorial-text-gray)]">工作流模块加载中…</div>}>
                <WorkflowBuilder
                  project={workspaceScope?.project || null}
                  campaign={workspaceScope?.campaign?.id ? workspaceScope.campaign : null}
                  organizationSlug={workspaceScope?.organization.slug}
                  username={username || DEMO_USERNAME}
                  triggerToast={triggerToast}
                  featureEntitlements={billingPlans?.feature_entitlements}
                  onOpenBilling={() => setActiveTab('billing')}
                  onErrorAction={handleErrorAction}
                />
              </Suspense>
            )}

            {activeTab === 'brainstorm' && (
              <Suspense fallback={<div className="p-8 text-sm text-[var(--editorial-text-gray)]">Loading brainstorm...</div>}>
                <BrainstormPage
                  organization={workspaceScope?.organization || null}
                  project={workspaceScope?.project || null}
                  campaign={workspaceScope?.campaign?.id ? workspaceScope.campaign : null}
                  username={username || DEMO_USERNAME}
                  triggerToast={triggerToast}
                  onComplete={(draftId) => {
                    setSidebarToggled(true);
                    setActiveSection('builder');
                    navigate(`/workflows?draft=${draftId}&from=brainstorm`, { replace: true });
                  }}
                  onToggleSidebar={() => setSidebarToggled((prev) => !prev)}
                />
              </Suspense>
            )}

            {activeTab === 'dashboard' && (
              <DashboardPage
                snapshot={dashboardSnapshot}
                latestTask={latestTask}
                setActiveTab={setActiveTab}
                triggerToast={triggerToast}
                onRefresh={async () => {
                  await fetchWorkspaceBootstrap();
                  await fetchDashboard();
                }}
                onRetryTask={handleRetryTask}
                onErrorAction={handleErrorAction}
                retryingTaskId={retryingTaskId}
              />
            )}

            <div style={{ display: activeTab === 'content' ? 'block' : 'none' }} className="h-full">
              <ContentPackagePanel
                onboarding={onboarding}
                setOnboarding={setOnboarding}
                copyInput={{ brandName: 'Marketing-Hub', description: onboarding.brief, tone: onboarding.tone, platform: onboarding.channels[0] || '小红书' }}
                workspaceScope={workspaceScope}
                username={username}
                storyboardDuration={30}
                loading={loading}
                setLoading={setLoading}
                setAgentLogs={setAgentLogs}
                triggerToast={triggerToast}
                setActiveTab={setActiveTab}
                onCopy={handleCopyClipboard}
                onApplyContentPackage={(pkg) => {
                  setContentPackage(pkg);
                  setContentVersion(pkg.version || 'AI 初稿');
                  void fetchDashboard();
                }}
              />
            </div>

            <div style={{ display: activeTab === 'copy' ? 'block' : 'none' }} className="h-full">
              <CopyPanel
                workspaceScope={workspaceScope}
                username={username}
                loading={loading}
                setLoading={setLoading}
                agentLogs={agentLogs}
                setAgentLogs={setAgentLogs}
                setLatestTask={setLatestTask}
                triggerToast={triggerToast}
                onErrorAction={handleErrorAction}
                fetchDashboard={async () => { await fetchDashboard(); }}
                onShare={handleShareToCommunity}
                onCopy={handleCopyClipboard}
              />
            </div>

            <div style={{ display: activeTab === 'image' ? 'block' : 'none' }} className="h-full">
              <ImagePanel
                workspaceScope={workspaceScope}
                username={username}
                loading={loading}
                setLoading={setLoading}
                agentLogs={agentLogs}
                setAgentLogs={setAgentLogs}
                setLatestTask={setLatestTask}
                triggerToast={triggerToast}
                onErrorAction={handleErrorAction}
                fetchDashboard={async () => { await fetchDashboard(); }}
                onShare={handleShareToCommunity}
                onCopy={handleCopyClipboard}
              />
            </div>

            <div style={{ display: activeTab === 'storyboard' ? 'block' : 'none' }} className="h-full">
              <StoryboardPanel
                workspaceScope={workspaceScope}
                username={username}
                loading={loading}
                setLoading={setLoading}
                agentLogs={agentLogs}
                setAgentLogs={setAgentLogs}
                setLatestTask={setLatestTask}
                triggerToast={triggerToast}
                onErrorAction={handleErrorAction}
                fetchDashboard={async () => { await fetchDashboard(); }}
                onShare={handleShareToCommunity}
                onStoryboardChange={setLatestStoryboardOutput}
              />
            </div>

            <div style={{ display: activeTab === 'audio' ? 'block' : 'none' }} className="h-full">
              <AudioPanel
                workspaceScope={workspaceScope}
                username={username}
                loading={loading}
                setLoading={setLoading}
                agentLogs={agentLogs}
                setAgentLogs={setAgentLogs}
                setLatestTask={setLatestTask}
                triggerToast={triggerToast}
                onErrorAction={handleErrorAction}
                fetchDashboard={async () => { await fetchDashboard(); }}
                onShare={handleShareToCommunity}
              />
            </div>

            <div style={{ display: activeTab === 'video' ? 'block' : 'none' }} className="h-full">
              <VideoPanel
                workspaceScope={workspaceScope}
                username={username}
                loading={loading}
                setLoading={setLoading}
                agentLogs={agentLogs}
                setAgentLogs={setAgentLogs}
                setLatestTask={setLatestTask}
                triggerToast={triggerToast}
                onErrorAction={handleErrorAction}
                fetchDashboard={async () => { await fetchDashboard(); }}
                onWorkspaceRefresh={async () => { await fetchWorkspaceBootstrap(); }}
                onShare={handleShareToCommunity}
                latestStoryboard={latestStoryboardOutput}
                featureEntitlements={billingPlans?.feature_entitlements}
                onOpenBilling={() => setActiveTab('billing')}
              />
            </div>

            {activeTab === 'profile' && (
              <ProfilePage
                username={routeProfileUsername}
                currentUsername={username}
                triggerToast={triggerToast}
                onOpenProfile={handleOpenProfile}
              />
            )}


            {activeTab === 'review' && (
              <ReviewPage
                contentPackage={contentPackage}
                contentVersion={contentVersion}
                setContentVersion={setContentVersion}
                setContentPackage={setContentPackage}
                triggerToast={triggerToast}
              />
            )}

            {activeTab === 'billing' && (
              <BillingPage
                billingPlans={billingPlans}
                onRedeemProInvite={handleRedeemProInvite}
                onSubmitEnterpriseRequest={handleSubmitEnterpriseRequest}
              />
            )}

            {activeTab === 'admin' && (
              <AdminConsolePage
                isStaff={!!authUser?.is_superuser}
                triggerToast={triggerToast}
              />
            )}

            {activeTab === 'config' && (
              <AiConfigPage
                workspaceScope={workspaceScope}
                username={username}
                triggerToast={triggerToast}
                onWorkspaceRefresh={async () => { await fetchWorkspaceBootstrap(); }}
                featureEntitlements={billingPlans?.feature_entitlements}
                onOpenBilling={() => setActiveTab('billing')}
                canManagePlatformConfig={!!(authUser?.is_staff || authUser?.is_superuser)}
              />
            )}
          </div>
          {rightPanelAvailable && (
            <div className={`workspace-panel-layout__right ${showAppRightPanel ? 'workspace-panel-layout__right--open' : ''}`} aria-hidden={!showAppRightPanel}>
              <ContextPanel
                workspaceScope={workspaceScope}
                latestTask={latestTask}
                dashboardSnapshot={dashboardSnapshot}
                contentPackage={contentPackage}
                setActiveTab={setActiveTab}
                onClose={() => setRightPanelOpen(false)}
                onRetryTask={handleRetryTask}
                onErrorAction={handleErrorAction}
                retryingTaskId={retryingTaskId}
              />
            </div>
          )}
        </div>

        {/* Paper style footer — 全屏工作 Tab 隐藏以节省纵向空间 */}
        {!isFullHeightTab && activeTab !== 'brainstorm' && (
        <footer className="shrink-0 w-full border-t border-[var(--editorial-stroke)]/45 py-2 mt-2 flex flex-col md:flex-row justify-between items-center gap-2 text-[8px] font-mono font-bold text-[var(--editorial-text-gray)] uppercase">
          <span>© 2026 MARKETING-HUB DRAFTBOOK INC.</span>
          <div className="flex gap-3">
            <a href="#" className="hover:text-[var(--editorial-text)] transition-all">[TERMS]</a>
            <span>//</span>
            <a href="#" className="hover:text-[var(--editorial-text)] transition-all">[PRIVACY]</a>
            <span>//</span>
            <a href="#" className="hover:text-[var(--editorial-text)] transition-all">[SUPPORT]</a>
          </div>
        </footer>
        )}

      </main>

      {notificationOpen ? (
        <div
          ref={notificationPanelRef}
          className="fixed right-4 top-[92px] z-[5000] w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-[var(--border-default)] bg-[var(--surface-panel)] shadow-[var(--shadow-panel)] md:right-6 md:top-[104px]"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-2.5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--editorial-text-gray)]">Command Center</p>
              <h3 className="text-sm font-black text-[var(--editorial-text)]">通知与事务</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                void fetchDashboard();
                setNotificationOpen(false);
              }}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2 py-1 text-[9px] font-black hover:bg-[var(--surface-hover)]"
            >
              刷新
            </button>
          </div>
          <div className="max-h-[min(420px,calc(100vh-140px))] overflow-y-auto p-2">
            {notificationItems.length ? notificationItems.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => {
                  item.onAction?.();
                  setNotificationOpen(false);
                }}
                className="flex w-full items-start gap-2 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]"
              >
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
                  <NotificationIcon kind={item.kind} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-black text-[var(--editorial-text)]">{item.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[10px] font-semibold leading-4 text-[var(--editorial-text-gray)]">{item.detail}</span>
                  {item.actionLabel ? <span className="mt-1 inline-flex text-[9px] font-black uppercase tracking-wider text-[var(--brand-accent-strong)]">{item.actionLabel}</span> : null}
                </span>
              </button>
            )) : (
              <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-3 py-5 text-center">
                <CheckCircle2 className="mx-auto h-5 w-5 text-[var(--success-accent)]" />
                <p className="mt-2 text-xs font-black text-[var(--editorial-text)]">没有待处理提醒</p>
                <p className="mt-1 text-[10px] font-semibold text-[var(--editorial-text-gray)]">任务、失败和系统状态会在这里汇总。</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* AI assistant mount */}
      <PageContextTracker extras={assistantPageContext} />
      <AssistantBubble />
      <AssistantPanel onNavigate={onAssistantNavigate} />

    </div>
  );
}
