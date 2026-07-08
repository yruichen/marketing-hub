import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Library, Search, Sparkles } from 'lucide-react';
import { useCommunity } from './useCommunity';
import { TemplateMasonryCard } from './TemplateMasonryCard';
import { TemplateDetailModal } from './TemplateDetailModal';
import { useTemplateSocial } from './useTemplateSocial';
import type { CommunityItem } from './types';
import type { TriggerToastFn } from '../../shared/types/toast';
import type { WorkspaceScope } from '../dashboard/types';
import './template-library.css';

interface TemplateLibraryPageProps {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  triggerToast: TriggerToastFn;
  onBack: () => void;
  onOpenProfile?: (username: string) => void;
  onOpenAssetsLibrary?: () => void;
}

const SCENE_CHIPS = ['小红书种草', '新品上市', '短视频分镜', '品牌调性', '视觉 Prompt', '口播脚本'];

export function TemplateLibraryPage({
  workspaceScope,
  username,
  triggerToast,
  onBack,
  onOpenProfile,
  onOpenAssetsLibrary,
}: TemplateLibraryPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const {
    communityItems,
    searchQuery,
    setSearchQuery,
    isRagActive,
    loading,
    fetchCommunity,
    handleLike,
    handleReport,
    handleRAGSearch,
    resetSearch,
  } = useCommunity({ workspaceScope, username, triggerToast });

  const {
    isFollowing,
    isCollected,
    toggleFollow,
    toggleCollect,
  } = useTemplateSocial(username);

  useEffect(() => {
    void fetchCommunity();
  }, [fetchCommunity]);

  const openId = searchParams.get('open');
  const detailItem = useMemo(() => {
    const rawId = selectedId ?? (openId ? Number(openId) : null);
    if (rawId == null || Number.isNaN(rawId)) return null;
    return communityItems.find((item) => item.id === rawId) ?? null;
  }, [selectedId, openId, communityItems]);

  const openItem = (item: CommunityItem) => {
    setSelectedId(item.id);
    setSearchParams({ open: String(item.id) }, { replace: true });
  };

  const closeItem = () => {
    setSelectedId(null);
    setSearchParams({}, { replace: true });
  };

  const onToggleFollow = (creator: string) => {
    const wasFollowing = isFollowing(creator);
    toggleFollow(creator);
    triggerToast(wasFollowing ? `已取消关注 @${creator}` : `已关注 @${creator}`, 'info');
  };

  return (
    <div className="template-library-page">
      <header className="template-library-page__header">
        <div className="template-library-page__header-inner">
          <button type="button" className="template-library-page__btn" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            返回工作台
          </button>

          <div className="template-library-page__brand">
            <span>Template Library</span>
            <h1>模板库</h1>
          </div>

          <form className="template-library-page__search" onSubmit={handleRAGSearch}>
            <Search className="h-4 w-4 shrink-0 text-[var(--editorial-text-gray)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索：小红书咖啡 / 新品发布 / 高级感视觉"
            />
            <button type="submit" disabled={loading}>
              {loading ? '搜索中' : '搜索'}
            </button>
          </form>

          <div className="template-library-page__actions">
            {onOpenAssetsLibrary ? (
              <button type="button" className="template-library-page__btn template-library-page__btn--primary" onClick={onOpenAssetsLibrary}>
                <Library className="h-4 w-4" />
                从资产库发布
                <ArrowUpRight className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="template-library-page__chips">
          {SCENE_CHIPS.map((chip) => (
            <button key={chip} type="button" onClick={() => setSearchQuery(chip)}>
              {chip}
            </button>
          ))}
          {isRagActive ? (
            <button type="button" onClick={() => void resetSearch()}>
              显示全部
            </button>
          ) : null}
        </div>
      </header>

      <main className="template-library-page__main">
        <div className="template-library-page__inner">
          <div className="template-library-page__meta">
            <span>{isRagActive ? '按语义相似度排序' : '点击卡片查看详情 · 支持关注作者与收藏'}</span>
            <span>{communityItems.length} 个模板</span>
          </div>

          {communityItems.length === 0 ? (
            <section className="template-library-page__empty">
              <Sparkles className="h-8 w-8" />
              <h2>模板库还没有内容</h2>
              <p>在资产库选择产出并发布到模板库，发布时可附上作者留言。</p>
              {onOpenAssetsLibrary ? (
                <button type="button" className="template-library-page__btn template-library-page__btn--primary" onClick={onOpenAssetsLibrary}>
                  <Library className="h-4 w-4" />
                  打开资产库发布
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              ) : null}
            </section>
          ) : (
            <section className="template-xhs-masonry" aria-label="模板瀑布流">
              {communityItems.map((item, index) => (
                <div key={item.id} className="template-xhs-masonry__item">
                  <TemplateMasonryCard
                    item={item}
                    index={index}
                    isFollowing={isFollowing(item.username)}
                    isCollected={isCollected(item.id)}
                    onOpen={openItem}
                    onLike={handleLike}
                    onReport={handleReport}
                    onToggleFollow={onToggleFollow}
                    onToggleCollect={(id) => {
                      const wasCollected = isCollected(id);
                      toggleCollect(id);
                      triggerToast(wasCollected ? '已取消收藏' : '已收藏模板', 'info');
                    }}
                    onOpenProfile={onOpenProfile}
                  />
                </div>
              ))}
            </section>
          )}
        </div>
      </main>

      {detailItem ? (
        <TemplateDetailModal
          item={detailItem}
          currentUsername={username}
          isFollowing={isFollowing(detailItem.username)}
          isCollected={isCollected(detailItem.id)}
          onClose={closeItem}
          onLike={handleLike}
          onReport={handleReport}
          onToggleFollow={onToggleFollow}
          onToggleCollect={(id) => {
            const wasCollected = isCollected(id);
            toggleCollect(id);
            triggerToast(wasCollected ? '已取消收藏' : '已收藏模板', 'info');
          }}
          onOpenProfile={onOpenProfile}
        />
      ) : null}
    </div>
  );
}
