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
  PanelRight,
  Search,
  UserCircle,
} from 'lucide-react';
import { apiFetch } from './hooks/useApi';
import { pathForSection, sectionFromPath } from './app/routes';
import { TAB_META } from './app/navigation';
import { AppSidebar } from './components/AppSidebar';
import { ProjectManager } from './features/projects';
import { AssetsLibrary } from './features/assets';
import { CopyPanel, ImagePanel, StoryboardPanel, AudioPanel } from './features/generation';
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
    setActiveSection,
    rightPanelOpen,
    setRightPanelOpen,
    darkMode: storedDarkMode,
    setDarkMode: setStoredDarkMode,
  } = useUiStore();

  const [darkMode, setDarkMode] = useState<boolean>(() => storedDarkMode);
  const [sidebarToggled, setSidebarToggled] = useState(false);

  const [token, setToken] = useState<string | null>(localStorage.getItem('mh_token'));
  const mainRef = useRef<HTMLElement>(null);
  const [username, setUsername] = useState<string | null>(localStorage.getItem('mh_username'));
  const [authError, setAuthError] = useState('');
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: 'ROOT', password: '123' },
  });

  const activeTab = sectionFromPath(location.pathname);
  const sidebarOpen = activeTab === 'brainstorm' ? sidebarToggled : true;
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

  // AI assistant: map URL path to PageContext so the assistant knows which tab the user is on.
  const assistantContextByPath = useMemo<Record<string, PageContext>>(
    () => ({
      '/': { tab: 'brainstorm' },
      '/dashboard': { tab: 'dashboard' },
      '/projects': { tab: 'projects' },
      '/workflows': { tab: 'builder' },
      '/assets': { tab: 'assets' },
      '/community': { tab: 'community' },
      '/review': { tab: 'review' },
      '/billing': { tab: 'billing' },
      '/settings': { tab: 'config' },
    }),
    [],
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

  useEffect(() => {
    setActiveSection(activeTab);
  }, [activeTab, setActiveSection]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  const setActiveTab = useCallback((tab: AppSection) => {
    setActiveSection(tab);
    const nextPath = pathForSection(tab);
    if (location.pathname !== nextPath) {
      navigate(nextPath);
    }
  }, [location.pathname, navigate, setActiveSection]);

  // AI assistant navigation handler
  const onAssistantNavigate = useCallback((tab: string) => {
    setActiveTab(tab as AppSection);
  }, [setActiveTab]);

  const triggerToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
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
        navigate('/');
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
    type: 'copy' | 'image' | 'storyboard' | 'audio',
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

  return (
    <div className={`min-h-screen xl:h-screen bg-[var(--editorial-bg)] text-[var(--editorial-text)] grid grid-cols-1 ${sidebarOpen ? 'xl:grid-cols-[240px_minmax(0,1fr)]' : ''} relative overflow-hidden transition-colors duration-250 font-sans`}>

      {/* Dynamic toast alerts */}
      {feedbackMsg && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-4 border-1.5 border-[var(--editorial-stroke)] shadow-editorial bg-[var(--editorial-paper)] animate-in slide-in-from-top duration-200 font-mono text-xs font-semibold toast-${feedbackMsg.type}`}>
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
      {sidebarOpen && (
        <AppSidebar
          activeTab={activeTab}
          onNavigate={setActiveTab}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          username={username}
          onLogout={handleLogout}
        />
      )}

      {/* 主工作区 */}
      <main ref={mainRef} className={`min-w-0 xl:h-full flex flex-col overflow-y-auto w-full xl:my-6 z-10 transition-colors duration-250 ${activeTab === 'brainstorm' ? 'p-0' : 'p-4 md:p-8'}`}>

        {/* Workspace Title Bar */}
        {activeTab !== 'brainstorm' && (
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
        )}

        {/* Workspace Panels Overlapping Paper Sheet Grid */}
        <div className={`grid grid-cols-1 ${showInlineRightPanel ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : ''} gap-6 z-0 items-start`}>
          <div className="space-y-6 min-w-0">
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
                    navigate(`/workflows?draft=${draftId}`);
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
          {showAppRightPanel && (
            <ContextPanel
              workspaceScope={workspaceScope}
              latestTask={latestTask}
              dashboardSnapshot={dashboardSnapshot}
              contentPackage={contentPackage}
              setActiveTab={setActiveTab}
              onClose={() => setRightPanelOpen(false)}
            />
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

      {/* AI assistant mount */}
      <PageContextTracker contextByPath={assistantContextByPath} />
      <AssistantBubble />
      <AssistantPanel onNavigate={onAssistantNavigate} />

    </div>
  );
}