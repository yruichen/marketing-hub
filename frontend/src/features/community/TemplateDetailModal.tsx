import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bookmark,
  Heart,
  MessageCircle,
  Share2,
  UserPlus,
  X,
} from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import type { CreatorProfile } from '../profile/useProfile';
import type { CommunityItem } from './types';
import { TemplateVisual } from './TemplateVisual';
import { creatorNoteFromItem } from './useTemplateSocial';
import { templateSummary } from './templateContent';
import { formatTemplateDetailBody } from './templateDetailContent';

interface TemplateDetailModalProps {
  item: CommunityItem;
  currentUsername?: string | null;
  isFollowing: boolean;
  isCollected: boolean;
  onClose: () => void;
  onLike: (id: number) => void;
  onReport: (id: number) => void;
  onToggleFollow: (username: string) => void;
  onToggleCollect: (templateId: number) => void;
  onOpenProfile?: (username: string) => void;
}

export function TemplateDetailModal({
  item,
  currentUsername,
  isFollowing,
  isCollected,
  onClose,
  onLike,
  onReport,
  onToggleFollow,
  onToggleCollect,
  onOpenProfile,
}: TemplateDetailModalProps) {
  const [authorProfile, setAuthorProfile] = useState<CreatorProfile | null>(null);
  const creatorNote = creatorNoteFromItem(item.metadata);
  const initial = (item.username || '?').slice(0, 1).toUpperCase();
  const isSelf = item.username === currentUsername;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void apiFetch(`/profiles/${encodeURIComponent(item.username)}/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.profile) setAuthorProfile(data.profile as CreatorProfile);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [item.username]);

  const handleShare = async () => {
    const url = `${window.location.origin}/templates?open=${item.id}`;
    try {
      await navigator.clipboard?.writeText(url);
    } catch {
      // ignore
    }
  };

  return createPortal(
    <div className="template-detail__backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="template-detail" onClick={(e) => e.stopPropagation()}>
        <header className="template-detail__header">
          <button type="button" className="template-detail__close" onClick={onClose} aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
          <div className="template-detail__author-block">
            <button type="button" className="template-detail__author" onClick={() => onOpenProfile?.(item.username)}>
              <span className="template-detail__avatar">{initial}</span>
              <div>
                <strong>{authorProfile?.display_name || item.username}</strong>
                <span>@{item.username}</span>
              </div>
            </button>
            {!isSelf ? (
              <button
                type="button"
                className={`template-detail__follow ${isFollowing ? 'is-following' : ''}`}
                onClick={() => onToggleFollow(item.username)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                {isFollowing ? '已关注' : '关注'}
              </button>
            ) : null}
          </div>
        </header>

        <div className="template-detail__scroll">
          <div className="template-detail__visual">
            <TemplateVisual item={item} tone="tall" />
          </div>

          <div className="template-detail__content">
            <div className="template-detail__meta-row">
              <span>{item.creation_type_display}</span>
              {item.ai_generated ? <span>AI 生成</span> : null}
              <span>{item.created_at}</span>
            </div>
            <h2>{item.title}</h2>
            <p className="template-detail__summary">{templateSummary(item)}</p>
            <pre className="template-detail__body">{formatTemplateDetailBody(item)}</pre>

            {(creatorNote || authorProfile?.bio) ? (
              <section className="template-detail__note">
                <div className="template-detail__note-title">
                  <MessageCircle className="h-4 w-4" />
                  作者留言
                </div>
                {creatorNote ? <p>{creatorNote}</p> : null}
                {!creatorNote && authorProfile?.bio ? <p>{authorProfile.bio}</p> : null}
                {authorProfile?.headline ? (
                  <span className="template-detail__headline">{authorProfile.headline}</span>
                ) : null}
              </section>
            ) : null}

            {item.tags && item.tags.length > 0 ? (
              <div className="template-detail__tags">
                {item.tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            ) : null}
          </div>
        </div>

        <footer className="template-detail__footer">
          <button type="button" onClick={() => onLike(item.id)}>
            <Heart className="h-4 w-4" />
            {item.likes}
          </button>
          <button
            type="button"
            className={isCollected ? 'is-active' : ''}
            onClick={() => onToggleCollect(item.id)}
          >
            <Bookmark className="h-4 w-4" />
            {isCollected ? '已收藏' : '收藏'}
          </button>
          <button type="button" onClick={() => void handleShare()}>
            <Share2 className="h-4 w-4" />
            复制链接
          </button>
          <button type="button" onClick={() => onReport(item.id)}>
            举报
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
