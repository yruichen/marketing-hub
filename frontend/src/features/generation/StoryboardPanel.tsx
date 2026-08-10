import { useEffect, useState } from 'react';
import { AgentTerminal } from './AgentTerminal';
import { BrandMemorySummary } from '../brand-memory';
import { TaskStatusCard } from './TaskStatusCard';
import { useGenerationTask } from './useGenerationTask';
import { SaveControlBar } from './SaveControlBar';
import type { CreationContent, StoryboardOutput } from './types';
import type { WorkspaceScope } from '../dashboard/types';
import type { GenerationTaskRecord } from '../../types/workspace';
import type { ErrorActionId } from '../../shared/api/errorActions';
import type { ToastMessage } from '../../shared/types/toast';

interface StoryboardPanelProps {
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
  onShare: (type: 'storyboard', title: string, content: CreationContent) => Promise<void>;
  onStoryboardChange?: (storyboard: StoryboardOutput) => void;
}

export function StoryboardPanel({
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
  onShare,
  onStoryboardChange,
}: StoryboardPanelProps) {
  void _loading;
  void _setLoading;
  const [storyboardInput, setStoryboardInput] = useState({
    topic: '',
    duration: 30,
    audience: '',
  });
  const [storyboardOutput, setStoryboardOutput] = useState<StoryboardOutput>({
    video_topic: '',
    total_duration_seconds: 30,
    target_audience: '',
    scenes: [],
  });

  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    onStoryboardChange?.(storyboardOutput);
  }, [onStoryboardChange, storyboardOutput]);

  const { submitQueuedGeneration, taskUiState, lastCompletedTaskId, setLastCompletedTaskId } = useGenerationTask({
    setLoading: setIsRunning,
    setAgentLogs,
    setLatestTask,
    triggerToast,
    workspaceScope,
    username,
    fetchDashboard,
  });

  const handleGenerateStoryboard = () => {
    return submitQueuedGeneration<StoryboardOutput>(
      'storyboard',
      {
        video_topic: storyboardInput.topic,
        duration: storyboardInput.duration,
        target_audience: storyboardInput.audience,
      },
      (result) => {
        setStoryboardOutput(result);
        onStoryboardChange?.(result);
      },
      '[0.00s] [INFO] Initializing queued Storyboard Editorial Director Workflow...',
      '分镜脚本异步任务执行完毕'
    );
  };

  return (
    <div className="generation-workspace generation-workspace--with-result">
      <div className="generation-workspace__form bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial paper-sheet-1 relative">
        <div className="generation-workspace__form-body">
        <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono">// TIMELINE STICKY SLATE</h3>
        <BrandMemorySummary
          projectName={workspaceScope?.project.name}
          context={workspaceScope?.project.brand_context}
          compact
        />

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
          disabled={isRunning}
          className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
        >
          {isRunning ? (
            <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          ) : null}
          <span>{isRunning ? 'AGENT DIRECTING...' : '运行分镜编排 Agent'}</span>
        </button>
        </div>

        <AgentTerminal logs={agentLogs} className="shrink-0" />
        <TaskStatusCard state={taskUiState} onRetry={handleGenerateStoryboard} retryDisabled={isRunning} onErrorAction={onErrorAction} />
      </div>

      <div className="generation-workspace__results">
        <div className="generation-workspace__preview bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 pb-10 shadow-editorial paper-sheet-2 relative flex flex-col gap-4 transform rotate-[0.4deg] h-full">
          <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)] pb-3">
            <span className="text-[10px] font-black text-[var(--editorial-text-gray)] flex items-center gap-1 font-mono uppercase">
              <span>STORYBOARD MANUSCRIPT TIMELINE</span>
            </span>
            <button
              onClick={() => onShare('storyboard', `[分镜] ${storyboardOutput.video_topic}`, storyboardOutput)}
              className="bg-transparent border border-[var(--editorial-stroke)] hover:bg-[var(--editorial-stroke)] hover:text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer"
            >
              <span>分享社区</span>
            </button>
          </div>

          <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/50 px-3 py-2 text-[10px] font-black uppercase text-[var(--editorial-text-muted)]">
            AI 生成初稿，发布前需人工审核
          </div>

          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
            {isRunning ? (
              <div className="w-full h-32 editorial-loader-bar flex flex-col items-center justify-center">
                <span className="font-mono text-[9px] font-black text-black bg-[var(--editorial-accent-yellow)] border border-black px-2 py-0.5 animate-pulse">
                  STORYBOARD SEGMENTING IN PROGRESS...
                </span>
              </div>
            ) : storyboardOutput.scenes.length ? (
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
            ) : (
              <div className="flex h-32 items-center justify-center border border-dashed border-[var(--editorial-stroke)] p-6 text-center text-xs text-[var(--editorial-text-gray)]">
                填写主题和受众，配置文本 Provider 后生成第一份分镜。
              </div>
            )}
          </div>

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
