import { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { API_BASE_URL } from './hooks/useApi';
import { ProjectManager } from './components/ProjectManager';
import { WorkflowBuilder } from './components/WorkflowBuilder';
import type { BrandContext, CampaignRecord, ProjectRecord } from './types/workspace';

type Tab = 'dashboard' | 'projects' | 'builder' | 'copy' | 'image' | 'storyboard' | 'audio' | 'community' | 'config';
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
  api_key: string;
  base_url: string;
  model_name: string;
  is_active: boolean;
}

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

export default function App() {
  // Theme state: Dark Chalkboard vs Light Paper Editorial
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('mh_darkMode') === 'true';
  });

  const [token, setToken] = useState<string | null>(localStorage.getItem('mh_token'));
  const [username, setUsername] = useState<string | null>(localStorage.getItem('mh_username'));
  const [loginForm, setLoginForm] = useState({ username: 'ROOT', password: '123' });
  const [authError, setAuthError] = useState('');
  
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
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
    model_name: ''
  });
  const [showKey, setShowKey] = useState(false);

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
  }, [darkMode]);

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('mh_token', data.token);
        localStorage.setItem('mh_username', data.username);
        setToken(data.token);
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
      const res = await fetch(`${API_BASE_URL}/ai/config/`);
      if (res.ok) {
        const data: AiConfig[] = await res.json();
        setAiConfigs(data);
        const active = data.find((c) => c.is_active);
        if (active) {
          setActiveConfigForm({
            provider: active.provider,
            api_key: active.api_key,
            base_url: active.base_url,
            model_name: active.model_name
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
      const res = await fetch(`${API_BASE_URL}/ai/config/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeConfigForm),
      });
      if (res.ok) {
        triggerToast('AI 接口配置保存并激活成功', 'success');
        fetchConfigs();
      } else {
        triggerToast('配置保存失败', 'error');
      }
    } catch {
      triggerToast('配置保存失败，连接异常', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchCommunity = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/community/creations/`);
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
      const res = await fetch(`${API_BASE_URL}/workspace/bootstrap/?${params.toString()}`);
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
      const res = await fetch(`${API_BASE_URL}/dashboard/?${params.toString()}`);
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
    setActiveTab('builder');
    triggerToast('当前项目范围已切换', 'success');
  }, [triggerToast, username]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchConfigs();
      fetchCommunity();
      fetchWorkspaceBootstrap();
      fetchDashboard();
      fetch(`${API_BASE_URL}/ai/config/`)
        .then((res) => {
          if (res.ok) setApiLive(true);
        })
        .catch(() => setApiLive(false));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchConfigs, fetchCommunity, fetchWorkspaceBootstrap, fetchDashboard]);

  const handleLike = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/community/creations/${id}/like/`, {
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
      const res = await fetch(`${API_BASE_URL}/community/creations/`, {
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
      const res = await fetch(`${API_BASE_URL}/community/search/?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setCommunityItems(data.results);
        setRagLogs(data.rag_logs);
        setIsRagActive(true);
        triggerToast('RAG 语义检索索引更新完毕', 'success');
      }
    } catch {
      triggerToast('RAG 检索请求错误', 'error');
    } finally {
      setLoading(false);
    }
  };

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const pollGenerationTask = async (taskId: number): Promise<GenerationTaskRecord> => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const res = await fetch(`${API_BASE_URL}/tasks/${taskId}/`);
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
    const res = await fetch(`${API_BASE_URL}/tasks/${taskId}/`);
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
    setAgentLogs([initialLog, '[0.01s] [INFO] Queued task submitted to backend task ledger.']);
    try {
      const res = await fetch(`${API_BASE_URL}/tasks/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_type: taskType,
          payload,
          username: username || 'ROOT',
          organization: workspaceScope?.organization.slug,
          project: workspaceScope?.project.slug,
          campaign: workspaceScope?.campaign.id,
          run_now: false,
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
          `[QUEUE] Task #${task.id} is still ${task.status}. Start a Celery worker or run process_generation_tasks to complete it.`,
        ]);
        triggerToast('任务已进入队列，等待 worker 执行', 'info');
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
              // ANALOG EDITORIAL WORKSPACE
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {authError && (
              <div className="border border-[var(--editorial-stroke)] text-rose-600 bg-rose-50 dark:bg-rose-950/20 p-3 text-xs font-mono font-semibold">
                <span>{authError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider block font-mono">// USERNAME</label>
              <input
                type="text"
                required
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] px-2 py-2 text-sm focus:outline-none focus:border-b-2 font-mono transition-all"
                placeholder="输入管理员账号"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider block font-mono">// PASSWORD</label>
              <input
                type="password"
                required
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] px-2 py-2 text-sm focus:outline-none focus:border-b-2 font-mono transition-all"
                placeholder="输入密码"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
              ) : null}
              {loading ? '正在载入稿件...' : '翻开设计手账'}
            </button>
          </form>

          {/* Quick preset credentials helper */}
          <div className="mt-6 pt-5 border-t border-dashed border-[var(--editorial-stroke)] text-center font-mono">
            <span className="text-[10px] text-[var(--editorial-text-gray)] font-semibold block">演示凭证预置: ROOT / 123</span>
            <button 
              onClick={() => {
                setLoginForm({ username: 'ROOT', password: '123' });
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
    <div className="min-h-screen bg-[var(--editorial-bg)] text-[var(--editorial-text)] flex flex-col md:flex-row relative overflow-hidden transition-colors duration-250 font-sans">
      
      {/* Dynamic toast alerts */}
      {feedbackMsg && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-4 border-1.5 border-[var(--editorial-stroke)] shadow-editorial bg-[var(--editorial-paper)] animate-in slide-in-from-top duration-200 font-mono text-xs font-semibold toast-${feedbackMsg.type}`}>
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* 1. SINGLE-LEVEL LEFT GUTTER (无边框侧边栏) */}
      <aside className="w-full md:w-60 flex flex-col justify-between shrink-0 p-6 z-10 md:my-6 md:ml-6 md:mr-2">
        <div className="flex flex-col gap-10">
          
          {/* Elegant serif logo */}
          <div className="flex flex-col gap-1 select-none">
            {/* APP LOGO PLACEHOLDER: 
                Swap this block out for your standard logo file if desired.
                Example:
                <img src="/logo.png" className="h-6 w-auto" alt="Logo" />
            */}
            <h1 className="serif-header text-xl font-bold tracking-tight text-[var(--editorial-text)]">
              Marketing-Hub
            </h1>
            <p className="text-[9px] text-[var(--editorial-text-gray)] font-bold uppercase tracking-widest font-mono leading-none">
              // EDITORIAL WORKSPACE
            </p>
          </div>

          {/* Links list with brackets menu indicators */}
          <nav className="flex flex-col gap-3 font-mono">
            <div className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase tracking-wider mb-1">
              // 运营空间
            </div>

            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full text-left py-1 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'text-[var(--editorial-text)]'
                  : 'text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)]'
              }`}
            >
              {activeTab === 'dashboard' ? '[ 数据看板 ]' : '  数据看板'}
            </button>

            {[
              { id: 'projects', label: '我的项目' },
              { id: 'builder', label: '画布编排' },
            ].map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as Tab)}
                  className={`w-full text-left py-1 text-xs font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'text-[var(--editorial-text)]'
                      : 'text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)]'
                  }`}
                >
                  {isActive ? `[ ${item.label} ]` : `  ${item.label}`}
                </button>
              );
            })}

            <div className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase tracking-wider mb-1">
              // AIGC 编排
            </div>

            {[
              { id: 'copy', label: '智能文案' },
              { id: 'image', label: '社媒图片' },
              { id: 'storyboard', label: '分镜脚本' },
              { id: 'audio', label: '语音合成' }
            ].map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as Tab)}
                  className={`w-full text-left py-1 text-xs font-bold transition-all cursor-pointer ${
                    isActive 
                      ? 'text-[var(--editorial-text)]' 
                      : 'text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)]'
                  }`}
                >
                  {isActive ? `[ ${item.label} ]` : `  ${item.label}`}
                </button>
              );
            })}

            <div className="text-[9px] text-[var(--editorial-text-gray)] font-black uppercase tracking-wider mt-6 mb-1">
              // 馆藏空间
            </div>

            {[
              { id: 'community', label: '手绘社区' },
              { id: 'config', label: '接口密钥' }
            ].map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as Tab)}
                  className={`w-full text-left py-1 text-xs font-bold transition-all cursor-pointer ${
                    isActive 
                      ? 'text-[var(--editorial-text)]' 
                      : 'text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)]'
                  }`}
                >
                  {isActive ? `[ ${item.label} ]` : `  ${item.label}`}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Switcher & User deck */}
        <div className="pt-6 border-t border-dashed border-[var(--editorial-stroke)]/40 space-y-4 font-mono">
          
          {/* Light/Dark Toggle */}
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-bold text-[var(--editorial-text-gray)]">黑板暗色模式</span>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="h-5 w-10 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] relative transition-all active:scale-95 cursor-pointer"
            >
              <div className={`h-3 w-3 bg-[var(--editorial-stroke)] absolute top-0.5 transition-all ${
                darkMode ? 'right-0.5' : 'left-0.5'
              }`}></div>
            </button>
          </div>

          <div className="text-xs font-bold flex flex-col gap-1">
            <span className="text-[var(--editorial-text)]">{username || 'ROOT'}</span>
            <span className="text-[8px] bg-[var(--editorial-unselected)] text-[var(--editorial-text-gray)] px-1 py-0.5 inline-block w-fit uppercase font-mono">Super Admin</span>
          </div>

          <button
            onClick={handleLogout}
            className="w-full text-left py-1.5 text-[10px] text-rose-500 font-bold transition-all hover:underline cursor-pointer"
          >
            <span>合上设计草稿本</span>
          </button>
        </div>
      </aside>

      {/* 2. OVERLAPPING PAPER MAIN WORKSPACE (纸张叠落画板) */}
      <main className="flex-grow flex flex-col p-4 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full md:my-6 md:mr-6 z-10 transition-colors duration-250">
        
        {/* Workspace Title Bar */}
        <header className="flex justify-between items-center mb-8 pb-3 border-b border-[var(--editorial-stroke)]">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-[var(--editorial-text)] serif-header">
              {activeTab === 'dashboard' && '项目制运营与成本看板'}
              {activeTab === 'projects' && '我的项目与品牌记忆'}
              {activeTab === 'builder' && '画布编排与节点执行'}
              {activeTab === 'copy' && '智能营销文案排版'}
              {activeTab === 'image' && '社媒手绘图片视觉'}
              {activeTab === 'storyboard' && '场景分镜脚本大纲'}
              {activeTab === 'audio' && '流式配音语音合成'}
              {activeTab === 'community' && '手绘创作作品 Gallery Feed'}
              {activeTab === 'config' && 'AI API 统一网关与密钥配置'}
            </h2>
            <p className="text-[9px] text-[var(--editorial-text-gray)] font-bold uppercase tracking-widest font-mono">
              {activeTab === 'dashboard' ? '// Workspace, task ledger and cost audit' : activeTab === 'community' ? '// Shared typed manuscripts feed' : activeTab === 'projects' ? '// Project registry and brand context' : activeTab === 'builder' ? '// Visual workflow engine' : '// Editorial pipeline controller'}
            </p>
          </div>
          
          <div className="flex flex-col items-end gap-1 text-[9px] font-bold font-mono">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              <span>GATE: {apiLive ? 'LIVE' : 'SANDBOX'}</span>
            </div>
            {workspaceScope && (
              <span className="text-[var(--editorial-text-gray)]">
                {workspaceScope.organization.slug}/{workspaceScope.project.slug}
              </span>
            )}
          </div>
        </header>

        {/* Workspace Panels Overlapping Paper Sheet Grid */}
        <div className="flex-grow flex flex-col justify-between z-0">
          {activeTab === 'projects' && (
            <ProjectManager
              organization={workspaceScope?.organization || null}
              activeProjectId={workspaceScope?.project.id}
              onSelectScope={handleSelectProjectScope}
              triggerToast={triggerToast}
            />
          )}

          {activeTab === 'builder' && (
            <WorkflowBuilder
              organization={workspaceScope?.organization || null}
              project={workspaceScope?.project || null}
              campaign={workspaceScope?.campaign?.id ? workspaceScope.campaign : null}
              username={username || 'ROOT'}
              triggerToast={triggerToast}
            />
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
              </div>

              <div className="xl:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-5">
                {[
                  ['任务总量', dashboardSnapshot?.metrics.task_count ?? 0],
                  ['成功任务', dashboardSnapshot?.metrics.successful_tasks ?? 0],
                  ['社区作品', dashboardSnapshot?.metrics.community_count ?? 0],
                  ['资产记录', dashboardSnapshot?.metrics.asset_count ?? 0],
                  ['Token 审计', dashboardSnapshot?.metrics.total_tokens ?? 0],
                  ['账单估算 USD', dashboardSnapshot?.metrics.total_cost_usd ?? '0.0000'],
                ].map(([label, value]) => (
                  <div key={label} className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
                    <span className="block text-[9px] text-[var(--editorial-text-gray)] font-black uppercase tracking-wider font-mono">{label}</span>
                    <span className="block mt-2 text-2xl font-black serif-header text-[var(--editorial-text)]">{value}</span>
                  </div>
                ))}

                <div className="md:col-span-2 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial paper-sheet-2">
                  <div className="flex justify-between border-b border-[var(--editorial-stroke)] pb-3 mb-4">
                    <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono">// TASK TYPE DISTRIBUTION</h3>
                    <span className="text-[9px] font-mono text-[var(--editorial-text-gray)]">LIVE DB RECORDS</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
                    {['copy', 'image', 'storyboard', 'audio'].map((taskType) => (
                      <div key={taskType} className="border border-[var(--editorial-stroke)] p-3">
                        <span className="block text-[9px] text-[var(--editorial-text-gray)] uppercase font-black">{taskType}</span>
                        <span className="block mt-1 font-black text-lg">{dashboardSnapshot?.tasks_by_type[taskType] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 border-t border-dashed border-[var(--editorial-stroke)]/40 pt-4">
                    {latestTask && (
                      <div className="mb-4 border border-[var(--editorial-stroke)] p-3 font-mono">
                        <span className="block text-[9px] text-[var(--editorial-text-gray)] uppercase font-black">Latest Queued Task</span>
                        <div className="mt-2 flex flex-wrap justify-between gap-3 text-[10px]">
                          <span>#{latestTask.id} / {latestTask.task_type}</span>
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
                            <span>{event.total_tokens} tokens / ${event.cost_usd}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
                    <span>RATIO: {imageOutput.aspectRatio}</span>
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
              
              {/* RAG search box card */}
              <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial relative">
                
                <div>
                  <h3 className="text-sm font-black text-[var(--editorial-text)] flex items-center gap-2 font-mono uppercase">
                    <span>[ RAG RETRIEVAL ENGINE ]</span>
                  </h3>
                  <p className="text-[10px] text-[var(--editorial-text-gray)] mt-1.5 leading-relaxed font-bold">
                    已将手写画板数据完成本地向量库 RAG 索引，支持对文本、分镜、图片描述执行高对比度语义检索。
                  </p>
                </div>

                <form onSubmit={handleRAGSearch} className="flex gap-3 mt-4">
                  <div className="relative flex-grow">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] px-1 py-3 text-xs focus:outline-none focus:border-b-2 transition-all font-semibold font-mono"
                      placeholder="输入关键词进行语义检索 (如: 小红书咖啡、视觉工作区、文案神器) ..."
                    />
                  </div>
                  
                  {/* Action highlight primary */}
                  <button
                    type="submit"
                    className="bg-[var(--editorial-stroke)] text-[var(--editorial-bg)] border border-[var(--editorial-stroke)] font-black px-6 py-3 text-xs transition-all shadow-editorial active:shadow-none active:translate-x-[3px] active:translate-y-[3px] cursor-pointer"
                  >
                    <span>RAG 检索</span>
                  </button>
                </form>

                {/* RAG search index logs */}
                {isRagActive && ragLogs.length > 0 && (
                  <div className="bg-[var(--editorial-bg)]/40 border border-[var(--editorial-stroke)]/40 p-4 mt-3">
                    <span className="text-[8px] text-[var(--editorial-text-gray)] font-black block border-b border-dashed border-[var(--editorial-stroke)]/40 pb-1.5 mb-2">
                      RAG PIPELINE EXECUTION STACK TRACE LOGS
                    </span>
                    <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
                      {ragLogs.map((log, idx) => (
                        <div key={idx} className="font-mono text-[9px] text-[var(--editorial-text-gray)] font-semibold">
                          {log}
                        </div>
                      ))}
                    </div>
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

          {/* ==================== 6. CONFIG ROUTER WORKSPACE ==================== */}
          {activeTab === 'config' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start font-mono">
              
              {/* Form config panel */}
              <form onSubmit={handleSaveConfig} className="col-span-1 lg:col-span-6 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial relative flex flex-col gap-5">
                <div className="flex justify-center border-b border-[var(--editorial-stroke)] pb-4">
                  <Sparkles className="h-6 w-6 text-[var(--editorial-text)]" />
                </div>
                
                <h3 className="text-sm font-black text-[var(--editorial-text)] border-b border-[var(--editorial-stroke)] pb-2 flex items-center gap-2 font-mono uppercase">
                  <span>API ROUTER KEY CONFIG</span>
                </h3>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">选择服务商</label>
                  <select
                    value={activeConfigForm.provider}
                    onChange={(e) => setActiveConfigForm({ ...activeConfigForm, provider: e.target.value })}
                    className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
                  >
                    <option value="mock">Mock Sandbox Simulator (沙箱模拟演示)</option>
                    <option value="gemini">Google Gemini API (标准接口)</option>
                    <option value="openai">OpenAI API (标准接口)</option>
                  </select>
                </div>

                {activeConfigForm.provider !== 'mock' && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">API KEY 密钥</label>
                      <div className="relative">
                        <input
                          type={showKey ? "text" : "password"}
                          required
                          value={activeConfigForm.api_key}
                          onChange={(e) => setActiveConfigForm({ ...activeConfigForm, api_key: e.target.value })}
                          className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono"
                          placeholder={activeConfigForm.api_key ? "API 密钥已保存 (输入新密钥以覆盖)" : "请输入 API Key"}
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
                        placeholder="e.g. https://api.openai-proxy.org/v1"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider flex items-center justify-between font-mono">
                        <span>指定模型名称 Model Name</span>
                        <span className="text-[8px] text-[var(--editorial-text-gray)] lowercase tracking-normal">可选配置</span>
                      </label>
                      <input
                        type="text"
                        value={activeConfigForm.model_name}
                        onChange={(e) => setActiveConfigForm({ ...activeConfigForm, model_name: e.target.value })}
                        className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono"
                        placeholder={activeConfigForm.provider === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini'}
                      />
                    </div>
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
                    <span>GATEWAY DATABASE STATS</span>
                  </h4>
                  
                  <div className="space-y-3">
                    {aiConfigs.map((config) => (
                      <div key={config.id} className={`p-4 border-1.5 flex items-center justify-between ${
                        config.is_active 
                          ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/40 text-[var(--editorial-text)]' 
                          : 'border-dashed border-[var(--editorial-stroke)]/40 bg-[var(--editorial-paper)] text-[var(--editorial-text-gray)]'
                      }`}>
                        <div>
                          <span className="text-xs font-black block">{config.provider_display}</span>
                          <div className="flex items-center gap-2.5 mt-1 text-[8px] font-bold uppercase font-mono">
                            <span>Key: {config.api_key || 'Unset'}</span>
                            {config.model_name && (
                              <>
                                <span>•</span>
                                <span>Model: {config.model_name}</span>
                              </>
                            )}
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
                    <span className="font-bold text-[var(--editorial-text)] block mb-1">// API GATEWAY MANUAL</span>
                    1. 本系统将所有 AIGC Agent 调用接口完全收归至底层 sqlite 数据库进行保存。
                    <br />
                    2. 无 API 密钥时，系统将无缝调用本地 Agent 仿真编排引擎，输出高保真演示数据。
                  </div>
                </div>
              </div>

            </div>
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

// Sub-component: AIGC Agent workflow logger console
function AgentTerminal({ logs }: { logs: string[] }) {
  const [open, setOpen] = useState(true);
  
  return (
    <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] overflow-hidden shadow-editorial transform rotate-[0.1deg]">
      <button 
        onClick={() => setOpen(!open)}
        className="w-full bg-[var(--editorial-unselected)] px-5 py-3 border-b-1.5 border-[var(--editorial-stroke)] flex items-center justify-between text-[10px] font-black text-[var(--editorial-text)] font-mono tracking-wider cursor-pointer transition-all"
      >
        <span className="flex items-center gap-2">
          <span>AI AGENT DRAFT PIPELINE STACK TRACE CONSOLE</span>
        </span>
        <span className="text-[9px] bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] px-2 py-0.5 font-bold">
          {open ? 'COLLAPSE' : 'EXPAND'}
        </span>
      </button>

      {open && (
        <div className="bg-[var(--editorial-bg)]/60 p-4 font-mono text-[9px] leading-relaxed text-[var(--editorial-text)] max-h-[140px] overflow-y-auto pr-1 border-t border-[var(--editorial-stroke)]">
          {logs.length === 0 ? (
            <div className="text-[var(--editorial-text-gray)] font-bold">// Waiting for AIGC Agent workflow triggers to print pipeline stack trace...</div>
          ) : (
            <div className="space-y-1.5">
              {logs.map((log, idx) => {
                let colorClass = 'text-[var(--editorial-text)]';
                if (log.includes('[WARN]')) colorClass = 'text-yellow-600 dark:text-yellow-400 font-bold';
                if (log.includes('[ERROR]')) colorClass = 'text-red-500 font-black';
                if (log.includes('[SUCCESS]')) colorClass = 'text-emerald-600 dark:text-emerald-400 font-bold';
                if (log.includes('---')) colorClass = 'text-[var(--editorial-accent-blue)] font-black border-b border-dashed border-[var(--editorial-stroke)]/40 pb-1 mb-1 block';
                
                return (
                  <div key={idx} className={`${colorClass} font-semibold`}>
                    {log}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
