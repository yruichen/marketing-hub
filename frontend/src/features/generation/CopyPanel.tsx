import { useState } from 'react';
import { AgentTerminal } from './AgentTerminal';
import { BrandMemorySummary } from '../brand-memory';
import { TaskStatusCard } from './TaskStatusCard';
import { useGenerationTask } from './useGenerationTask';
import type { CopyOutput, CreationContent } from './types';
import type { WorkspaceScope } from '../dashboard/types';
import type { GenerationTaskRecord } from '../../types/workspace';

interface CopyPanelProps {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  agentLogs: string[];
  setAgentLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setLatestTask: (task: GenerationTaskRecord) => void;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  fetchDashboard: () => Promise<void>;
  onShare: (type: 'copy', title: string, content: CreationContent) => Promise<void>;
  onCopy: (text: string) => Promise<void>;
}

export function CopyPanel({
  workspaceScope,
  username,
  loading: _loading,
  setLoading: _setLoading,
  agentLogs,
  setAgentLogs,
  setLatestTask,
  triggerToast,
  fetchDashboard,
  onShare,
  onCopy,
}: CopyPanelProps) {
  void _loading;
  void _setLoading;
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
      '用了一段时间，从打开到出稿全程丝滑，细节打磨得很到位，那种越用越顺手的爽感真的会上瘾。✨',
      '姐妹们听我的，闭眼入不踩雷！早买早享受，别怪我没提醒你们哦～'
    ],
    tags: ['安利神仙单品', '好物分享', '高颜值实用', 'Marketing-Hub', '宝藏工具'],
    call_to_action: '👉 立即点击体验 Marketing-Hub，解锁你的创意生产力！'
  });

  const [isRunning, setIsRunning] = useState(false);

  const { submitQueuedGeneration, taskUiState } = useGenerationTask({
    setLoading: setIsRunning,
    setAgentLogs,
    setLatestTask,
    triggerToast,
    workspaceScope,
    username,
    fetchDashboard,
  });

  const handleGenerateCopy = () => {
    return submitQueuedGeneration<CopyOutput>(
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

  return (
    <div className="generation-workspace generation-workspace--with-result">
      {/* Left Input Slate */}
      <div className="generation-workspace__form bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial paper-sheet-1 relative">
        <div className="generation-workspace__form-body">
        <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider font-mono">// PARAMETERS SLATE</h3>
        <BrandMemorySummary
          projectName={workspaceScope?.project.name}
          context={workspaceScope?.project.brand_context}
          compact
        />

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

        <button
          onClick={handleGenerateCopy}
          disabled={isRunning}
          className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
        >
          {isRunning ? (
            <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          ) : null}
          <span>{isRunning ? 'AGENT RUNNING...' : '运行文案编排 Agent'}</span>
        </button>
        </div>

        <AgentTerminal logs={agentLogs} className="shrink-0" />
        <TaskStatusCard state={taskUiState} onRetry={handleGenerateCopy} retryDisabled={isRunning} />
      </div>

      {/* Right Output Sheet */}
      <div className="generation-workspace__results">
        <div className="generation-workspace__preview bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 pb-10 shadow-editorial paper-sheet-2 relative flex flex-col gap-4 transform rotate-[0.5deg] transition-all h-full">
          <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)] pb-3">
            <span className="text-[10px] font-black text-[var(--editorial-text-gray)] flex items-center gap-1 font-mono uppercase">
              <span>TYPED MANUSCRIPT PREVIEW</span>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => onShare('copy', `[${copyOutput.platform}] ${copyInput.brandName}`, copyOutput)}
                className="bg-transparent border border-[var(--editorial-stroke)] hover:bg-[var(--editorial-stroke)] hover:text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer"
              >
                <span>分享社区</span>
              </button>
              <button
                onClick={() => onCopy(`${copyOutput.title}\n\n${copyOutput.paragraphs.join('\n')}\n\n${copyOutput.tags.map((t: string) => '#' + t).join(' ')}`)}
                className="bg-[var(--editorial-stroke)] border border-[var(--editorial-stroke)] text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-black hover:scale-103 active:scale-97 transition-all cursor-pointer"
              >
                复制剪贴板
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <div className="border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/50 px-3 py-2 text-[10px] font-black uppercase text-[var(--editorial-text-muted)]">
              AI 生成初稿，发布前需人工审核
            </div>
            <div className="bg-[var(--editorial-bg)]/40 p-4 border border-[var(--editorial-stroke)]/40 rounded-none">
              <h4 className="serif-header font-bold text-base leading-snug text-[var(--editorial-text)]">{copyOutput.title}</h4>
            </div>

            <div className="space-y-4">
              {copyOutput.paragraphs.map((p: string, idx: number) => (
                <p key={idx} className="text-xs leading-[1.85] text-[var(--editorial-text-muted)] font-medium font-mono text-justify">{p}</p>
              ))}
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-[var(--editorial-accent-blue)] italic font-semibold">
              {copyOutput.tags.map((t: string, idx: number) => (
                <span key={idx}>#{t}</span>
              ))}
            </div>
          </div>

          <div className="absolute bottom-3 left-6 right-6 flex justify-between items-center text-[9px] font-mono text-[var(--editorial-text-gray)] uppercase border-t border-dashed border-[var(--editorial-stroke)]/40 pt-2.5 mt-4">
            <span>SEED: 827419-TYP</span>
            <span>MODEL: MANUSCRIPT-V2</span>
          </div>
        </div>
      </div>
    </div>
  );
}
