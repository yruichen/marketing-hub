import { useState, useEffect } from 'react';

// API Configuration
const API_BASE_URL = 'http://localhost:8000/api';

type Tab = 'copy' | 'image' | 'storyboard' | 'audio';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('copy');
  const [loading, setLoading] = useState(false);
  const [apiLive, setApiLive] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // 1. Copywriting States
  const [copyInput, setCopyInput] = useState({
    brandName: 'Marketing-Hub',
    description: 'AI 营销场景全能助手，秒级生成爆款图文',
    tone: '爆款活泼',
    platform: 'Xiaohongshu',
  });
  const [copyOutput, setCopyOutput] = useState<any>({
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

  // 2. Image States
  const [imageInput, setImageInput] = useState({
    prompt: '新粗野主义风格的创作者电脑桌面，高饱和度黄色点缀，极简线条，三维潮玩公仔，阳光穿透玻璃杯',
    aspectRatio: '1:1',
    style: 'neo-brutalism',
  });
  const [imageOutput, setImageOutput] = useState<any>({
    prompt: '新粗野主义风格的创作者电脑桌面，高饱和度黄色点缀，极简线条，三维潮玩公仔，阳光穿透玻璃杯',
    style: 'neo-brutalism',
    aspectRatio: '1:1',
    image_url: 'https://images.unsplash.com/photo-1600132806370-bf17e65e942f?auto=format&fit=crop&w=800&q=80',
    revised_prompt: '新粗野主义风格的创作者电脑桌面，高饱和度黄色点缀，极简线条, styled in neo-brutalism aesthetic, high contrast bold outlines, hyper-detailed render, 1:1 aspect ratio'
  });

  // 3. Storyboard States
  const [storyboardInput, setStoryboardInput] = useState({
    topic: '极速灵感的一天',
    duration: 30,
    audience: '年轻自媒体博主',
  });
  const [storyboardOutput, setStoryboardOutput] = useState<any>({
    video_topic: '极速灵感的一天',
    total_duration_seconds: 30,
    target_audience: '年轻自媒体博主',
    scenes: [
      {
        scene_number: 1,
        visual_description: '镜头大特写：一杯黑咖啡缓缓倒入燕麦奶，拉出完美的黑白渐变大理石纹路。',
        audio_narration: '（配音伴随轻柔的爵士白噪音）“清晨的第一缕阳光，和一杯让你创意大开的香浓拿铁。”',
        duration_seconds: 10
      },
      {
        scene_number: 2,
        visual_description: '中景镜头：主角坐在一张高饱和黄色（新粗野主义风格）的工作台前，神色专注地敲击机械键盘。',
        audio_narration: '（键盘敲击声淡入）“每一个闪光的文案，每一张惊艳的社媒图，都不应该耗费你整晚的精力。”',
        duration_seconds: 10
      },
      {
        scene_number: 3,
        visual_description: '全景拉远：主角放松地靠在椅背上，面带笑容朝窗外看去，阳光洒满整个创意空间。',
        audio_narration: '（轻笑，轻松的白噪音）“让灵感自由呼吸，让创作变得轻松、爽快而又独具个性。”',
        duration_seconds: 10
      }
    ]
  });

  // 4. Audio States
  const [audioInput, setAudioInput] = useState({
    text: '欢迎使用 Marketing Hub AI 一站式营销场景配音助手，为您极速合成物理机械感配音！',
    voiceId: 'female_warm',
    speed: 1.0,
  });
  const [audioOutput, setAudioOutput] = useState<any>({
    text: '欢迎使用 Marketing Hub AI 一站式营销场景配音助手，为您极速合成物理机械感配音！',
    voice_id: 'female_warm',
    speed: 1.0,
    audio_url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    text_length: 36,
    estimated_audio_duration_seconds: 9
  });

  // Ping API to check live status
  useEffect(() => {
    fetch(`${API_BASE_URL}/generate/copy/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then((res) => {
        if (res.status === 200) {
          setApiLive(true);
        }
      })
      .catch(() => {
        setApiLive(false);
      });
  }, []);

  const triggerFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(''), 2000);
  };

  // Generation Handlers
  const handleGenerateCopy = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/generate/copy/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand_name: copyInput.brandName,
          product_description: copyInput.description,
          tone: copyInput.tone,
          platform: copyInput.platform,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setCopyOutput(data);
        setApiLive(true);
        triggerFeedback('✨ 文案生成成功 (Live API)');
      } else {
        throw new Error('API Error');
      }
    } catch (err) {
      // Sandbox fallback
      triggerFeedback('🔄 API离线，已激活沙箱模拟生成');
      // Simulate sandbox delay
      await new Promise((r) => setTimeout(r, 600));
      const simulated = {
        platform: copyInput.platform,
        tone: copyInput.tone,
        title: copyInput.platform === 'Xiaohongshu' 
          ? `🔥 吹爆这个【${copyInput.brandName}】！简直好用到哭！`
          : `💡 探索【${copyInput.brandName}】：全维度重塑你的营销灵感`,
        paragraphs: [
          `救命啊，这绝对是今年最大的黑马！核心点在于：${copyInput.description}。`,
          `在“${copyInput.tone}”的调性加持下，它的体验感直接拉满，简直太懂创作者了。`,
          `建议大家都去试一下，保证用了就再也回不去了！`
        ],
        tags: [copyInput.brandName, '效率神器', '新青年生活方式', '自媒体必备'],
        call_to_action: `👉 立即开始使用 ${copyInput.brandName}，解锁前沿灵感！`
      };
      setCopyOutput(simulated);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateImage = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/generate/image/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imageInput.prompt,
          aspect_ratio: imageInput.aspectRatio,
          style: imageInput.style,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setImageOutput(data);
        setApiLive(true);
        triggerFeedback('🎨 图片生成成功 (Live API)');
      } else {
        throw new Error('API Error');
      }
    } catch (err) {
      triggerFeedback('🔄 API离线，已激活沙箱模拟生成');
      await new Promise((r) => setTimeout(r, 1000));
      
      const unsplashPool = [
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1600132806370-bf17e65e942f?auto=format&fit=crop&w=800&q=80',
      ];
      const randomImage = unsplashPool[Math.floor(Math.random() * unsplashPool.length)];
      
      setImageOutput({
        prompt: imageInput.prompt,
        style: imageInput.style,
        aspect_ratio: imageInput.aspectRatio,
        image_url: randomImage,
        revised_prompt: `${imageInput.prompt}, high resolution rendering, custom style: ${imageInput.style}, hard offset flat shadows`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateStoryboard = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/generate/storyboard/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_topic: storyboardInput.topic,
          duration: storyboardInput.duration,
          target_audience: storyboardInput.audience,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setStoryboardOutput(data);
        setApiLive(true);
        triggerFeedback('🎬 脚本生成成功 (Live API)');
      } else {
        throw new Error('API Error');
      }
    } catch (err) {
      triggerFeedback('🔄 API离线，已激活沙箱模拟生成');
      await new Promise((r) => setTimeout(r, 1200));
      
      setStoryboardOutput({
        video_topic: storyboardInput.topic,
        total_duration_seconds: storyboardInput.duration,
        target_audience: storyboardInput.audience,
        scenes: [
          {
            scene_number: 1,
            visual_description: `【开场引流】微距特写，极具质感的金属键盘在慢动作下被按下。画面中央弹出黑色大字："${storyboardInput.topic}"`,
            audio_narration: `“你想过如何打动你的目标受众【${storyboardInput.audience}】吗？听我用10秒钟扒个绝招。”`,
            duration_seconds: storyboardInput.duration // 3
          },
          {
            scene_number: 2,
            visual_description: `【高潮论证】画面切分为左右分屏，左侧显示高饱和纯色背景的创意图，右侧波形图在闪烁跳跃，彰显纯物理实体风格的效率升级。`,
            audio_narration: `“不需要复杂的调整，通过极简新粗野主义面板，把你的灵感瞬间输出实体。”`,
            duration_seconds: storyboardInput.duration // 3
          },
          {
            scene_number: 3,
            visual_description: `【引导转化】镜头以 45 度角斜向滑入一个明黄色的“免费试用”按钮卡片。下方显示一行高对比度硬阴影文字。`,
            audio_narration: `“这就是灵感与生产力碰撞的时刻。你，准备好了吗？”`,
            duration_seconds: storyboardInput.duration // 3
          }
        ].map((s, _, arr) => ({
          ...s,
          duration_seconds: Math.floor(storyboardInput.duration / arr.length)
        }))
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAudio = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/generate/audio/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: audioInput.text,
          voice_id: audioInput.voiceId,
          speed: audioInput.speed,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setAudioOutput(data);
        setApiLive(true);
        triggerFeedback('🔊 语音合成成功 (Live API)');
      } else {
        throw new Error('API Error');
      }
    } catch (err) {
      triggerFeedback('🔄 API离线，已激活沙箱模拟生成');
      await new Promise((r) => setTimeout(r, 800));
      
      const audioUrls: Record<string, string> = {
        female_warm: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        male_energetic: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        child_cheerful: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
      };

      setAudioOutput({
        text: audioInput.text,
        voice_id: audioInput.voiceId,
        speed: audioInput.speed,
        audio_url: audioUrls[audioInput.voiceId] || audioUrls.female_warm,
        text_length: audioInput.text.length,
        estimated_audio_duration_seconds: Math.round(audioInput.text.length * 0.25 / audioInput.speed)
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    triggerFeedback('📋 已复制到剪贴板！');
  };

  return (
    <div className="min-h-screen bg-[#F4F4F0] p-4 md:p-8 flex flex-col font-sans select-none antialiased text-black relative">
      
      {/* Dynamic Feedback Toast */}
      {feedbackMsg && (
        <div className="fixed top-6 right-6 z-50 bg-[#39FF14] border-3 border-black p-4 font-bold shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-center gap-2 animate-bounce">
          <span>⚡</span>
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <header className="w-full bg-[#FFDE4D] border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight uppercase">
            Marketing-Hub
          </h1>
          <p className="mt-1 text-sm md:text-base font-bold tracking-tight bg-white border border-black inline-block px-2 py-0.5">
            // MVP CREATOR WORKSPACE V1.0.0
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Live Status Indicator */}
          <div className="border-2 border-black bg-white px-3 py-1.5 font-bold text-xs md:text-sm flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <span className={`h-3.5 w-3.5 rounded-full border border-black inline-block ${apiLive ? 'bg-[#39FF14] animate-pulse' : 'bg-[#FF6B6B]'}`}></span>
            <span>API SERVER: {apiLive ? 'LIVE' : 'SANDBOX'}</span>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            className="border-2 border-black bg-[#4D96FF] px-4 py-1.5 font-extrabold text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
          >
            GITHUB
          </a>
        </div>
      </header>

      {/* Core Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start flex-grow">
        
        {/* Left-side Navigation (Tabs) */}
        <nav className="col-span-1 lg:col-span-3 flex flex-col gap-3">
          <div className="bg-black text-white p-3 border-2 border-black font-extrabold text-xs tracking-wider uppercase">
            🎛️ Tool Modules
          </div>

          <button
            onClick={() => setActiveTab('copy')}
            className={`w-full text-left p-4 font-bold border-3 border-black flex items-center justify-between transition-all duration-100 cursor-pointer ${
              activeTab === 'copy'
                ? 'bg-[#FFDE4D] translate-x-1 shadow-none'
                : 'bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]'
            }`}
          >
            <span className="flex items-center gap-3 text-base md:text-lg">
              <span>✍️</span> 营销文案生成
            </span>
            {activeTab === 'copy' && <span className="bg-black text-white px-2 py-0.5 text-xs font-black">ACTIVE</span>}
          </button>

          <button
            onClick={() => setActiveTab('image')}
            className={`w-full text-left p-4 font-bold border-3 border-black flex items-center justify-between transition-all duration-100 cursor-pointer ${
              activeTab === 'image'
                ? 'bg-[#39FF14] translate-x-1 shadow-none'
                : 'bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]'
            }`}
          >
            <span className="flex items-center gap-3 text-base md:text-lg">
              <span>🎨</span> 社媒图片生成
            </span>
            {activeTab === 'image' && <span className="bg-black text-white px-2 py-0.5 text-xs font-black">ACTIVE</span>}
          </button>

          <button
            onClick={() => setActiveTab('storyboard')}
            className={`w-full text-left p-4 font-bold border-3 border-black flex items-center justify-between transition-all duration-100 cursor-pointer ${
              activeTab === 'storyboard'
                ? 'bg-[#B983FF] translate-x-1 shadow-none'
                : 'bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]'
            }`}
          >
            <span className="flex items-center gap-3 text-base md:text-lg">
              <span>🎬</span> 分镜头脚本生成
            </span>
            {activeTab === 'storyboard' && <span className="bg-black text-white px-2 py-0.5 text-xs font-black">ACTIVE</span>}
          </button>

          <button
            onClick={() => setActiveTab('audio')}
            className={`w-full text-left p-4 font-bold border-3 border-black flex items-center justify-between transition-all duration-100 cursor-pointer ${
              activeTab === 'audio'
                ? 'bg-[#FF6B6B] translate-x-1 shadow-none'
                : 'bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]'
            }`}
          >
            <span className="flex items-center gap-3 text-base md:text-lg">
              <span>🔊</span> AI 语音配音生成
            </span>
            {activeTab === 'audio' && <span className="bg-black text-white px-2 py-0.5 text-xs font-black">ACTIVE</span>}
          </button>

          {/* Neo card design brief */}
          <div className="bg-white border-3 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mt-4">
            <h4 className="font-extrabold text-sm border-b-2 border-black pb-2 mb-2 uppercase">💡 Visual Philosophy</h4>
            <p className="text-xs font-medium text-gray-700 leading-relaxed">
              This environment relies on **Neo-brutalism** geometry: sharp, high-contrast black contours, zero-blur heavy drop-shadows, and physical offset push effects to provide the ultimate responsive experience.
            </p>
          </div>
        </nav>

        {/* Right-side Interactive Panel (Forms & Live Output) */}
        <main className="col-span-1 lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* ==================== 1. COPY TAB ==================== */}
          {activeTab === 'copy' && (
            <>
              {/* Form Input Card */}
              <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-5">
                <div className="border-b-4 border-black pb-3">
                  <h2 className="text-2xl font-extrabold uppercase">✍️ Copywriter Form</h2>
                  <p className="text-xs text-gray-500 font-bold tracking-wide mt-1 uppercase">// Setup brand & copy tone</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-extrabold text-sm uppercase">🏢 Brand / Product Name</label>
                  <input
                    type="text"
                    value={copyInput.brandName}
                    onChange={(e) => setCopyInput({ ...copyInput, brandName: e.target.value })}
                    className="border-2 border-black p-3 font-bold bg-[#F4F4F0] focus:bg-white focus:outline-none focus:border-[#FFDE4D] transition-colors"
                    placeholder="Enter brand name"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-extrabold text-sm uppercase">📝 Features / Description</label>
                  <textarea
                    rows={3}
                    value={copyInput.description}
                    onChange={(e) => setCopyInput({ ...copyInput, description: e.target.value })}
                    className="border-2 border-black p-3 font-bold bg-[#F4F4F0] focus:bg-white focus:outline-none focus:border-[#FFDE4D] transition-colors resize-none"
                    placeholder="Enter core features or values"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-extrabold text-sm uppercase">🎭 Tone Choice</label>
                    <select
                      value={copyInput.tone}
                      onChange={(e) => setCopyInput({ ...copyInput, tone: e.target.value })}
                      className="border-2 border-black p-3 font-extrabold bg-[#F4F4F0] focus:bg-white focus:outline-none focus:border-[#FFDE4D] transition-colors cursor-pointer appearance-none"
                    >
                      <option value="爆款活泼">🔥 爆款活泼</option>
                      <option value="严谨学术">🎓 严谨学术</option>
                      <option value="幽默整活">🤡 幽默整活</option>
                      <option value="高端商务">💼 高端商务</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-extrabold text-sm uppercase">📱 Social Platform</label>
                    <select
                      value={copyInput.platform}
                      onChange={(e) => setCopyInput({ ...copyInput, platform: e.target.value })}
                      className="border-2 border-black p-3 font-extrabold bg-[#F4F4F0] focus:bg-white focus:outline-none focus:border-[#FFDE4D] transition-colors cursor-pointer appearance-none"
                    >
                      <option value="Xiaohongshu">📕 小红书</option>
                      <option value="WeChat">🟢 微信公众号</option>
                      <option value="default">🌍 英文通用推广</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleGenerateCopy}
                  disabled={loading}
                  className="w-full mt-2 border-3 border-black bg-[#FFDE4D] hover:bg-[#ffe775] p-4 font-extrabold text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 cursor-pointer flex justify-center items-center gap-2"
                >
                  {loading ? (
                    <span className="inline-block animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full"></span>
                  ) : '🪄'}
                  {loading ? 'GENERATING COPIES...' : 'GENERATE AI COPYWRITING'}
                </button>
              </div>

              {/* Output Preview Card */}
              <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b-4 border-black pb-3 mb-5">
                    <h3 className="text-xl font-extrabold uppercase">📺 Preview Board</h3>
                    <span className="bg-[#39FF14] text-xs font-extrabold border-2 border-black px-2 py-0.5 uppercase">
                      Copy
                    </span>
                  </div>

                  {/* Generated copy details */}
                  <div className="flex flex-col gap-4">
                    <div className="bg-[#FFDE4D]/10 border-2 border-dashed border-black p-4 rounded-md">
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">🏷️ Headline / Title</div>
                      <h4 className="font-extrabold text-lg leading-snug">{copyOutput.title}</h4>
                    </div>

                    <div className="border-2 border-black p-4 bg-[#F4F4F0] min-h-[140px] flex flex-col gap-3">
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-300 pb-1 mb-1">📄 Paragraph Content</div>
                      {copyOutput.paragraphs.map((p: string, idx: number) => (
                        <p key={idx} className="text-sm font-semibold leading-relaxed text-gray-800">{p}</p>
                      ))}
                    </div>

                    <div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">🏷️ Target Tags</div>
                      <div className="flex flex-wrap gap-2">
                        {copyOutput.tags.map((t: string, idx: number) => (
                          <span key={idx} className="bg-white border-2 border-black px-2 py-1 font-bold text-xs hover:bg-[#39FF14] cursor-default transition-colors">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="border-2 border-black p-3 bg-black text-white text-xs font-bold font-mono">
                      📣 {copyOutput.call_to_action}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleCopyClipboard(`${copyOutput.title}\n\n${copyOutput.paragraphs.join('\n')}\n\n${copyOutput.tags.map((t: string) => '#' + t).join(' ')}`)}
                  className="w-full mt-6 border-2 border-black bg-white hover:bg-gray-100 p-3 font-extrabold text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex justify-center items-center gap-2"
                >
                  📋 COPY TO CLIPBOARD
                </button>
              </div>
            </>
          )}

          {/* ==================== 2. IMAGE TAB ==================== */}
          {activeTab === 'image' && (
            <>
              {/* Form Input Card */}
              <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-5">
                <div className="border-b-4 border-black pb-3">
                  <h2 className="text-2xl font-extrabold uppercase">🎨 Image parameters</h2>
                  <p className="text-xs text-gray-500 font-bold tracking-wide mt-1 uppercase">// Configure visual styles</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-extrabold text-sm uppercase">💬 Visual Prompt</label>
                  <textarea
                    rows={4}
                    value={imageInput.prompt}
                    onChange={(e) => setImageInput({ ...imageInput, prompt: e.target.value })}
                    className="border-2 border-black p-3 font-bold bg-[#F4F4F0] focus:bg-white focus:outline-none focus:border-[#39FF14] transition-colors resize-none leading-relaxed"
                    placeholder="Describe what image you want to generate"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-extrabold text-sm uppercase">📐 Aspect Ratio</label>
                    <select
                      value={imageInput.aspectRatio}
                      onChange={(e) => setImageInput({ ...imageInput, aspectRatio: e.target.value })}
                      className="border-2 border-black p-3 font-extrabold bg-[#F4F4F0] focus:bg-white focus:outline-none focus:border-[#39FF14] transition-colors cursor-pointer appearance-none"
                    >
                      <option value="1:1">⬛ Square (1:1)</option>
                      <option value="16:9">📺 Widescreen (16:9)</option>
                      <option value="9:16">📱 Vertical (9:16)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-extrabold text-sm uppercase">🎭 Artistic Style</label>
                    <select
                      value={imageInput.style}
                      onChange={(e) => setImageInput({ ...imageInput, style: e.target.value })}
                      className="border-2 border-black p-3 font-extrabold bg-[#F4F4F0] focus:bg-white focus:outline-none focus:border-[#39FF14] transition-colors cursor-pointer appearance-none"
                    >
                      <option value="neo-brutalism">⚡ 新粗野主义</option>
                      <option value="3d">🧸 3D 萌系拟真</option>
                      <option value="minimalist">⬜ 极简极白</option>
                      <option value="cinematic">🎥 电影感写实</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleGenerateImage}
                  disabled={loading}
                  className="w-full mt-2 border-3 border-black bg-[#39FF14] hover:bg-[#68ff4d] p-4 font-extrabold text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 cursor-pointer flex justify-center items-center gap-2"
                >
                  {loading ? (
                    <span className="inline-block animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full"></span>
                  ) : '🪄'}
                  {loading ? 'GENERATING ARTWORKS...' : 'GENERATE AI SOCIAL IMAGE'}
                </button>
              </div>

              {/* Output Preview Card */}
              <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b-4 border-black pb-3 mb-5">
                    <h3 className="text-xl font-extrabold uppercase">📺 Preview Board</h3>
                    <span className="bg-[#39FF14] text-xs font-extrabold border-2 border-black px-2 py-0.5 uppercase">
                      IMAGE
                    </span>
                  </div>

                  <div className="flex flex-col gap-4">
                    {/* Visual box wrapper */}
                    <div className="border-3 border-black bg-black p-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative flex justify-center items-center overflow-hidden min-h-[220px]">
                      {loading ? (
                        <div className="text-white text-center p-6 flex flex-col items-center gap-3">
                          <span className="inline-block animate-spin h-8 w-8 border-3 border-white border-t-transparent rounded-full"></span>
                          <span className="font-mono text-xs tracking-wider animate-pulse">RENDER PIPELINE ACTIVE...</span>
                        </div>
                      ) : (
                        <img
                          src={imageOutput.image_url}
                          alt="AI output"
                          className="max-h-[300px] w-full object-cover object-center border border-black"
                        />
                      )}
                      
                      {!loading && (
                        <span className="absolute bottom-3 right-3 bg-black text-[#39FF14] border border-[#39FF14] font-mono text-[10px] px-2 py-0.5">
                          RATIO: {imageOutput.aspectRatio}
                        </span>
                      )}
                    </div>

                    <div className="border-2 border-black p-4 bg-[#F4F4F0] mt-1 text-xs">
                      <div className="font-extrabold text-gray-500 uppercase tracking-wider mb-1">🤖 Optimized System Prompt</div>
                      <p className="font-mono leading-relaxed text-gray-700">{imageOutput.revised_prompt}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                  <button
                    onClick={() => handleCopyClipboard(imageOutput.revised_prompt)}
                    className="border-2 border-black bg-white hover:bg-gray-100 p-3 font-extrabold text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex justify-center items-center"
                  >
                    📋 COPY PROMPT
                  </button>
                  <a
                    href={imageOutput.image_url}
                    target="_blank"
                    className="border-2 border-black bg-white hover:bg-gray-100 p-3 font-extrabold text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex justify-center items-center text-center"
                  >
                    🔗 VIEW FULL RES
                  </a>
                </div>
              </div>
            </>
          )}

          {/* ==================== 3. STORYBOARD TAB ==================== */}
          {activeTab === 'storyboard' && (
            <>
              {/* Form Input Card */}
              <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-5">
                <div className="border-b-4 border-black pb-3">
                  <h2 className="text-2xl font-extrabold uppercase">🎬 Script Parameters</h2>
                  <p className="text-xs text-gray-500 font-bold tracking-wide mt-1 uppercase">// Map video sequences</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-extrabold text-sm uppercase">📽️ Video Topic / Focus</label>
                  <input
                    type="text"
                    value={storyboardInput.topic}
                    onChange={(e) => setStoryboardInput({ ...storyboardInput, topic: e.target.value })}
                    className="border-2 border-black p-3 font-bold bg-[#F4F4F0] focus:bg-white focus:outline-none focus:border-[#B983FF] transition-colors"
                    placeholder="Enter video scene focus"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-extrabold text-sm uppercase">⏱️ Total Seconds</label>
                    <select
                      value={storyboardInput.duration}
                      onChange={(e) => setStoryboardInput({ ...storyboardInput, duration: parseInt(e.target.value) })}
                      className="border-2 border-black p-3 font-extrabold bg-[#F4F4F0] focus:bg-white focus:outline-none focus:border-[#B983FF] transition-colors cursor-pointer appearance-none"
                    >
                      <option value={15}>15s Short / Douyin</option>
                      <option value={30}>30s Promotion</option>
                      <option value={60}>60s Deep Explainer</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-extrabold text-sm uppercase">👥 Target Audience</label>
                    <input
                      type="text"
                      value={storyboardInput.audience}
                      onChange={(e) => setStoryboardInput({ ...storyboardInput, audience: e.target.value })}
                      className="border-2 border-black p-3 font-bold bg-[#F4F4F0] focus:bg-white focus:outline-none focus:border-[#B983FF] transition-colors"
                      placeholder="Target demographic"
                    />
                  </div>
                </div>

                <button
                  onClick={handleGenerateStoryboard}
                  disabled={loading}
                  className="w-full mt-2 border-3 border-black bg-[#B983FF] hover:bg-[#d1adff] p-4 font-extrabold text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 cursor-pointer flex justify-center items-center gap-2"
                >
                  {loading ? (
                    <span className="inline-block animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full"></span>
                  ) : '🪄'}
                  {loading ? 'PLANNING SCENES...' : 'GENERATE AI STORYBOARD'}
                </button>
              </div>

              {/* Output Preview Card */}
              <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b-4 border-black pb-3 mb-4">
                    <h3 className="text-xl font-extrabold uppercase">📺 Storyboard Timeline</h3>
                    <span className="bg-[#B983FF] text-xs font-extrabold border-2 border-black px-2 py-0.5 uppercase">
                      Timeline
                    </span>
                  </div>

                  {/* Scene Timeline container */}
                  <div className="flex flex-col gap-4 overflow-y-auto max-h-[350px] pr-1">
                    {loading ? (
                      <div className="p-12 text-center flex flex-col items-center gap-3">
                        <span className="inline-block animate-spin h-8 w-8 border-3 border-black border-t-transparent rounded-full"></span>
                        <span className="font-mono text-xs font-bold animate-pulse">GENERATING SEQUENCES...</span>
                      </div>
                    ) : (
                      storyboardOutput.scenes.map((scene: any, idx: number) => (
                        <div key={idx} className="border-2 border-black p-4 bg-[#F4F4F0] relative shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                          <span className="absolute top-3 right-3 bg-black text-[#B983FF] text-[10px] font-mono px-2 py-0.5 border border-black font-extrabold">
                            SCENE {scene.scene_number} / {scene.duration_seconds}s
                          </span>
                          <div className="font-extrabold text-sm text-[#B983FF] uppercase mb-2">
                            📹 Scene action description
                          </div>
                          <p className="text-xs font-bold leading-relaxed text-gray-800 mb-3 border-l-2 border-black pl-2">
                            {scene.visual_description}
                          </p>
                          <div className="font-extrabold text-sm text-gray-700 uppercase mb-1">
                            🎤 Dubbing Narration
                          </div>
                          <p className="text-xs font-mono font-medium leading-relaxed bg-white border border-black p-2 text-black">
                            {scene.audio_narration}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-4 border-t-2 border-black pt-4 flex justify-between items-center text-xs font-bold">
                  <span>TOPIC: "{storyboardOutput.video_topic}"</span>
                  <span>TOTAL DUR: {storyboardOutput.total_duration_seconds}S</span>
                </div>
              </div>
            </>
          )}

          {/* ==================== 4. AUDIO TAB ==================== */}
          {activeTab === 'audio' && (
            <>
              {/* Form Input Card */}
              <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col gap-5">
                <div className="border-b-4 border-black pb-3">
                  <h2 className="text-2xl font-extrabold uppercase">🔊 Voice Synthesizer</h2>
                  <p className="text-xs text-gray-500 font-bold tracking-wide mt-1 uppercase">// Convert text to audio</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-extrabold text-sm uppercase">📜 Text script to read</label>
                  <textarea
                    rows={4}
                    value={audioInput.text}
                    onChange={(e) => setAudioInput({ ...audioInput, text: e.target.value })}
                    className="border-2 border-black p-3 font-bold bg-[#F4F4F0] focus:bg-white focus:outline-none focus:border-[#FF6B6B] transition-colors resize-none leading-relaxed"
                    placeholder="Enter script text to synthesize"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-extrabold text-sm uppercase">🎙️ Voice Character</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'female_warm', label: '👩 温暖女声', color: 'bg-[#FFDE4D]' },
                      { id: 'male_energetic', label: '👨 激情男声', color: 'bg-[#39FF14]' },
                      { id: 'child_cheerful', label: '👦 快乐童声', color: 'bg-[#4D96FF]' },
                    ].map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setAudioInput({ ...audioInput, voiceId: v.id })}
                        className={`p-3 font-extrabold text-xs border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer ${
                          audioInput.voiceId === v.id ? `${v.color} translate-y-0.5 shadow-none` : 'bg-white'
                        }`}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center font-extrabold text-sm">
                    <span className="uppercase">🚀 Narration Speed</span>
                    <span className="font-mono bg-black text-[#FF6B6B] px-1.5 py-0.5 text-xs">{audioInput.speed}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={audioInput.speed}
                    onChange={(e) => setAudioInput({ ...audioInput, speed: parseFloat(e.target.value) })}
                    className="w-full accent-black bg-[#F4F4F0] border border-black h-2 cursor-pointer rounded-none appearance-none"
                  />
                </div>

                <button
                  onClick={handleGenerateAudio}
                  disabled={loading}
                  className="w-full mt-2 border-3 border-black bg-[#FF6B6B] hover:bg-[#ffa1a1] p-4 font-extrabold text-lg shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all duration-100 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 cursor-pointer flex justify-center items-center gap-2"
                >
                  {loading ? (
                    <span className="inline-block animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full"></span>
                  ) : '🪄'}
                  {loading ? 'SYNTHESIZING AUDIO...' : 'GENERATE AI VOICEOVER'}
                </button>
              </div>

              {/* Output Preview Card */}
              <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b-4 border-black pb-3 mb-5">
                    <h3 className="text-xl font-extrabold uppercase">📺 Preview Board</h3>
                    <span className="bg-[#FF6B6B] text-xs font-extrabold border-2 border-black px-2 py-0.5 uppercase">
                      VOICE
                    </span>
                  </div>

                  <div className="flex flex-col gap-4">
                    {/* Simulated Retro Synthesizer Deck */}
                    <div className="border-3 border-black bg-black p-4 text-[#FF6B6B] font-mono text-xs flex flex-col gap-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] relative overflow-hidden">
                      <div className="absolute top-0 right-0 h-10 w-10 bg-[#FF6B6B]/10 rounded-full blur-xl"></div>
                      
                      <div className="flex justify-between items-center border-b border-[#FF6B6B]/30 pb-2">
                        <span>SYSTEM: [TTS_GENERATOR_V1]</span>
                        <span className="animate-pulse">● PLAYING</span>
                      </div>

                      {/* Fake Sound Waveforms */}
                      <div className="h-16 flex items-end gap-1.5 border-b border-[#FF6B6B]/30 pb-3 mt-1">
                        {Array.from({ length: 24 }).map((_, idx) => {
                          const heights = ['h-2', 'h-8', 'h-14', 'h-10', 'h-4', 'h-12', 'h-6', 'h-2', 'h-8', 'h-12', 'h-6', 'h-3'];
                          return (
                            <span
                              key={idx}
                              className={`flex-grow bg-[#FF6B6B] border border-black transition-all ${
                                loading ? 'animate-pulse bg-[#FF6B6B]/40' : heights[idx % heights.length]
                              }`}
                            ></span>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[10px] uppercase font-bold text-gray-400">
                        <div>🗣️ Speaker: <span className="text-white">{audioOutput.voice_id}</span></div>
                        <div>📈 Tempo Rate: <span className="text-white">{audioOutput.speed}x</span></div>
                        <div>📝 Characters: <span className="text-white">{audioOutput.text_length} chars</span></div>
                        <div>⏳ Duration: <span className="text-white">~{audioOutput.estimated_audio_duration_seconds}s</span></div>
                      </div>
                    </div>

                    {/* True Audio player node */}
                    <div className="border-2 border-black bg-[#F4F4F0] p-4 flex flex-col gap-2 rounded-md">
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">💿 Synthesized Output Audio Stream</div>
                      {loading ? (
                        <div className="p-3 bg-white border border-gray-300 text-xs font-mono text-center font-bold text-gray-400">
                          LOADING STREAMING PIPELINE...
                        </div>
                      ) : (
                        <audio
                          key={audioOutput.audio_url}
                          controls
                          className="w-full h-10 border border-black outline-none accent-black bg-white rounded-none"
                        >
                          <source src={audioOutput.audio_url} type="audio/mpeg" />
                          Your browser does not support the audio element.
                        </audio>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleCopyClipboard(audioOutput.text)}
                  className="w-full mt-6 border-2 border-black bg-white hover:bg-gray-100 p-3 font-extrabold text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex justify-center items-center gap-2"
                >
                  📋 COPY READ TEXT
                </button>
              </div>
            </>
          )}

        </main>

      </div>

      {/* Footer Design */}
      <footer className="w-full border-t-3 border-black py-6 mt-16 flex flex-col md:flex-row justify-between items-center gap-4 text-xs md:text-sm font-bold">
        <span>© 2026 MARKETING-HUB INC. ALL RIGHTS RESERVED.</span>
        <div className="flex gap-4">
          <a href="#" className="underline hover:text-[#FFDE4D]">TERMS</a>
          <span>//</span>
          <a href="#" className="underline hover:text-[#39FF14]">PRIVACY</a>
          <span>//</span>
          <a href="#" className="underline hover:text-[#B983FF]">SUPPORT</a>
        </div>
      </footer>

    </div>
  );
}
