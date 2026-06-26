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
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Loader2,
  Menu,
  PanelRight,
  Search,
  UserCircle,
  XCircle,
} from 'lucide-react';
import { apiFetch } from './hooks/useApi';
import { pathForSection, sectionFromPath } from './app/routes';
import { FULL_HEIGHT_WORKSPACE_TABS, TAB_META } from './app/navigation';
import { AppSidebar } from './components/AppSidebar';
import { ProjectManager } from './features/projects';
import { AssetsLibrary } from './features/assets';
import { CopyPanel, ImagePanel, StoryboardPanel, AudioPanel, VideoPanel } from './features/generation';
import { taskTypeLabels, type CreationContent } from './features/generation';
import { ContentPackagePanel, buildContentPackage } from './features/content-package';
import type { ContentPackage } from './features/generation';
import { CommunityPage } from './features/community';
import { ProfilePage } from './features/profile';
import { DashboardPage, useDashboardSnapshot, useWorkspaceScope } from './features/dashboard';
import { AiConfigPage } from './features/ai-config';
import { BillingPage } from './features/billing';
import { AdminConsolePage } from './features/admin-console';
import { ReviewPage } from './features/review';
import { ContextPanel } from './features/context-panel';
import { OnboardingModal, onboardingDefaults } from './features/onboarding';
import type { OnboardingState } from './features/onboarding';
import {
  AssistantBubble,
  AssistantPanel,
  PageContextTracker,
  type PageContext,
} from './features/assistant';
import { useUiStore, type AppSection } from './shared/stores/uiStore';
import type { CampaignRecord, ProjectRecord, GenerationTaskRecord, BillingPlanResponse } from './types/workspace';

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

  const [token, setToken] = useState<string | null>(localStorage.getItem('mh_token'));
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
  const activeTab = routeSynced ? activeSection : routeSection;
  const sidebarOpen = activeTab === 'brainstorm' ? sidebarToggled : !sidebarCollapsed;
  const rightPanelAvailable = activeTab !== 'builder';
  const showAppRightPanel = rightPanelOpen && activeTab !== 'builder';
  const showInlineRightPanel = rightPanelOpen && activeTab !== 'builder';

  const [globalSearch, setGlobalSearch] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem('mh_onboarding_complete') !== 'true');
  const [notificationOpen, setNotificationOpen] = useState(false);

  const [onboarding, setOnboarding] = useState<OnboardingState>(onboardingDefaults);
  const [contentPackage, setContentPackage] = useState<ContentPackage>(() => {
    return buildContentPackage(
      { onboarding, copyInput: { brandName: 'Marketing-Hub', description: onboardingDefaults.brief, tone: onboardingDefaults.tone, platform: '小红书' }, workspaceScope: null, contentBrief: onboardingDefaults.brief },
      onboardingDefaults.brief,
    );
  });
  const [contentVersion, setContentVersion] = useState<'AI 初稿' | '用户修改稿' | '最终稿'>('AI 初稿');

  const [loading, setLoading] = useState(false);
  const [apiLive, setApiLive] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [latestTask, setLatestTask] = useState<GenerationTaskRecord | null>(null);
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [billingPlans, setBillingPlans] = useState<BillingPlanResponse | null>(null);

  const setActiveTab = useCallback((tab: AppSection) => {
    setActiveSection(tab);
    navigate(pathForSection(tab));
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      setSidebarCollapsed(true);
    }
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
          void apiFetch('/ai/config/')
            .then((res) => setApiLive(res.ok))
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

  const triggerToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3000);
  }, []);

  const refreshAuthUser = useCallback(async () => {
    const response = await apiFetch('/auth/me/');
    const data = await response.json() as AuthMeResponse;
    if (!response.ok || !data.authenticated || !data.username) {
      localStorage.removeItem('mh_token');
      localStorage.removeItem('mh_username');
      setToken(null);
      setUsername(null);
      setAuthUser(null);
      return null;
    }
    localStorage.setItem('mh_token', 'session');
    localStorage.setItem('mh_username', data.username);
    setToken('session');
    setUsername(data.username);
    setAuthUser(data);
    return data;
  }, []);

  useEffect(() => {
    if (!token) return;
    const timer = window.setTimeout(() => {
      void refreshAuthUser();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshAuthUser, token]);

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

  const completeOnboarding = useCallback(() => {
    localStorage.setItem('mh_onboarding_complete', 'true');
    setShowOnboarding(false);
    const nextPackage = buildContentPackage(
      { onboarding, copyInput: { brandName: onboarding.brandName, description: onboarding.brief, tone: onboarding.tone, platform: onboarding.channels[0] || '小红书' }, workspaceScope, contentBrief: onboarding.brief },
      onboarding.brief,
    );
    setContentPackage(nextPackage);
    setContentVersion('AI 初稿');
    setActiveTab('content');
    triggerToast('已生成第一份内容包草稿', 'success');
  }, [onboarding, workspaceScope, setActiveTab, triggerToast]);

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
        const me = await refreshAuthUser();
        const nextUsername = me?.username || data.username;
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
    triggerToast('已成功退出登录', 'info');
  };

  const handleSelectPlan = useCallback(async (plan: 'free' | 'pro' | 'enterprise') => {
    setLoading(true);
    try {
      const res = await apiFetch('/billing/plans/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username || DEMO_USERNAME, plan }),
      });
      if (!res.ok) throw new Error('Plan update failed');
      const data: BillingPlanResponse = await res.json();
      setBillingPlans(data);
      await fetchWorkspaceBootstrap();
      triggerToast('订阅方案已更新', 'success');
    } catch {
      triggerToast('订阅方案更新失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [username, triggerToast, fetchWorkspaceBootstrap]);

  const handleSelectProjectScope = useCallback((project: ProjectRecord, campaign?: CampaignRecord) => {
    selectProjectScope(project, campaign, username);
    setActiveTab('content');
    triggerToast('当前项目范围已切换', 'success');
  }, [selectProjectScope, username, setActiveTab, triggerToast]);

  const handleOpenProfile = useCallback((targetUsername?: string | null) => {
    setActiveSection('profile');
    const target = targetUsername?.trim();
    navigate(target ? `/profile/${encodeURIComponent(target)}` : '/profile');
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      setSidebarCollapsed(true);
    }
  }, [navigate, setActiveSection]);

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
        }),
      });
      if (res.ok) {
        triggerToast('已成功分享到手绘工坊社区！', 'success');
        await fetchDashboard();
      } else {
        triggerToast('作品分享失败', 'error');
      }
    } catch {
      triggerToast('分享失败，无法连接服务器', 'error');
    }
  }, [username, workspaceScope, triggerToast, fetchDashboard]);

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

  // Initial bootstrap: API status + workspace + dashboard + billing
  useEffect(() => {
    if (!token || !authUser || authUser.admin_mode) return;
    const timer = window.setTimeout(() => {
      fetchWorkspaceBootstrap();
      fetchDashboard();
      apiFetch('/ai/config/')
        .then((res) => {
          if (res.ok) setApiLive(true);
        })
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

  // Auth Guard Portal
  if (!token) {
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
        {feedbackMsg && (
          <div className={`fixed right-6 top-6 z-50 rounded-xl border border-[var(--border-default)] bg-[var(--surface-elevated)] px-5 py-4 font-mono text-xs font-semibold shadow-[var(--shadow-panel)] toast-${feedbackMsg.type}`}>
            <span>{feedbackMsg.text}</span>
          </div>
        )}
        <AdminConsolePage
          isStaff={!!authUser.is_superuser}
          username={authUser.username || username || 'admin'}
          onLogout={handleLogout}
          triggerToast={triggerToast}
        />
      </div>
    );
  }

  const isFullHeightTab = FULL_HEIGHT_WORKSPACE_TABS.includes(activeTab);

  return (
    <div className="h-screen bg-[var(--surface-canvas)] text-[var(--editorial-text)] relative overflow-hidden transition-colors duration-250 font-sans">

      {/* Dynamic toast alerts */}
      {feedbackMsg && (
        <div className={`fixed top-6 right-6 z-50 rounded-xl px-5 py-4 border border-[var(--border-default)] shadow-[var(--shadow-panel)] bg-[var(--surface-elevated)] animate-in slide-in-from-top duration-200 font-mono text-xs font-semibold toast-${feedbackMsg.type}`}>
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {showOnboarding && (
        <OnboardingModal
          state={onboarding}
          setState={setOnboarding}
          onClose={() => {
            localStorage.setItem('mh_onboarding_complete', 'true');
            setShowOnboarding(false);
          }}
          onComplete={completeOnboarding}
        />
      )}

      {/* 左侧导航 */}
      <div className={`app-sidebar-shell ${sidebarOpen ? 'app-sidebar-shell--open' : ''}`}>
        {activeTab !== 'brainstorm' && (
          <button
            type="button"
            className={`app-sidebar-scrim xl:hidden ${sidebarOpen ? 'app-sidebar-scrim--open' : ''}`}
            onClick={() => setSidebarCollapsed(true)}
            aria-label="关闭侧栏遮罩"
          />
        )}
        <AppSidebar
          activeTab={activeTab}
          onNavigate={setActiveTab}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          username={username}
          isSuperuser={!!authUser?.is_superuser}
          onOpenProfile={() => handleOpenProfile()}
          onLogout={handleLogout}
          className="app-sidebar-shell__panel"
        />
      </div>

      {/* 主工作区 */}
      <main ref={mainRef} className={`app-main-shell ${sidebarOpen ? 'app-main-shell--sidebar-open' : ''} min-w-0 h-full min-h-0 flex flex-col overflow-hidden w-full z-10 transition-colors duration-250 ${activeTab === 'brainstorm' ? 'p-0' : 'px-3 md:px-5 pt-3 md:pt-5 pb-3'}`}>

        {/* Workspace Title Bar */}
        {activeTab !== 'brainstorm' && (
          <header className="shrink-0 mb-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-panel)]/86 px-3 py-3 shadow-[var(--shadow-panel)] backdrop-blur">
            <div className="flex min-w-0 items-center gap-2 pb-2">
              <button
                type="button"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border-default)] bg-[var(--surface-elevated)] inline-flex items-center justify-center hover:bg-[var(--surface-hover)]"
                title={sidebarOpen ? '收起侧栏' : '展开侧栏'}
                aria-label={sidebarOpen ? '收起侧栏' : '展开侧栏'}
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-2 min-w-0 flex-1">
                <h2 className="text-sm md:text-base font-bold text-[var(--editorial-text)] serif-header whitespace-nowrap shrink-0">
                  {TAB_META[activeTab]?.title || '工作台'}
                </h2>
                <span className="hidden md:inline text-[10px] text-[var(--editorial-text-gray)] truncate min-w-0">
                  {TAB_META[activeTab]?.subtitle || '从左侧菜单选择功能'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <label className="relative hidden lg:flex items-center w-[190px] xl:w-[220px]">
                  <Search className="absolute left-2.5 h-3.5 w-3.5 text-[var(--editorial-text-gray)]" aria-hidden="true" />
                  <input
                    value={globalSearch}
                    onChange={(event) => setGlobalSearch(event.target.value)}
                    className="h-8 w-full rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-default)] pl-8 pr-2 text-[10px] focus:outline-none focus:border-[var(--brand-accent-strong)]"
                    placeholder="搜索项目、brief、资产…"
                    aria-label="全局搜索"
                  />
                </label>
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
            <div className="flex min-w-0 items-center justify-between gap-3 pb-2 text-[9px] font-bold font-mono">
              <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pr-2">
                <span className="h-6 shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2 flex items-center gap-1">
                  <BriefcaseBusiness className="h-3 w-3" />
                  {workspaceScope?.organization.name || 'Marketing Hub'}
                </span>
                <span className="shrink-0 text-[var(--editorial-text-gray)]">/</span>
                <span className="h-6 max-w-[220px] shrink-0 truncate rounded-full border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2 inline-flex items-center">
                  {workspaceScope?.project.name || 'Core Launch'}
                </span>
                <span className="h-6 max-w-[200px] shrink-0 truncate rounded-full border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-2 inline-flex items-center">
                  {workspaceScope?.campaign.name || 'Product Launch'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-[var(--editorial-text-gray)]">
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
            </div>
          </header>
        )}

        {/* Workspace Panels Overlapping Paper Sheet Grid */}
        <div className={`workspace-panel-layout ${showInlineRightPanel ? 'workspace-panel-layout--right-open' : ''} mt-1 z-0 flex-1 min-h-0 overflow-hidden ${isFullHeightTab ? 'items-stretch' : ''}`}>
          <div className={`min-w-0 h-full min-h-0 ${isFullHeightTab ? 'overflow-hidden' : 'overflow-y-auto'} ${isFullHeightTab ? '' : 'space-y-4 pr-1'}`}>
            {activeTab === 'projects' && (
              <ProjectManager
                organization={workspaceScope?.organization || null}
                activeProjectId={workspaceScope?.project.id}
                onSelectScope={handleSelectProjectScope}
                triggerToast={triggerToast}
                onOpenAssetsLibrary={() => setActiveTab('assets')}
              />
            )}

            {activeTab === 'builder' && (
              <Suspense fallback={<div className="p-8 text-sm text-[var(--editorial-text-gray)]">工作流模块加载中…</div>}>
                <WorkflowBuilder
                  project={workspaceScope?.project || null}
                  campaign={workspaceScope?.campaign?.id ? workspaceScope.campaign : null}
                  username={username || DEMO_USERNAME}
                  triggerToast={triggerToast}
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
              />
            )}

            {activeTab === 'content' && (
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
            )}

            {activeTab === 'copy' && (
              <CopyPanel
                workspaceScope={workspaceScope}
                username={username}
                loading={loading}
                setLoading={setLoading}
                agentLogs={agentLogs}
                setAgentLogs={setAgentLogs}
                setLatestTask={setLatestTask}
                triggerToast={triggerToast}
                fetchDashboard={async () => { await fetchDashboard(); }}
                onShare={handleShareToCommunity}
                onCopy={handleCopyClipboard}
              />
            )}

            {activeTab === 'image' && (
              <ImagePanel
                workspaceScope={workspaceScope}
                username={username}
                loading={loading}
                setLoading={setLoading}
                agentLogs={agentLogs}
                setAgentLogs={setAgentLogs}
                setLatestTask={setLatestTask}
                triggerToast={triggerToast}
                fetchDashboard={async () => { await fetchDashboard(); }}
                onShare={handleShareToCommunity}
                onCopy={handleCopyClipboard}
              />
            )}

            {activeTab === 'storyboard' && (
              <StoryboardPanel
                workspaceScope={workspaceScope}
                username={username}
                loading={loading}
                setLoading={setLoading}
                agentLogs={agentLogs}
                setAgentLogs={setAgentLogs}
                setLatestTask={setLatestTask}
                triggerToast={triggerToast}
                fetchDashboard={async () => { await fetchDashboard(); }}
                onShare={handleShareToCommunity}
              />
            )}

            {activeTab === 'audio' && (
              <AudioPanel
                workspaceScope={workspaceScope}
                username={username}
                loading={loading}
                setLoading={setLoading}
                agentLogs={agentLogs}
                setAgentLogs={setAgentLogs}
                setLatestTask={setLatestTask}
                triggerToast={triggerToast}
                fetchDashboard={async () => { await fetchDashboard(); }}
                onShare={handleShareToCommunity}
              />
            )}

            {activeTab === 'video' && (
              <VideoPanel
                workspaceScope={workspaceScope}
                username={username}
                loading={loading}
                setLoading={setLoading}
                agentLogs={agentLogs}
                setAgentLogs={setAgentLogs}
                setLatestTask={setLatestTask}
                triggerToast={triggerToast}
                fetchDashboard={async () => { await fetchDashboard(); }}
                onWorkspaceRefresh={fetchWorkspaceBootstrap}
                onShare={handleShareToCommunity}
              />
            )}

            {activeTab === 'community' && (
              <CommunityPage
                workspaceScope={workspaceScope}
                username={username}
                triggerToast={triggerToast}
                onOpenProfile={handleOpenProfile}
              />
            )}

            {activeTab === 'profile' && (
              <ProfilePage
                username={routeProfileUsername}
                currentUsername={username}
                triggerToast={triggerToast}
              />
            )}

            {activeTab === 'assets' && workspaceScope?.organization && (
              <AssetsLibrary organizationSlug={workspaceScope.organization.slug} />
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
                onSelectPlan={handleSelectPlan}
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
                onWorkspaceRefresh={fetchWorkspaceBootstrap}
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
