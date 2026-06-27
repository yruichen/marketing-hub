import { useEffect } from 'react';
import { ArrowRight, Heart, Mic, Search, Sparkles, Video, Wand2 } from 'lucide-react';
import { useCommunity } from './useCommunity';
import type { CommunityItem } from './types';
import type { WorkspaceScope } from '../dashboard/types';

interface CommunityPageProps {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  onLikeUpdate?: (id: number, likes: number) => void;
  onOpenProfile?: (username: string) => void;
}

const SCENE_CHIPS = ['小红书种草', '新品上市', '短视频分镜', '品牌调性', '视觉 Prompt', '口播脚本'];

export function CommunityPage({
  workspaceScope,
  username,
  triggerToast,
  onLikeUpdate,
  onOpenProfile,
}: CommunityPageProps) {
  const {
    communityItems,
    searchQuery,
    setSearchQuery,
    ragLogs,
    isRagActive,
    loading,
    fetchCommunity,
    handleLike,
    handleReport,
    handleRAGSearch,
    resetSearch,
  } = useCommunity({ workspaceScope, username, triggerToast, onLikeUpdate });

  useEffect(() => {
    void fetchCommunity();
  }, [fetchCommunity]);

  const featured = communityItems[0];
  const rest = featured ? communityItems.slice(1) : communityItems;

  return (
    <div className="template-market flex h-full min-h-0 flex-col gap-5 overflow-y-auto pr-1 font-mono">
      <section className="template-market__hero">
        <div className="template-market__hero-copy">
          <span className="template-market__eyebrow">Template Library</span>
          <h2 className="serif-header text-3xl font-black leading-tight text-[var(--editorial-text)] md:text-5xl">
            找到可以直接复用的创意配方
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-[var(--editorial-text-muted)]">
            从团队沉淀的文案、视觉、分镜和口播里找灵感。这里不是作品陈列柜，而是下一次生成的起点。
          </p>
        </div>

        <form onSubmit={handleRAGSearch} className="template-market__search-card">
          <label className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--editorial-text-gray)]">
            品牌灵感搜索
          </label>
          <div className="template-market__search-box">
            <Search className="h-4 w-4 text-[var(--editorial-text-gray)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索：小红书咖啡 / 新品发布 / 高级感视觉"
            />
            <button type="submit" disabled={loading}>
              {loading ? '搜索中' : '搜索'}
            </button>
          </div>
          <div className="template-market__chips">
            {SCENE_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setSearchQuery(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          {isRagActive && (
            <div className="template-market__search-result">
              找到 {communityItems.length} 条相近模板{ragLogs.length > 0 ? ` · ${ragLogs.length} 条检索日志` : ''}
              <button type="button" onClick={resetSearch}>显示全部</button>
            </div>
          )}
        </form>
      </section>

      {communityItems.length === 0 ? (
        <section className="template-market__empty">
          <Sparkles className="h-8 w-8" />
          <h3>模板库还没有内容</h3>
          <p>从 AIGC 生成结果点击「分享社区」，这里就会变成团队的创意配方库。</p>
        </section>
      ) : (
        <>
          {featured && <FeaturedTemplate item={featured} onLike={handleLike} onReport={handleReport} onOpenProfile={onOpenProfile} />}

          <section className="template-market__section-head">
            <div>
              <h3>可复用模板</h3>
              <p>{isRagActive ? '按语义相似度排序' : '最近沉淀的团队创意资产'}</p>
            </div>
            <span>{communityItems.length} items</span>
          </section>

          <section className="template-market__grid">
            {rest.map((item) => (
              <TemplateCard key={item.id} item={item} onLike={handleLike} onReport={handleReport} onOpenProfile={onOpenProfile} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function FeaturedTemplate({ item, onLike, onReport, onOpenProfile }: { item: CommunityItem; onLike: (id: number) => void; onReport: (id: number) => void; onOpenProfile?: (username: string) => void }) {
  return (
    <section className="template-market__featured">
      <div className="template-market__featured-visual">
        <TemplateVisual item={item} large />
      </div>
      <div className="template-market__featured-copy">
        <span className="template-market__type">精选模板 / {item.creation_type_display}</span>
        <h3>{item.title}</h3>
        <p>{templateSummary(item)}</p>
        <div className="template-market__featured-actions">
          <button type="button" onClick={() => onLike(item.id)}>
            <Heart className="h-4 w-4" /> {item.likes}
          </button>
          <button type="button" onClick={() => onReport(item.id)}>
            举报
          </button>
          <button type="button" className="template-author-link" onClick={() => onOpenProfile?.(item.username)}>
            {item.username}
          </button>
          <span>{item.created_at}</span>
          {item.ai_generated ? <span>AI 生成初稿</span> : null}
          {item.similarity_score !== undefined && <span>匹配 {Math.round(item.similarity_score * 100)}%</span>}
        </div>
      </div>
    </section>
  );
}

function TemplateCard({ item, onLike, onReport, onOpenProfile }: { item: CommunityItem; onLike: (id: number) => void; onReport: (id: number) => void; onOpenProfile?: (username: string) => void }) {
  return (
    <article className="template-card">
      <TemplateVisual item={item} />
      <div className="template-card__body">
        <div className="template-card__meta">
          <span>{item.creation_type_display}</span>
          {item.ai_generated ? <span>AI</span> : null}
          {item.similarity_score !== undefined && <span>{Math.round(item.similarity_score * 100)}%</span>}
        </div>
        <h4>{item.title}</h4>
        <p>{templateSummary(item)}</p>
      </div>
      <footer className="template-card__footer">
        <button type="button" className="template-author-link" onClick={() => onOpenProfile?.(item.username)}>
          {item.username}
        </button>
        <button type="button" onClick={() => onLike(item.id)}>
          <Heart className="h-3.5 w-3.5" /> {item.likes}
        </button>
        <button type="button" onClick={() => onReport(item.id)}>
          举报{item.reported_count ? ` ${item.reported_count}` : ''}
        </button>
      </footer>
    </article>
  );
}

function TemplateVisual({ item, large = false }: { item: CommunityItem; large?: boolean }) {
  if (item.creation_type === 'image') {
    return (
      <div className={`template-visual template-visual--image ${large ? 'is-large' : ''}`}>
        <img
          src={item.image_url || 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80'}
          alt={item.title}
        />
      </div>
    );
  }

  if (item.creation_type === 'audio') {
    return (
      <div className={`template-visual template-visual--audio ${large ? 'is-large' : ''}`}>
        <Mic className="h-8 w-8" />
        <div className="template-wave" aria-hidden="true">
          {Array.from({ length: 18 }).map((_, index) => (
            <span key={index} style={{ height: `${20 + ((index * 17) % 62)}%` }} />
          ))}
        </div>
      </div>
    );
  }

  if (item.creation_type === 'storyboard' || item.creation_type === 'video') {
    return (
      <div className={`template-visual template-visual--storyboard ${large ? 'is-large' : ''}`}>
        <Video className="h-8 w-8" />
        <div className="template-scenes">
          {item.creation_type === 'video'
            ? <span>VIDEO</span>
            : (item.content.scenes || []).slice(0, 3).map((scene, index) => (
              <span key={index}>S{scene.scene_number || index + 1}</span>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`template-visual template-visual--copy ${large ? 'is-large' : ''}`}>
      <Wand2 className="h-8 w-8" />
      <p>{item.content.title || item.title}</p>
      <ArrowRight className="h-4 w-4" />
    </div>
  );
}

function templateSummary(item: CommunityItem) {
  if (item.creation_type === 'copy') {
    return item.content.paragraphs?.[0] || item.content.call_to_action || item.content.title || item.title;
  }
  if (item.creation_type === 'image') {
    return item.content.revised_prompt || item.content.prompt || '可复用的视觉提示词模板';
  }
  if (item.creation_type === 'storyboard') {
    return item.content.scenes?.[0]?.visual_description || item.content.video_topic || '可复用的短视频分镜结构';
  }
  if (item.creation_type === 'audio') {
    return item.content.text || `约 ${item.content.estimated_audio_duration_seconds || '-'} 秒口播音频模板`;
  }
  if (item.creation_type === 'video') {
    return item.content.prompt || item.content.video_topic || '可复用的视频生成模板';
  }
  return item.title;
}
