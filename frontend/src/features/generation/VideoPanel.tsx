import { useState } from 'react';
import {
  Check,
  Film,
  Image,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react';
import { AgentTerminal } from './AgentTerminal';
import { BrandMemorySummary } from '../brand-memory';
import { TaskStatusCard } from './TaskStatusCard';
import { useGenerationTask } from './useGenerationTask';
import { SaveControlBar } from './SaveControlBar';
import type { CreationContent, StoryboardOutput, VideoOutput } from './types';
import type { WorkspaceScope } from '../dashboard/types';
import type { FeatureEntitlements, GenerationTaskRecord } from '../../types/workspace';
import type { ErrorActionId } from '../../shared/api/errorActions';
import type { ToastMessage } from '../../shared/types/toast';

interface VideoPanelProps {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  agentLogs: string[];
  setAgentLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setLatestTask: (task: GenerationTaskRecord) => void;
  triggerToast: (input: string | ToastMessage, type?: 'success' | 'info' | 'error') => void;
  onErrorAction?: (actionId: ErrorActionId) => void;
  fetchDashboard: () => Promise<void>;
  onWorkspaceRefresh?: () => Promise<void>;
  onShare: (type: 'video', title: string, content: CreationContent) => Promise<void>;
  latestStoryboard?: StoryboardOutput | null;
  featureEntitlements?: Partial<FeatureEntitlements>;
  onOpenBilling?: () => void;
}

type CreativeMode = 'movie_studio' | 'single_shot' | 'picture_narration';

interface VideoSceneInput {
  visual: string;
  narration: string;
  duration: number;
  camera: string;
  referenceImageUrl: string;
}

const defaultVideoScenes: VideoSceneInput[] = [
  {
    visual: '清晨光线扫过创意工作台，屏幕中出现品牌项目看板与素材缩略图，镜头停在打开的视频时间线上。',
    narration: '一个好创意，应该从想法直接走到成片。',
    duration: 5,
    camera: '横移后轻微推近',
    referenceImageUrl: '',
  },
  {
    visual: '创作者拖拽分镜、图片和视频节点，画面切到生成结果快速迭代。',
    narration: '文案、分镜、素材和视频生成，可以在同一个工作流里完成。',
    duration: 7,
    camera: '匹配剪辑，节奏加快',
    referenceImageUrl: '',
  },
  {
    visual: '成片预览在大屏播放，团队完成审核并准备发布。',
    narration: '让每一次营销制作，都更快、更稳、更可控。',
    duration: 6,
    camera: '缓慢拉远，结尾留白',
    referenceImageUrl: '',
  },
];

function splitLines(value: string) {
  return value.split('\n').map((line) => line.trim()).filter(Boolean);
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function draftScenesFromScript(script: string): VideoSceneInput[] {
  const chunks = script
    .split(/[\n。！？!?]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 5);
  const source = chunks.length ? chunks : ['开场建立主题', '展示核心价值', '结尾形成记忆点'];
  return source.map((chunk, index) => ({
    visual: `${chunk}。画面包含明确主体、空间、动作起点和结束落点。`,
    narration: index === 0 ? '快速抓住注意力。' : '',
    duration: index === source.length - 1 ? 6 : 5,
    camera: index === 0 ? '建立镜头后推近' : '稳定跟随主体动作',
    referenceImageUrl: '',
  }));
}

export function VideoPanel({
  workspaceScope,
  username,
  loading: _loading,
  setLoading: _setLoading,
  agentLogs,
  setAgentLogs,
  setLatestTask,
  triggerToast,
  onErrorAction,
  fetchDashboard,
  onWorkspaceRefresh,
  onShare,
  latestStoryboard,
  featureEntitlements,
  onOpenBilling,
}: VideoPanelProps) {
  void _loading;
  void _setLoading;

  const [videoInput, setVideoInput] = useState({
    topic: 'Marketing Hub 品牌宣传片',
    prompt: '电影感品牌营销短片，清晰主体、平滑运镜、专业布光、广告级画质。',
    script: '一个创作者打开 Marketing Hub：先把营销想法拆成分镜，再生成参考视觉和视频片段，最后团队在同一工作区审核并发布。',
    creativeMode: 'movie_studio' as CreativeMode,
    targetAudience: '营销团队、品牌创作者、内容运营负责人',
    platform: 'Douyin',
    visualStyle: '现代编辑部工作台，真实产品感，温暖自然光，克制但高级',
    cameraStyle: '稳定推拉、轻微环绕、节点到成片的匹配剪辑',
    negativePrompt: '低清晰度、随机文字、水印、畸形手部、脸部漂移、品牌标识错误',
    aspectRatio: '16:9',
    duration: 18,
    imageUrl: '',
    characters: '主创作者：30 岁左右，专注、可信赖，穿简洁浅色衬衫\n审核同事：在结尾出现，表达确认和协作',
    keyframes: '',
  });
  const [videoScenes, setVideoScenes] = useState<VideoSceneInput[]>(defaultVideoScenes);
  const [videoOutput, setVideoOutput] = useState<VideoOutput>({
    video_topic: 'Marketing Hub 品牌宣传片',
    aspect_ratio: '16:9',
    video_url: '',
    thumbnail_url: '',
    duration_seconds: 18,
  });
  const [videoPlaybackError, setVideoPlaybackError] = useState('');
  const [videoPollHint, setVideoPollHint] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const canRenderVideo = featureEntitlements?.video_render ?? true;

  const { submitVideoGeneration, taskUiState, lastCompletedTaskId, setLastCompletedTaskId } = useGenerationTask({
    setLoading: setIsRunning,
    setAgentLogs,
    setLatestTask,
    triggerToast,
    workspaceScope,
    username,
    fetchDashboard,
    onWorkspaceRefresh,
  });

  const characters = splitLines(videoInput.characters);
  const keyframes = splitLines(videoInput.keyframes);
  const scenes = videoScenes
    .map((scene, index) => ({
      scene_number: index + 1,
      visual_description: scene.visual.trim(),
      audio_narration: scene.narration.trim(),
      duration_seconds: scene.duration,
      camera_motion: scene.camera.trim(),
      reference_image_url: scene.referenceImageUrl.trim(),
    }))
    .filter((scene) => scene.visual_description || scene.audio_narration || scene.camera_motion || scene.reference_image_url);
  const referenceImages = Array.from(new Set([
    videoInput.imageUrl.trim(),
    ...keyframes.filter(isHttpUrl),
    ...scenes.map((scene) => scene.reference_image_url).filter(isHttpUrl),
  ].filter(Boolean)));
  const totalDuration = videoScenes.reduce((sum, scene) => sum + scene.duration, 0);
  const effectiveDuration = totalDuration || videoInput.duration;
  const readiness = [
    { label: 'Brief', ready: Boolean(videoInput.topic.trim() && videoInput.script.trim()) },
    { label: 'Shots', ready: scenes.length > 0 },
    { label: 'Assets', ready: characters.length > 0 || referenceImages.length > 0 },
    { label: 'Render', ready: scenes.length > 0 && Boolean(videoInput.prompt.trim()) },
  ];

  const updateScene = (index: number, patch: Partial<VideoSceneInput>) => {
    setVideoScenes((current) => current.map((scene, sceneIndex) => (
      sceneIndex === index ? { ...scene, ...patch } : scene
    )));
  };

  const addScene = () => {
    setVideoScenes((current) => [
      ...current,
      { visual: '', narration: '', duration: 5, camera: '', referenceImageUrl: '' },
    ]);
  };

  const removeScene = (index: number) => {
    setVideoScenes((current) => current.length > 1 ? current.filter((_, sceneIndex) => sceneIndex !== index) : current);
  };

  const handleDraftScenesFromScript = () => {
    const draftedScenes = draftScenesFromScript(videoInput.script || videoInput.prompt);
    setVideoScenes(draftedScenes);
    setVideoInput((current) => ({
      ...current,
      duration: draftedScenes.reduce((sum, scene) => sum + scene.duration, 0),
      creativeMode: 'movie_studio',
    }));
    triggerToast('已生成拍摄计划', 'success');
  };

  const handleImportStoryboard = () => {
    if (!latestStoryboard?.scenes?.length) {
      triggerToast('还没有可导入的分镜，请先在「写分镜」生成分镜。', 'info');
      return;
    }
    const importedScenes = latestStoryboard.scenes.map((scene) => ({
      visual: scene.visual_description,
      narration: scene.audio_narration,
      duration: scene.duration_seconds,
      camera: '按分镜描述保持稳定运镜',
      referenceImageUrl: '',
    }));
    setVideoScenes(importedScenes);
    setVideoInput((current) => ({
      ...current,
      topic: latestStoryboard.video_topic || current.topic,
      targetAudience: latestStoryboard.target_audience || current.targetAudience,
      duration: latestStoryboard.total_duration_seconds || importedScenes.reduce((sum, scene) => sum + scene.duration, 0),
      creativeMode: 'movie_studio',
    }));
    triggerToast(`已导入 ${importedScenes.length} 个分镜`, 'success');
  };

  const handleGenerateVideo = () => {
    if (!canRenderVideo) {
      triggerToast('视频 Render 是 Pro 能力。免费用户可以准备分镜和镜头，升级后再渲染。', 'info');
      onOpenBilling?.();
      return;
    }
    setVideoPlaybackError('');
    setVideoPollHint('');
    setVideoOutput((prev) => ({
      ...prev,
      video_topic: videoInput.topic,
      aspect_ratio: videoInput.aspectRatio,
      duration_seconds: effectiveDuration,
      video_url: '',
      scenes,
      creative_mode: videoInput.creativeMode,
      is_demo_fallback: false,
    }));
    void submitVideoGeneration(
      {
        video_topic: videoInput.topic,
        prompt: videoInput.prompt,
        script: videoInput.script,
        creative_mode: videoInput.creativeMode,
        target_audience: videoInput.targetAudience,
        platform: videoInput.platform,
        visual_style: videoInput.visualStyle,
        camera_style: videoInput.cameraStyle,
        negative_prompt: videoInput.negativePrompt,
        characters,
        keyframes,
        reference_images: referenceImages,
        scenes,
        aspect_ratio: videoInput.aspectRatio,
        duration: effectiveDuration,
        ...(videoInput.imageUrl.trim() ? { image_url: videoInput.imageUrl.trim() } : {}),
      },
      (result) => {
        setVideoOutput({
          ...result,
          video_topic: result.video_topic || videoInput.topic,
          aspect_ratio: result.aspect_ratio || videoInput.aspectRatio,
          duration_seconds: result.duration_seconds || effectiveDuration,
          scenes: result.scenes?.length ? result.scenes : scenes,
          creative_mode: result.creative_mode || videoInput.creativeMode,
        });
        setVideoPollHint('');
      },
      setVideoPollHint,
    );
  };

  const previewScenes = videoOutput.scenes?.length ? videoOutput.scenes : scenes;

  return (
    <div className="generation-workspace generation-workspace--with-result">
      <div className="generation-workspace__form bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial paper-sheet-1 relative">
        <div className="generation-workspace__form-body">
          <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono">// VIDEO STICKY SLATE</h3>
          <BrandMemorySummary
            projectName={workspaceScope?.project.name}
            context={workspaceScope?.project.brand_context}
            compact
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">视频主题</label>
            <input
              type="text"
              value={videoInput.topic}
              onChange={(e) => setVideoInput({ ...videoInput, topic: e.target.value })}
              className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none focus:border-b-2 font-mono font-semibold"
              placeholder="请输入视频主题..."
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">剧本 / Brief</label>
            <textarea
              rows={4}
              value={videoInput.script}
              onChange={(e) => setVideoInput({ ...videoInput, script: e.target.value })}
              className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] p-3 text-xs focus:outline-none resize-none font-semibold font-mono leading-relaxed"
              placeholder="描述视频结构、核心信息和想呈现的画面..."
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleImportStoryboard}
              className="bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] hover:bg-[var(--editorial-unselected)] px-3 py-2 text-[10px] font-black uppercase flex items-center justify-center gap-1.5"
            >
              <Film className="h-3.5 w-3.5" />
              <span>导入写分镜</span>
            </button>
            <button
              type="button"
              onClick={handleDraftScenesFromScript}
              className="bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] hover:bg-[var(--editorial-unselected)] px-3 py-2 text-[10px] font-black uppercase flex items-center justify-center gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>生成镜头</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">投放平台</label>
              <select
                value={videoInput.platform}
                onChange={(e) => setVideoInput({ ...videoInput, platform: e.target.value })}
                className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
              >
                <option value="Douyin">抖音 / TikTok</option>
                <option value="Xiaohongshu">小红书</option>
                <option value="Bilibili">Bilibili</option>
                <option value="YouTube">YouTube</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">画幅比例</label>
              <select
                value={videoInput.aspectRatio}
                onChange={(e) => setVideoInput({ ...videoInput, aspectRatio: e.target.value })}
                className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
              >
                <option value="16:9">16:9 横版</option>
                <option value="9:16">9:16 竖版</option>
                <option value="1:1">1:1 方图</option>
                <option value="4:5">4:5 信息流</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 font-mono">
            <div className="flex justify-between items-center text-[10px] font-bold text-[var(--editorial-text)]">
              <span className="uppercase">目标时长 Duration</span>
              <span className="bg-[var(--editorial-bg)]/40 border border-[var(--editorial-stroke)]/40 px-1.5 text-xs">{videoInput.duration}s</span>
            </div>
            <input
              type="range"
              min="5"
              max="120"
              step="1"
              value={videoInput.duration}
              onChange={(e) => setVideoInput({ ...videoInput, duration: parseInt(e.target.value, 10) })}
              className="editorial-slider mt-2"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">画面风格 Prompt</label>
            <textarea
              rows={3}
              value={videoInput.prompt}
              onChange={(e) => setVideoInput({ ...videoInput, prompt: e.target.value })}
              className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] p-3 text-xs focus:outline-none resize-none font-semibold font-mono leading-relaxed"
              placeholder="写清楚质感、光线、主体、镜头语言..."
            />
          </div>

          <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/30 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase font-mono">
                Shot List · {videoScenes.length} 镜头 · {totalDuration}s
              </span>
              <button
                type="button"
                onClick={addScene}
                className="bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] px-2.5 py-1 text-[10px] font-black uppercase flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>添加</span>
              </button>
            </div>

            <div className="space-y-3">
              {videoScenes.map((scene, index) => (
                <div key={`shot-${index}`} className="bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-black uppercase">Shot {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeScene(index)}
                      disabled={videoScenes.length <= 1}
                      className="grid h-7 w-7 place-items-center border border-[var(--editorial-stroke)] disabled:opacity-40"
                      aria-label={`删除镜头 ${index + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={scene.visual}
                    onChange={(e) => updateScene(index, { visual: e.target.value })}
                    className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] p-2 text-xs focus:outline-none resize-none font-semibold font-mono leading-relaxed"
                    placeholder="画面描述"
                  />
                  <div className="flex items-center gap-2 font-mono">
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      value={scene.duration}
                      onChange={(e) => updateScene(index, { duration: parseInt(e.target.value, 10) })}
                      className="editorial-slider min-w-0 flex-1"
                      aria-label={`镜头 ${index + 1} 时长`}
                    />
                    <span className="w-10 text-right text-[10px] font-black">{scene.duration}s</span>
                  </div>
                  <input
                    type="text"
                    value={scene.camera}
                    onChange={(e) => updateScene(index, { camera: e.target.value })}
                    className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono font-semibold"
                    placeholder="运镜，例如：稳定推近"
                  />
                  <textarea
                    rows={2}
                    value={scene.narration}
                    onChange={(e) => updateScene(index, { narration: e.target.value })}
                    className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] p-2 text-xs focus:outline-none resize-none font-semibold font-mono leading-relaxed"
                    placeholder="旁白，可留空"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">主参考图 URL</label>
              <input
                type="url"
                value={videoInput.imageUrl}
                onChange={(e) => setVideoInput({ ...videoInput, imageUrl: e.target.value })}
                className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono font-semibold"
                placeholder="https://..."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">生成模式</label>
              <select
                value={videoInput.creativeMode}
                onChange={(e) => setVideoInput({ ...videoInput, creativeMode: e.target.value as CreativeMode })}
                className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
              >
                <option value="movie_studio">分镜成片</option>
                <option value="single_shot">单镜头</option>
                <option value="picture_narration">图文旁白</option>
              </select>
            </div>
          </div>

          <details className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-3 font-mono">
            <summary className="cursor-pointer text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">高级控制</summary>
            <div className="mt-3 flex flex-col gap-3">
              <textarea
                rows={3}
                value={videoInput.characters}
                onChange={(e) => setVideoInput({ ...videoInput, characters: e.target.value })}
                className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] p-3 text-xs focus:outline-none resize-none font-semibold leading-relaxed"
                placeholder="角色设定，每行一个"
              />
              <textarea
                rows={3}
                value={videoInput.keyframes}
                onChange={(e) => setVideoInput({ ...videoInput, keyframes: e.target.value })}
                className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] p-3 text-xs focus:outline-none resize-none font-semibold leading-relaxed"
                placeholder="关键帧 URL 或描述，每行一个"
              />
              <input
                type="text"
                value={videoInput.negativePrompt}
                onChange={(e) => setVideoInput({ ...videoInput, negativePrompt: e.target.value })}
                className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-semibold"
                placeholder="负向提示词"
              />
            </div>
          </details>

          {!canRenderVideo ? (
            <div className="border border-[var(--editorial-stroke)] bg-[var(--surface-elevated)] p-3 text-[10px] font-bold leading-relaxed text-[var(--editorial-text-gray)]">
              <span className="mb-1 flex items-center gap-1.5 font-black uppercase text-[var(--editorial-text)]">
                <Lock className="h-3.5 w-3.5" />
                Pro Render
              </span>
              免费用户可以导入分镜、编辑镜头和保存方案；视频生成 Agent、视频节点渲染和长任务执行需要 Pro。
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleGenerateVideo}
            disabled={isRunning}
            className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {isRunning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : canRenderVideo ? <Play className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            <span>{isRunning ? 'VIDEO RENDERING...' : canRenderVideo ? '运行视频生成 Agent' : '升级 Pro 后渲染视频'}</span>
          </button>
        </div>

        <AgentTerminal logs={agentLogs} className="shrink-0" />
        <TaskStatusCard state={taskUiState} onRetry={handleGenerateVideo} retryDisabled={isRunning || !canRenderVideo} onErrorAction={onErrorAction} />
      </div>

      <div className="generation-workspace__results">
        <div className="generation-workspace__preview bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 pb-10 shadow-editorial paper-sheet-2 relative flex flex-col gap-4 transform rotate-[-0.3deg] h-full">
          <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)] pb-2">
            <span className="text-[10px] font-black text-[var(--editorial-text-gray)] flex items-center gap-1 font-mono uppercase">
              <Video className="h-3.5 w-3.5" />
              <span>VIDEO FILM PREVIEW</span>
            </span>
            <div className="flex gap-2">
              {videoOutput.video_url ? (
                <button
                  type="button"
                  onClick={() => onShare('video', `[视频] ${videoOutput.video_topic}`, videoOutput)}
                  className="bg-transparent border border-[var(--editorial-stroke)] hover:bg-[var(--editorial-stroke)] hover:text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer"
                >
                  <span>分享社区</span>
                </button>
              ) : null}
              {videoOutput.video_url ? (
                <a
                  href={videoOutput.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-[var(--editorial-stroke)] border border-[var(--editorial-stroke)] text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-black hover:scale-103 active:scale-97 transition-all cursor-pointer flex items-center text-center"
                >
                  打开
                </a>
              ) : null}
            </div>
          </div>

          <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/50 px-3 py-2 text-[10px] font-black uppercase text-[var(--editorial-text-muted)]">
            AI 生成初稿，发布前需人工审核
          </div>

          <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)] p-2 relative flex justify-center items-center overflow-hidden min-h-[260px]">
            {isRunning && !videoOutput.video_url ? (
              <div className="w-full h-full absolute inset-0 editorial-loader-bar flex flex-col items-center justify-center border-none">
                <RefreshCw className="h-6 w-6 animate-spin" />
                <span className="mt-3 font-mono text-[9px] font-black text-black bg-[var(--editorial-accent-yellow)] border border-black px-2 py-0.5 animate-pulse">
                  {videoPollHint || 'VIDEO RENDERING ENGINE...'}
                </span>
              </div>
            ) : videoOutput.video_url ? (
              <video
                key={videoOutput.video_url}
                controls
                playsInline
                poster={videoOutput.thumbnail_url}
                className="w-full max-h-[420px] bg-black object-contain border border-[var(--editorial-stroke)]"
                onLoadedData={() => setVideoPlaybackError('')}
                onError={() => setVideoPlaybackError('浏览器无法加载该视频地址，可点击右上角打开。')}
              >
                <source src={videoOutput.video_url} type="video/mp4" />
                您的浏览器不支持视频播放。
              </video>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-[var(--editorial-text-gray)]">
                <Film className="h-10 w-10" />
                <span className="font-mono text-[10px] font-black uppercase">Awaiting Render</span>
              </div>
            )}
          </div>

          {videoPlaybackError ? <p className="text-[10px] font-mono text-rose-600">{videoPlaybackError}</p> : null}

          <div className="grid grid-cols-4 gap-2">
            {readiness.map((item) => (
              <div key={item.label} className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/30 p-2 font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase">{item.label}</span>
                  {item.ready ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : null}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 text-[9px] text-[var(--editorial-text-gray)] font-mono uppercase">
            <div>画幅 Ratio: <span className="text-[var(--editorial-text)] font-bold">{videoOutput.aspect_ratio || videoInput.aspectRatio}</span></div>
            <div>时长 Duration: <span className="text-[var(--editorial-text)] font-bold">~{videoOutput.duration_seconds || effectiveDuration}s</span></div>
            <div>平台 Platform: <span className="text-[var(--editorial-text)] font-bold">{videoInput.platform}</span></div>
            <div>镜头 Shots: <span className="text-[var(--editorial-text)] font-bold">{previewScenes.length}</span></div>
          </div>

          <div className="border border-[var(--editorial-stroke)]/60 bg-[var(--editorial-bg)]/20 p-3">
            <span className="text-[8px] font-black text-[var(--editorial-text-gray)] uppercase block mb-2 font-mono">// TIMELINE CARDS</span>
            <div className="space-y-2">
              {previewScenes.map((scene, index) => (
                <div key={`timeline-${index}`} className="grid grid-cols-[34px_minmax(0,1fr)] gap-2 font-mono">
                  <div className="grid h-8 place-items-center border border-[var(--editorial-stroke)] bg-[var(--editorial-accent-yellow)] text-[10px] font-black">
                    {index + 1}
                  </div>
                  <div className="min-w-0 border border-[var(--editorial-stroke)]/50 bg-[var(--editorial-paper)] px-3 py-2">
                    <div className="truncate text-[10px] font-black text-[var(--editorial-text)]">{scene.visual_description}</div>
                    <div className="mt-1 text-[9px] text-[var(--editorial-text-gray)]">{scene.duration_seconds || 0}s · {scene.camera_motion || 'stable'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {videoInput.imageUrl ? (
            <div className="border border-[var(--editorial-stroke)]/60 bg-[var(--editorial-bg)]/20 p-3">
              <span className="text-[8px] font-black text-[var(--editorial-text-gray)] uppercase block mb-2 font-mono">// REFERENCE IMAGE</span>
              <div className="flex items-center gap-3">
                <Image className="h-4 w-4 shrink-0 text-[var(--editorial-text-gray)]" />
                <span className="truncate font-mono text-[10px] text-[var(--editorial-text-muted)]">{videoInput.imageUrl}</span>
              </div>
            </div>
          ) : null}

          <SaveControlBar
            visible={taskUiState.phase === 'succeeded'}
            taskId={lastCompletedTaskId}
            organizationSlug={workspaceScope?.organization.slug}
            onSaved={() => setLastCompletedTaskId(null)}
            onDiscard={() => setLastCompletedTaskId(null)}
          />
        </div>
      </div>
    </div>
  );
}
