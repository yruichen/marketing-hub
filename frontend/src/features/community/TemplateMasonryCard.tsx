import { Bookmark, Heart, MessageCircle, UserPlus } from 'lucide-react';
import type { CommunityItem } from './types';
import { templateSummary, templateVisualTone } from './templateContent';
import { TemplateVisual } from './TemplateVisual';
import { creatorNoteFromItem } from './useTemplateSocial';

interface TemplateMasonryCardProps {
  item: CommunityItem;
  index: number;
  isFollowing?: boolean;
  isCollected?: boolean;
  onOpen: (item: CommunityItem) => void;
  onLike: (id: number) => void;
  onReport: (id: number) => void;
  onToggleFollow?: (username: string) => void;
  onToggleCollect?: (templateId: number) => void;
  onOpenProfile?: (username: string) => void;
}

export function TemplateMasonryCard({
  item,
  index,
  isFollowing = false,
  isCollected = false,
  onOpen,
  onLike,
  onReport,
  onToggleFollow,
  onToggleCollect,
  onOpenProfile,
}: TemplateMasonryCardProps) {
  const tone = templateVisualTone(item, index);
  const summary = templateSummary(item);
  const creatorNote = creatorNoteFromItem(item.metadata);
  const initial = (item.username || '?').slice(0, 1).toUpperCase();

  return (
    <article className="template-xhs-card">
      <button type="button" className="template-xhs-card__open" onClick={() => onOpen(item)}>
        <TemplateVisual item={item} tone={tone} />
        <div className="template-xhs-card__body">
          <h3 className="template-xhs-card__title">{item.title}</h3>
          <p className="template-xhs-card__summary">{summary}</p>
          {creatorNote ? (
            <p className="template-xhs-card__note">
              <MessageCircle className="h-3 w-3 inline mr-1" />
              {creatorNote}
            </p>
          ) : null}
          <div className="template-xhs-card__tags">
            <span>{item.creation_type_display}</span>
            {item.ai_generated ? <span>AI</span> : null}
            {isCollected ? <span>已收藏</span> : null}
          </div>
        </div>
      </button>
      <footer className="template-xhs-card__footer">
        <button type="button" className="template-xhs-card__author" onClick={() => onOpenProfile?.(item.username)}>
          <span className="template-xhs-card__avatar">{initial}</span>
          <span>{item.username}</span>
        </button>
        <div className="template-xhs-card__actions">
          {onToggleFollow ? (
            <button
              type="button"
              className={`template-xhs-card__follow ${isFollowing ? 'is-following' : ''}`}
              onClick={() => onToggleFollow(item.username)}
              aria-label={isFollowing ? '已关注' : '关注作者'}
            >
              <UserPlus className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onToggleCollect ? (
            <button
              type="button"
              className={isCollected ? 'is-active' : ''}
              onClick={() => onToggleCollect(item.id)}
              aria-label={isCollected ? '已收藏' : '收藏'}
            >
              <Bookmark className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button type="button" onClick={() => onLike(item.id)} aria-label="点赞">
            <Heart className="h-3.5 w-3.5" />
            {item.likes}
          </button>
          <button type="button" onClick={() => onReport(item.id)} aria-label="举报">
            举报
          </button>
        </div>
      </footer>
    </article>
  );
}
