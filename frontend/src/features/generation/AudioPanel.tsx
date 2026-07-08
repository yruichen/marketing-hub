import { useState } from 'react';
import { AgentTerminal } from './AgentTerminal';
import { BrandMemorySummary } from '../brand-memory';
import { TaskStatusCard } from './TaskStatusCard';
import { useGenerationTask } from './useGenerationTask';
import { SaveControlBar } from './SaveControlBar';
import type { AudioOutput, CreationContent } from './types';
import type { WorkspaceScope } from '../dashboard/types';
import type { GenerationTaskRecord } from '../../types/workspace';
import type { ErrorActionId } from '../../shared/api/errorActions';
import type { ToastMessage } from '../../shared/types/toast';

interface AudioPanelProps {
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
  onShare: (type: 'audio', title: string, content: CreationContent, imageUrl?: string, audioUrl?: string) => Promise<void>;
}

export function AudioPanel({
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
}: AudioPanelProps) {
  void _loading;
  void _setLoading;
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

  const [isRunning, setIsRunning] = useState(false);

  const { submitQueuedGeneration, taskUiState, lastCompletedTaskId, setLastCompletedTaskId } = useGenerationTask({
    setLoading: setIsRunning,
    setAgentLogs,
    setLatestTask,
    triggerToast,
    workspaceScope,
    username,
    fetchDashboard,
  });

  const handleGenerateAudio = () => {
    return submitQueuedGeneration<AudioOutput>(
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

  return (
    <div className="generation-workspace generation-workspace--with-result">
      <div className="generation-workspace__form bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial paper-sheet-1 relative">
        <div className="generation-workspace__form-body">
        <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono">// AUDIO STICKY SLATE</h3>
        <BrandMemorySummary
          projectName={workspaceScope?.project.name}
          context={workspaceScope?.project.brand_context}
          compact
        />

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
          disabled={isRunning}
          className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
        >
          {isRunning ? (
            <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          ) : null}
          <span>{isRunning ? 'AGENT SYNTHESIZING...' : '运行配音合成 Agent'}</span>
        </button>
        </div>

        <AgentTerminal logs={agentLogs} className="shrink-0" />
        <TaskStatusCard state={taskUiState} onRetry={handleGenerateAudio} retryDisabled={isRunning} onErrorAction={onErrorAction} />
      </div>

      <div className="generation-workspace__results">
        <div className="generation-workspace__preview bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 pb-10 shadow-editorial paper-sheet-2 relative flex flex-col gap-4 transform rotate-[-0.3deg] h-full">
          <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)] pb-2">
            <span className="text-[10px] font-black text-[var(--editorial-text-gray)] flex items-center gap-1 font-mono uppercase">
              <span>AUDIO TIMELINE STREAM PREVIEW</span>
            </span>
            <button
              onClick={() => onShare('audio', `[配音] Warm Narrator Sketch`, audioOutput, '', audioOutput.audio_url)}
              className="bg-transparent border border-[var(--editorial-stroke)] hover:bg-[var(--editorial-stroke)] hover:text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer"
            >
              <span>分享社区</span>
            </button>
          </div>

          <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/50 px-3 py-2 text-[10px] font-black uppercase text-[var(--editorial-text-muted)]">
            AI 生成初稿，发布前需人工审核
          </div>

          <div className="bg-[var(--editorial-bg)]/20 border border-[var(--editorial-stroke)]/40 p-5 relative overflow-hidden flex flex-col gap-4 font-mono shadow-inner">
            <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)]/40 pb-2 text-[9px] text-[var(--editorial-text-gray)]">
              <span>AUDIO_SYNTH_DECK: [READY]</span>
              <span className={isRunning ? "animate-pulse text-indigo-500 font-bold" : "text-emerald-600 font-bold"}>
                {isRunning ? "RENDER_ACTIVE" : "STANDBY"}
              </span>
            </div>

            {isRunning ? (
              <div className="h-10 w-full editorial-loader-bar flex items-center justify-center border-none">
                <span className="bg-[var(--editorial-accent-yellow)] text-black text-[8px] font-black border border-black px-2 py-0.5 animate-pulse">
                  SOUNDWAVE CALCULATING...
                </span>
              </div>
            ) : (
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

          <div className="border border-[var(--editorial-stroke)]/60 bg-[var(--editorial-bg)]/20 p-3">
            <span className="text-[8px] font-black text-[var(--editorial-text-gray)] uppercase block mb-1.5">// SOUND STREAM PLAYER</span>
            {isRunning ? (
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
