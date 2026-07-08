import { useState } from 'react';
import { AgentTerminal } from './AgentTerminal';
import { BrandMemorySummary } from '../brand-memory';
import { TaskStatusCard } from './TaskStatusCard';
import { useGenerationTask } from './useGenerationTask';
import { SaveControlBar } from './SaveControlBar';
import type { CreationContent, ImageOutput } from './types';
import type { WorkspaceScope } from '../dashboard/types';
import type { GenerationTaskRecord } from '../../types/workspace';
import type { ErrorActionId } from '../../shared/api/errorActions';
import type { ToastMessage } from '../../shared/types/toast';
import {
  DEFAULT_IMAGE_STYLE_SKILL_ID,
  IMAGE_STYLE_SKILLS,
} from '../workflows/imageStyleSkills';

interface ImagePanelProps {
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
  onShare: (type: 'image', title: string, content: CreationContent, imageUrl?: string) => Promise<void>;
  onCopy: (text: string) => Promise<void>;
}

export function ImagePanel({
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
  onCopy,
}: ImagePanelProps) {
  void _loading;
  void _setLoading;
  const [imageInput, setImageInput] = useState({
    prompt: '一张精致的产品桌面场景，明亮自然光，适合小红书种草风格',
    aspectRatio: '1:1',
    styleSkill: DEFAULT_IMAGE_STYLE_SKILL_ID,
  });
  const [imageOutput, setImageOutput] = useState<ImageOutput>({
    prompt: '一张精致的产品桌面场景，明亮自然光，适合小红书种草风格',
    style: IMAGE_STYLE_SKILLS[1].skill,
    aspectRatio: '1:1',
    image_url: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80',
    revised_prompt: 'A refined product desktop scene with bright natural light, styled for Xiaohongshu lifestyle marketing, 1:1 aspect ratio',
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

  const handleGenerateImage = () => {
    return submitQueuedGeneration<ImageOutput>(
      'image',
      {
        prompt: imageInput.prompt,
        style_skill: imageInput.styleSkill,
        aspect_ratio: imageInput.aspectRatio,
      },
      setImageOutput,
      '[0.00s] [INFO] Initializing queued Editorial Sketch Image Agent Workflow...',
      '视觉图片异步任务执行完毕'
    );
  };

  return (
    <div className="generation-workspace generation-workspace--with-result">
      {/* Left Input Slate */}
      <div className="generation-workspace__form bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial paper-sheet-1 relative">
        <div className="generation-workspace__form-body">
        <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono">// VISUAL STICKY SLATE</h3>
        <BrandMemorySummary
          projectName={workspaceScope?.project.name}
          context={workspaceScope?.project.brand_context}
          compact
        />

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
            <label className="text-[var(--editorial-text)] text-[10px] font-bold uppercase tracking-wider font-mono">风格 Skill</label>
            <select
              value={imageInput.styleSkill}
              onChange={(e) => setImageInput({ ...imageInput, styleSkill: e.target.value })}
              className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] py-2 text-xs focus:outline-none font-bold cursor-pointer appearance-none animate-none"
            >
              {IMAGE_STYLE_SKILLS.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerateImage}
          disabled={isRunning}
          className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
        >
          {isRunning ? (
            <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          ) : null}
          <span>{isRunning ? 'AGENT DESIGNING...' : '运行视觉设计 Agent'}</span>
        </button>
        </div>

        <AgentTerminal logs={agentLogs} className="shrink-0" />
        <TaskStatusCard state={taskUiState} onRetry={handleGenerateImage} retryDisabled={isRunning} onErrorAction={onErrorAction} />
      </div>

      {/* Right Output Preview */}
      <div className="generation-workspace__results">
        <div className="generation-workspace__preview bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 pb-10 shadow-editorial paper-sheet-2 relative flex flex-col gap-4 transform rotate-[-0.5deg] h-full">
          <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)] pb-2">
            <span className="text-[10px] font-black text-[var(--editorial-text-gray)] flex items-center gap-1 font-mono uppercase">
              <span>VISUAL POLAROID IMAGE</span>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => onShare('image', `[${imageOutput.style}] Graphic Polaroid`, imageOutput, imageOutput.image_url)}
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

          <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/50 px-3 py-2 text-[10px] font-black uppercase text-[var(--editorial-text-muted)]">
            AI 生成初稿，发布前需人工审核
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)] p-2 relative flex justify-center items-center overflow-hidden min-h-[220px]">
              {isRunning ? (
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
                onClick={() => onCopy(imageOutput.revised_prompt)}
                className="w-full bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] hover:bg-[var(--editorial-unselected)] text-[var(--editorial-text)] py-2 text-xs font-bold shadow-editorial-sm active:shadow-none active:translate-x-[1.5px] active:translate-y-[1.5px] cursor-pointer transition-all"
              >
                复制系统微调 Prompt
              </button>
            </div>
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
