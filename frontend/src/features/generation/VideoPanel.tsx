import { useState } from 'react';
import { AgentTerminal } from './AgentTerminal';
import { BrandMemorySummary } from '../brand-memory';
import { TaskStatusCard } from './TaskStatusCard';
import { useGenerationTask } from './useGenerationTask';
import type { CreationContent, VideoOutput } from './types';
import type { WorkspaceScope } from '../dashboard/types';
import type { GenerationTaskRecord } from '../../types/workspace';

interface VideoPanelProps {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  agentLogs: string[];
  setAgentLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setLatestTask: (task: GenerationTaskRecord) => void;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  fetchDashboard: () => Promise<void>;
  onWorkspaceRefresh?: () => Promise<void>;
  onShare: (type: 'video', title: string, content: CreationContent) => Promise<void>;
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
  fetchDashboard,
  onWorkspaceRefresh,
  onShare,
}: VideoPanelProps) {
  void _loading;
  void _setLoading;
  const [videoInput, setVideoInput] = useState({
    topic: 'Marketing Hub 品牌宣传片',
    prompt: '清晨阳光透过落地窗，咖啡杯旁一本杂志缓缓翻开，镜头推近展示精致排版与文案，电影感光影，流畅运镜，广告级画质。',
    aspectRatio: '16:9',
    duration: 5,
    imageUrl: '',
  });
  const [videoOutput, setVideoOutput] = useState<VideoOutput>({
    video_topic: 'Marketing Hub 品牌宣传片',
    aspect_ratio: '16:9',
    video_url: '',
    thumbnail_url: '',
    duration_seconds: 5,
  });
  const [videoPlaybackError, setVideoPlaybackError] = useState('');
  const [videoPollHint, setVideoPollHint] = useState('');

  const [isRunning, setIsRunning] = useState(false);

  const { submitVideoGeneration, taskUiState } = useGenerationTask({
    setLoading: setIsRunning,
    setAgentLogs,
    setLatestTask,
    triggerToast,
    workspaceScope,
    username,
    fetchDashboard,
    onWorkspaceRefresh,
  });

  const handleGenerateVideo = () => {
    setVideoPlaybackError('');
    setVideoPollHint('');
    setVideoOutput((prev) => ({
      ...prev,
      video_topic: videoInput.topic,
      aspect_ratio: videoInput.aspectRatio,
      video_url: '',
      is_demo_fallback: false,
    }));
    void submitVideoGeneration(
      {
        video_topic: videoInput.topic,
        prompt: videoInput.prompt,
        aspect_ratio: videoInput.aspectRatio,
        duration: videoInput.duration,
        ...(videoInput.imageUrl.trim() ? { image_url: videoInput.imageUrl.trim() } : {}),
      },
      (result) => {
        setVideoOutput({
          ...result,
          video_topic: result.video_topic || videoInput.topic,
          aspect_ratio: result.aspect_ratio || videoInput.aspectRatio,
        });
        setVideoPollHint('');
      },
      setVideoPollHint,
    );
  };

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
          <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">视频主题 Topic</label>
          <input
            type="text"
            value={videoInput.topic}
            onChange={(e) => setVideoInput({ ...videoInput, topic: e.target.value })}
            className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none focus:border-b-2 font-mono font-semibold"
            placeholder="例如：新品上市宣传片"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">画面描述 Prompt</label>
          <textarea
            rows={4}
            value={videoInput.prompt}
            onChange={(e) => setVideoInput({ ...videoInput, prompt: e.target.value })}
            className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] p-3 text-xs focus:outline-none resize-none font-semibold font-mono leading-relaxed"
            placeholder="描述镜头运动、光影、主体与氛围…"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">画幅 Aspect</label>
            <select
              value={videoInput.aspectRatio}
              onChange={(e) => setVideoInput({ ...videoInput, aspectRatio: e.target.value })}
              className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
            >
              <option value="9:16">9:16 竖屏短视频</option>
              <option value="16:9">16:9 横屏</option>
              <option value="1:1">1:1 方形</option>
              <option value="4:5">4:5 社媒</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">时长 Duration</label>
            <select
              value={videoInput.duration}
              onChange={(e) => setVideoInput({ ...videoInput, duration: parseInt(e.target.value, 10) })}
              className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
            >
              <option value={5}>约 5 秒</option>
              <option value={10}>约 10 秒</option>
              <option value={18}>约 18 秒</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">参考图 URL（可选）</label>
          <input
            type="url"
            value={videoInput.imageUrl}
            onChange={(e) => setVideoInput({ ...videoInput, imageUrl: e.target.value })}
            className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-mono"
            placeholder="https://..."
          />
        </div>

        <button
          type="button"
          onClick={handleGenerateVideo}
          disabled={isRunning}
          className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
        >
          {isRunning ? (
            <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
          ) : null}
          <span>{isRunning ? 'AGENT RENDERING...' : '运行视频生成 Agent'}</span>
        </button>
        </div>

        <AgentTerminal logs={agentLogs} className="shrink-0" />
        <TaskStatusCard state={taskUiState} onRetry={handleGenerateVideo} retryDisabled={isRunning} />
      </div>

      <div className="generation-workspace__results">
        <div className="generation-workspace__preview bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 pb-10 shadow-editorial paper-sheet-2 relative flex flex-col gap-4 transform rotate-[0.2deg] h-full">
          <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)] pb-3">
            <span className="text-[10px] font-black text-[var(--editorial-text-gray)] flex items-center gap-1 font-mono uppercase">
              <span>VIDEO PREVIEW REEL</span>
            </span>
            {videoOutput.video_url && (
              <button
                type="button"
                onClick={() => onShare('video', `[视频] ${videoOutput.video_topic}`, videoOutput)}
                className="bg-transparent border border-[var(--editorial-stroke)] hover:bg-[var(--editorial-stroke)] hover:text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer"
              >
                <span>分享社区</span>
              </button>
            )}
          </div>

          <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/50 px-3 py-2 text-[10px] font-black uppercase text-[var(--editorial-text-muted)]">
            AI 生成初稿，发布前需人工审核
          </div>

          {videoOutput.is_demo_fallback && (
            <div className="border border-amber-500/60 bg-amber-50/80 text-amber-900 p-3 text-[10px] font-mono leading-relaxed">
              当前为演示视频（Agnes API 未成功返回）。请检查 AI 设置后重试。
            </div>
          )}

          {isRunning && !videoOutput.video_url ? (
            <div className="w-full aspect-video editorial-loader-bar flex flex-col items-center justify-center gap-3">
              <span className="font-mono text-[9px] font-black text-black bg-[var(--editorial-accent-yellow)] border border-black px-2 py-0.5 animate-pulse">
                VIDEO RENDER IN PROGRESS...
              </span>
              {videoPollHint && (
                <span className="font-mono text-[9px] text-[var(--editorial-text-gray)]">{videoPollHint}</span>
              )}
            </div>
          ) : videoOutput.video_url ? (
            <div className="border border-[var(--editorial-stroke)]/60 bg-[var(--editorial-bg)]/20 overflow-hidden">
              <video
                key={videoOutput.video_url}
                controls
                autoPlay
                playsInline
                poster={videoOutput.thumbnail_url}
                className="w-full aspect-video bg-black object-contain"
                onLoadedData={() => setVideoPlaybackError('')}
                onError={() => setVideoPlaybackError('浏览器无法加载该视频地址，可点击下方链接在新标签页打开。')}
              >
                <source src={videoOutput.video_url} type="video/mp4" />
                您的浏览器不支持视频播放。
              </video>
            </div>
          ) : (
            <div className="border border-dashed border-[var(--editorial-stroke)]/60 p-8 text-center text-[10px] text-[var(--editorial-text-gray)] font-mono">
              生成成功后将在此直接预览视频
            </div>
          )}

          {videoPlaybackError && (
            <p className="text-[10px] text-rose-600 font-mono">{videoPlaybackError}</p>
          )}

          {videoOutput.video_url && (
            <div className="border border-[var(--editorial-stroke)]/40 p-3 text-[10px] font-mono space-y-2">
              <div className="text-[var(--editorial-text-gray)] uppercase">视频地址</div>
              <a
                href={videoOutput.video_url}
                target="_blank"
                rel="noreferrer"
                className="block break-all text-[var(--editorial-text)] underline"
              >
                {videoOutput.video_url}
              </a>
              {videoOutput.asset_id && (
                <span className="block text-[var(--editorial-text-gray)]">已保存到资产库 #{videoOutput.asset_id}</span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-[9px] text-[var(--editorial-text-gray)] font-mono uppercase">
            <div>画幅: <span className="text-[var(--editorial-text)] font-bold">{videoOutput.aspect_ratio}</span></div>
            <div>时长: <span className="text-[var(--editorial-text)] font-bold">{videoOutput.duration_seconds}S</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
