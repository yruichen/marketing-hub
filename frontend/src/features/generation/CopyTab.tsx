import { Sparkles } from 'lucide-react';
import AgentTerminal from '../../components/AgentTerminal';
import type { CopyInput, CopyOutput, ToastType } from './types';

interface CopyTabProps {
  copyInput: CopyInput;
  copyOutput: CopyOutput;
  setCopyInput: (next: CopyInput) => void;
  loading: boolean;
  agentLogs: string[];
  onGenerate: () => void;
  onShareToCommunity: (kind: 'copy' | 'image' | 'storyboard' | 'audio', title: string, payload: CopyOutput) => void;
  onCopyClipboard: (text: string) => void;
  triggerToast: (text: string, type?: ToastType) => void;
}

/**
 * 文案编排 tab。State 全部住在 App.tsx（被 buildContentPackage 等
 * 共享 callback 读），本组件只负责"输入 + 触发 + 渲染输出"。
 */
export function CopyTab({
  copyInput,
  copyOutput,
  setCopyInput,
  loading,
  agentLogs,
  onGenerate,
  onShareToCommunity,
  onCopyClipboard,
}: CopyTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Input Slate */}
      <div className="col-span-1 lg:col-span-5 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial paper-sheet-1 flex flex-col gap-6 relative">
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

        <button
          onClick={onGenerate}
          disabled={loading}
          className="w-full btn-editorial-primary py-3 rounded-none font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer mt-2"
        >
          {loading ? (
            <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
          ) : null}
          <span>{loading ? 'AGENT RUNNING...' : '运行文案编排 Agent'}</span>
        </button>
      </div>

      {/* Right Output Sheet */}
      <div className="col-span-1 lg:col-span-7 flex flex-col gap-6">
        <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 pb-12 shadow-editorial paper-sheet-2 relative flex flex-col gap-6 min-h-[350px] transform rotate-[0.5deg] transition-all">
          <div className="flex justify-between items-center border-b border-[var(--editorial-stroke)] pb-3">
            <span className="text-[10px] font-black text-[var(--editorial-text-gray)] flex items-center gap-1 font-mono uppercase">
              <span>TYPED MANUSCRIPT PREVIEW</span>
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => onShareToCommunity('copy', `[${copyOutput.platform}] ${copyInput.brandName}`, copyOutput)}
                className="bg-transparent border border-[var(--editorial-stroke)] hover:bg-[var(--editorial-stroke)] hover:text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer"
              >
                <span>分享社区</span>
              </button>
              <button
                onClick={() => onCopyClipboard(`${copyOutput.title}\n\n${copyOutput.paragraphs.join('\n')}\n\n${copyOutput.tags.map((t: string) => '#' + t).join(' ')}`)}
                className="bg-[var(--editorial-stroke)] border border-[var(--editorial-stroke)] text-[var(--editorial-bg)] px-2.5 py-1 text-[10px] font-black hover:scale-103 active:scale-97 transition-all cursor-pointer"
              >
                复制剪贴板
              </button>
            </div>
          </div>

          <div className="space-y-5">
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

        <AgentTerminal logs={agentLogs} />
      </div>
    </div>
  );
}
