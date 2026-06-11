import { useCommunity } from './useCommunity';
import type { WorkspaceScope } from '../dashboard/types';

interface CommunityPageProps {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  onLikeUpdate?: (id: number, likes: number) => void;
}

export function CommunityPage({
  workspaceScope,
  username,
  triggerToast,
  onLikeUpdate,
}: CommunityPageProps) {
  const {
    communityItems,
    searchQuery,
    setSearchQuery,
    ragLogs,
    isRagActive,
    fetchCommunity,
    handleLike,
    handleRAGSearch,
    resetSearch,
  } = useCommunity({ workspaceScope, username, triggerToast, onLikeUpdate });

  // Auto-fetch on mount
  void fetchCommunity();

  return (
    <div className="flex flex-col gap-8 font-mono">
      <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-6 shadow-editorial relative">
        <div>
          <h3 className="text-sm font-black text-[var(--editorial-text)] flex items-center gap-2 font-mono uppercase">
            <span>品牌灵感搜索</span>
          </h3>
          <p className="text-[10px] text-[var(--editorial-text-gray)] mt-1.5 leading-relaxed font-bold">
            从过往作品中快速找出相近素材、表达方式和视觉方向，方便继续沿用品牌设定。
          </p>
        </div>

        <form onSubmit={handleRAGSearch} className="flex gap-3 mt-4">
          <div className="relative flex-grow">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] px-1 py-3 text-xs focus:outline-none focus:border-b-2 transition-all font-semibold font-mono"
              placeholder="输入关键词，例如：小红书咖啡、视觉工作区、文案神器"
            />
          </div>

          <button
            type="submit"
            className="bg-[var(--editorial-stroke)] text-[var(--editorial-bg)] border border-[var(--editorial-stroke)] font-black px-6 py-3 text-xs transition-all shadow-editorial active:shadow-none active:translate-x-[3px] active:translate-y-[3px] cursor-pointer"
          >
            <span>搜索灵感</span>
          </button>
        </form>

        {isRagActive && ragLogs.length > 0 && (
          <div className="bg-[var(--editorial-bg)]/40 border border-[var(--editorial-stroke)]/40 p-4 mt-3">
            <span className="text-[10px] text-[var(--editorial-text-gray)] font-black block">
              已完成素材对齐，共返回 {communityItems.length} 条相近作品。
            </span>
          </div>
        )}
      </div>

      <div>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-sm font-black text-[var(--editorial-text)] flex items-center gap-2 font-mono uppercase">
            <span>CREATOR MANUSCRIPTS FEED</span>
          </h3>
          {isRagActive && (
            <button
              onClick={resetSearch}
              className="text-xs text-[var(--editorial-accent-blue)] hover:underline font-bold"
            >
              [ 显示全部作品 ]
            </button>
          )}
        </div>

        {communityItems.length === 0 ? (
          <div className="text-center py-16 bg-[var(--editorial-bg)]/40 border border-dashed border-[var(--editorial-stroke)]/45">
            <p className="text-xs text-[var(--editorial-text-gray)] font-bold font-mono">暂无分享作品，请使用 AIGC Agent 生成并分享出来！</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {communityItems.map((item, index) => {
              const rotations = ['rotate-[0.5deg]', 'rotate-[-0.6deg]', 'rotate-[0.4deg]', 'rotate-[-0.3deg]'];
              const rotClass = rotations[index % rotations.length];

              return (
                <div key={item.id} className={`bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 pb-12 shadow-editorial relative flex flex-col justify-between hover:scale-[1.01] transition-all group ${rotClass}`}>
                  {item.similarity_score !== undefined && (
                    <span className="absolute top-4 right-4 bg-[var(--editorial-accent-yellow)] border border-[var(--editorial-stroke)] text-black text-[8px] font-bold px-2 py-0.5 shadow-editorial-sm z-10">
                      SIM: {Math.round(item.similarity_score * 100)}%
                    </span>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-3 border-b border-dashed border-[var(--editorial-stroke)]/40 pb-2">
                      <span className="bg-[var(--editorial-unselected)] border border-[var(--editorial-stroke)]/60 px-1.5 py-0.5 text-[8px] font-black uppercase text-[var(--editorial-text)] font-mono">
                        {item.creation_type_display}
                      </span>
                      <span className="text-[8px] text-[var(--editorial-text-gray)] font-bold flex items-center gap-1 font-mono">
                        <span>{item.created_at}</span>
                      </span>
                    </div>

                    <h4 className="text-xs font-black text-[var(--editorial-text)] mb-3 line-clamp-1">{item.title}</h4>

                    <div className="bg-[var(--editorial-bg)]/20 border border-[var(--editorial-stroke)]/40 p-3 text-[10px] min-h-[140px] max-h-[180px] overflow-y-auto mb-4 font-mono leading-relaxed">
                      {item.creation_type === 'copy' && (
                        <div className="space-y-2">
                          <h5 className="font-black text-[var(--editorial-text)]">{item.content.title}</h5>
                          {item.content.paragraphs?.map((p: string, i: number) => (
                            <p key={i} className="text-[var(--editorial-text-gray)] font-semibold leading-relaxed">{p}</p>
                          ))}
                          <div className="text-[9px] text-[var(--editorial-accent-blue)] mt-2 font-bold italic">
                            {item.content.tags?.map((t: string) => `#${t} `)}
                          </div>
                        </div>
                      )}

                      {item.creation_type === 'image' && (
                        <div className="flex flex-col gap-2">
                          <img
                            src={item.image_url || 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80'}
                            alt="Community Visual Sketch"
                            className="h-24 w-full object-cover border border-[var(--editorial-stroke)]"
                          />
                          <p className="text-[9px] text-[var(--editorial-text-gray)] line-clamp-2 leading-relaxed">
                            {item.content.revised_prompt}
                          </p>
                        </div>
                      )}

                      {item.creation_type === 'storyboard' && (
                        <div className="space-y-2.5">
                          {item.content.scenes?.map((scene, i) => (
                            <div key={i} className="border-b border-[var(--editorial-stroke)]/40 pb-1.5 mb-1.5 last:border-0 last:pb-0 last:mb-0">
                              <div className="font-black text-[8px] text-[var(--editorial-text-gray)] mb-0.5">SCENE {scene.scene_number} ({scene.duration_seconds}s)</div>
                              <p className="text-[var(--editorial-text)] leading-snug line-clamp-2 font-semibold">{scene.visual_description}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {item.creation_type === 'audio' && (
                        <div className="flex flex-col justify-center items-center py-3 gap-2">
                          <span className="text-[8px] text-[var(--editorial-text-gray)] text-center font-bold">EST DURATION: ~{item.content.estimated_audio_duration_seconds}S</span>
                          <audio controls className="w-full h-8 mt-1 border border-[var(--editorial-stroke)]/40 rounded-none bg-transparent">
                            <source src={item.audio_url || 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'} type="audio/mpeg" />
                          </audio>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="absolute bottom-2 left-4 right-4 flex justify-between items-center text-[8px] font-mono text-[var(--editorial-text-gray)] border-t border-dashed border-[var(--editorial-stroke)]/40 pt-2.5">
                    <span className="font-bold flex items-center gap-1">
                      <span className="h-4.5 w-4.5 bg-[var(--editorial-stroke)] text-[var(--editorial-bg)] border border-[var(--editorial-stroke)] flex items-center justify-center text-[8px] font-black uppercase">
                        {item.username.substring(0, 2)}
                      </span>
                      <span>{item.username}</span>
                    </span>

                    <button
                      onClick={() => handleLike(item.id)}
                      className="bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] hover:bg-rose-500 hover:text-white px-2 py-1 font-black flex items-center gap-1.5 cursor-pointer text-black active:translate-x-[1px] active:translate-y-[1px] shadow-editorial-sm active:shadow-none transition-all"
                    >
                      <span>{item.likes}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}