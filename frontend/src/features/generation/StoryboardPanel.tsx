import { useState } from 'react';
import { AgentTerminal } from './AgentTerminal';
import { useGenerationTask } from './useGenerationTask';
import type { CreationContent, StoryboardOutput } from './types';
import type { WorkspaceScope } from '../dashboard/types';
import type { GenerationTaskRecord } from '../../types/workspace';

interface StoryboardPanelProps {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  agentLogs: string[];
  setAgentLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setLatestTask: (task: GenerationTaskRecord) => void;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  fetchDashboard: () => Promise<void>;
  onShare: (type: 'storyboard', title: string, content: CreationContent) => Promise<void>;
}

export function StoryboardPanel({
  workspaceScope,
  username,
  loading,
  setLoading,
  agentLogs,
  setAgentLogs,
  setLatestTask,
  triggerToast,
  fetchDashboard,
  onShare,
}: StoryboardPanelProps) {
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
        audio_narration: '（轻柔的书页翻动声）"创作者的日常，从来不是完美的网格，而是灵感的随性交错。"',
        duration_seconds: 10
      },
      {
        scene_number: 2,
        visual_description: '中景镜头：阳光斜洒在一本点阵草稿本上，明黄色的便签上零散写着几句感悟。画面带有极淡的纸质偏角。',
        audio_narration: '（铅笔沙沙声淡入）"摒弃所有多余的喧嚣与泛滥的色彩，我们只保留纸张的原生温度，与文字的质感。"',
        duration_seconds: 10
      },
      {
        scene_number: 3,
        visual_description: '全景拉远：数张记录着文案与配音的排立得纸页堆叠在桌面中央，呈现一站式智能编排的成果。',
        audio_narration: '（盖章按压声收尾）"Marketing-Hub 纸页工坊。给文字以温度，给灵感以实感。"',
        duration_seconds: 10
      }
    ]
  });

  const { submitQueuedGeneration } = useGenerationTask({
    setLoading,
    setAgentLogs,
    setLatestTask,
    triggerToast,
    workspaceScope,
    username,
    fetchDashboard,
  });

  const handleGenerateStoryboard = () => submitQueuedGeneration<StoryboardOutput>(
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

  return (
    <div className="generation-workspace">
      <div className="generation-workspace__form bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial paper-sheet-1 relative">
        <div className="generation-workspace__form-body">
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

        <AgentTerminal logs={agentLogs} className="shrink-0" />
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

          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto pr-1">
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

          <div className="absolute bottom-3 left-6 right-6 flex justify-between items-center text-[9px] font-mono text-[var(--editorial-text-gray)] uppercase border-t border-dashed border-[var(--editorial-stroke)]/40 pt-2.5 mt-2">
            <span>TOPIC: "{storyboardOutput.video_topic}"</span>
            <span>DURATION: {storyboardOutput.total_duration_seconds}S</span>
          </div>
        </div>
      </div>
    </div>
  );
}