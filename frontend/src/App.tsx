import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { LoginPortal } from './features/auth';
import {
  Bell,
  BookOpen,
  BriefcaseBusiness,
  ListChecks,
  Menu,
  PanelRight,
  Search,
  UserCircle,
} from 'lucide-react';
import { apiFetch } from './hooks/useApi';
import { pathForSection, sectionFromPath } from './app/routes';
import { FULL_HEIGHT_WORKSPACE_TABS, TAB_META } from './app/navigation';
import { AppSidebar } from './components/AppSidebar';
import { ProjectManager } from './features/projects';
import { AssetsLibrary } from './features/assets';
import { CopyPanel, ImagePanel, StoryboardPanel, AudioPanel, VideoPanel } from './features/generation';
import type { CreationContent } from './features/generation';
import { ContentPackagePanel, buildContentPackage } from './features/content-package';
import type { ContentPackage } from './features/generation';
import { CommunityPage } from './features/community';
import { DashboardPage, useDashboardSnapshot, useWorkspaceScope } from './features/dashboard';
import { AiConfigPage } from './features/ai-config';
import { BillingPage } from './features/billing';
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
  const [username, setUsername] = useState<string | null>(localStorage.getItem('mh_username'));
  const [authError, setAuthError] = useState('');
  const [routeSynced, setRouteSynced] = useState(false);
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: 'ROOT', password: '123' },
  });

  const routeSection = sectionFromPath(location.pathname);
  const activeTab = routeSynced ? activeSection : routeSection;
  const sidebarOpen = activeTab === 'brainstorm' ? sidebarToggled : !sidebarCollapsed;
  const rightPanelAvailable = activeTab !== 'builder';
  const showAppRightPanel = rightPanelOpen && activeTab !== 'builder';
  const showInlineRightPanel = rightPanelOpen && activeTab !== 'builder';

  const [globalSearch, setGlobalSearch] = useState('');
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem('mh_onboarding_complete') !== 'true');

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

  // Workspace & dashboard state (shared across panels)
  const { workspaceScope, fetchWorkspaceBootstrap, selectProjectScope } = useWorkspaceScope(username);
  const { dashboardSnapshot, fetchDashboard } = useDashboardSnapshot(username);

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

  const setActiveTab = useCallback((tab: AppSection) => {
    setActiveSection(tab);
    navigate(pathForSection(tab));
    if (typeof window !== 'undefined' && window.innerWidth < 1280) {
      setSidebarCollapsed(true);
    }
  }, [navigate, setActiveSection]);

  const triggerToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3000);
  }, []);

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
        localStorage.setItem('mh_username', data.username);
        setToken(sessionMarker);
        setUsername(data.username);
        setActiveSection('brainstorm');
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

  const handleSelectPlan = useCallback(async (plan: 'free' | 'pro' | 'enterprise') => {
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
          username: username || 'ROOT',
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
    const section = sectionFromPath(location.pathname);
    if (section !== activeSection) {
      setActiveSection(section);
    }
    setRouteSynced(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial bootstrap: API status + workspace + dashboard + billing
  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchWorkspaceBootstrap();
      fetchDashboard();
      apiFetch('/ai/config/')
        .then((res) => {
          if (res.ok) setApiLive(true);
        })
        .catch(() => setApiLive(false));

      apiFetch(`/billing/plans/?username=${username || 'ROOT'}`)
        .then((res) => res.ok ? res.json() : null)
        .then((data: BillingPlanResponse | null) => data && setBillingPlans(data))
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchWorkspaceBootstrap, fetchDashboard, username]);

  // Auth Guard Portal
  if (!token) {
    return (
      <LoginPortal
        loading={loading}
        authError={authError}
        loginForm={loginForm}
        handleLogin={handleLogin}
        triggerToast={triggerToast}
      />
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
                <button type="button" onClick={() => setShowOnboarding(true)} className="h-8 rounded-lg border border-[var(--border-default)] bg-[var(--surface-elevated)] px-2 text-[10px] font-black hover:bg-[var(--surface-hover)] inline-flex items-center gap-1 whitespace-nowrap" title="重新打开首次使用引导" aria-label="重新打开首次使用引导">
                  <BookOpen className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">引导</span>
                </button>
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
              <div className="flex shrink-0 items-center gap-2 text-[var(--editorial-text-gray)]">
                <span className="hidden sm:flex items-center gap-1"><ListChecks className="h-3 w-3" /> 队列 {dashboardSnapshot?.metrics.queued_tasks ?? 0}</span>
                <span className="hidden sm:flex items-center gap-1"><Bell className="h-3 w-3" /> 通知 {dashboardSnapshot?.metrics.failed_tasks ?? 0}</span>
                <span className="hidden md:flex items-center gap-1"><UserCircle className="h-3 w-3" /> {username || 'ROOT'}</span>
                <span className={`h-1.5 w-1.5 rounded-full ${apiLive ? 'bg-emerald-500' : 'bg-yellow-500'}`} title={apiLive ? '后端服务正常' : '后端服务未确认'}></span>
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
                  username={username || 'ROOT'}
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
                  username={username || 'ROOT'}
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

      {/* AI assistant mount */}
      <PageContextTracker extras={assistantPageContext} />
      <AssistantBubble />
      <AssistantPanel onNavigate={onAssistantNavigate} />

    </div>
  );
}
