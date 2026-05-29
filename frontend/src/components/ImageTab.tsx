import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import AgentTerminal from './AgentTerminal';
import { API_BASE_URL, useCopyClipboard } from '../hooks/useApi';

interface ImageTabProps {
  triggerToast: (text: string, type: 'success' | 'info' | 'error') => void;
  username: string | null;
  agentLogs: string[];
  setAgentLogs: (logs: string[]) => void;
}

interface ImageOutput {
  prompt: string;
  style: string;
  aspectRatio?: string;
  aspect_ratio?: string;
  image_url: string;
  revised_prompt: string;
}

export default function ImageTab({ triggerToast, username, agentLogs, setAgentLogs }: ImageTabProps) {
  const handleCopyClipboard = useCopyClipboard(triggerToast);
  const [loading, setLoading] = useState(false);

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

  const handleGenerateImage = async () => {
    setLoading(true);
    setAgentLogs(['[0.00s] [INFO] Initializing Editorial Sketch Image Agent Workflow...']);
    try {
      const res = await fetch(`${API_BASE_URL}/generate/image/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imageInput.prompt,
          style: imageInput.style,
          aspect_ratio: imageInput.aspectRatio,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setImageOutput(data.result);
        setAgentLogs(data.logs);
        triggerToast('视觉图片生成成功', 'success');
      } else {
        throw new Error('API Error');
      }
    } catch {
      triggerToast('图片生成服务异常', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleShareToCommunity = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/community/creations/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username || 'ROOT',
          creation_type: 'image',
          title: `[${imageOutput.style}] Graphic Polaroid`,
          content: imageOutput,
          image_url: imageOutput.image_url,
        })
      });
      if (res.ok) {
        triggerToast('已成功分享到手绘工坊社区！', 'success');
      } else {
        triggerToast('作品分享失败', 'error');
      }
    } catch {
      triggerToast('分享失败，无法连接服务器', 'error');
    }
  };

  return (
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
                onClick={handleShareToCommunity}
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
  );
}
