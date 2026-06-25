import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, ExternalLink, X } from 'lucide-react';
import type { AssetRecord } from '../../types/workspace';
import { getAssetPalette } from './assetVisuals';
import { assetTaskType, formatAssetPreviewText } from './assetContent';

interface AssetPreviewModalProps {
  asset: AssetRecord;
  onClose: () => void;
}

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
};

/**
 * 全屏预览弹窗：图片放大、文本高亮、音频视频 controls。
 * 多色配色与 AssetCard 一致（用同一份 assetVisuals 矩阵）。
 * 点击遮罩 / Esc / X 关闭。
 */
export function AssetPreviewModal({ asset, onClose }: AssetPreviewModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<'title' | 'url' | null>(null);
  const palette = getAssetPalette(asset);
  const Icon = palette.icon;
  const taskType = assetTaskType(asset);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = () => {
    if (!asset.source_url) return;
    const a = document.createElement('a');
    a.href = asset.source_url;
    a.download = asset.title || `asset-${asset.id}`;
    a.target = '_blank';
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copy = async (text: string, field: 'title' | 'url') => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(field);
      window.setTimeout(() => setCopied(null), 1400);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div
      className="assets-preview__backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`预览 ${asset.title}`}
      onClick={onClose}
    >
      <div
        className="assets-preview"
        onClick={(e) => e.stopPropagation()}
        style={{
          ['--asset-bg' as string]: `var(${palette.cssVar}-bg, ${palette.fallbackBg})`,
          ['--asset-fg' as string]: `var(${palette.cssVar}-fg, ${palette.fallbackFg})`,
        }}
      >
        <header className="assets-preview__header">
          <div className="assets-preview__meta">
            <span className="assets-preview__type" style={{ background: 'var(--asset-fg)', color: 'var(--asset-bg)' }}>
              {palette.formatLabel || asset.asset_type}
            </span>
            <div className="assets-preview__title-stack">
              <h3 className="assets-preview__title">{asset.title}</h3>
              <span className="assets-preview__date">{taskType} / {formatDate(asset.created_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {asset.source_url ? (
              <a
                href={asset.source_url}
                target="_blank"
                rel="noreferrer"
                className="assets-preview__download"
                title="打开源文件"
                aria-label="打开源文件"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={download}
              disabled={!asset.source_url}
              className="assets-preview__download"
              title="下载"
              aria-label="下载"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="assets-preview__close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="assets-preview__content">
          <div className="assets-preview__body" style={{ background: 'var(--asset-bg)', color: 'var(--asset-fg)' }}>
            {asset.asset_type === 'image' && asset.source_url ? (
              <img src={asset.source_url} alt={asset.title} className="assets-preview__image" />
            ) : null}

            {asset.asset_type === 'audio' && asset.source_url ? (
              <div className="assets-preview__player">
                <Icon className="h-16 w-16" strokeWidth={1.2} />
                <audio controls src={asset.source_url} className="assets-preview__audio">
                  <track kind="captions" />
                </audio>
              </div>
            ) : null}

            {asset.asset_type === 'video' && asset.source_url ? (
              <video controls src={asset.source_url} className="assets-preview__video">
                <track kind="captions" />
              </video>
            ) : null}

            {asset.asset_type === 'document' || (!asset.source_url && asset.asset_type !== 'image' && asset.asset_type !== 'audio' && asset.asset_type !== 'video') ? (
              <div className="assets-preview__doc-placeholder">
                <Icon className="h-16 w-16" strokeWidth={1.2} />
                <pre className="assets-preview__text">{formatAssetPreviewText(asset)}</pre>
              </div>
            ) : null}

            {!asset.source_url && asset.asset_type !== 'document' ? (
              <p className="assets-preview__empty">该资产没有可预览的源文件，但可以在右侧查看记录详情。</p>
            ) : null}
          </div>

          <aside className="assets-preview__aside">
            <div>
              <span className="assets-preview__aside-label">标题</span>
              <p className="assets-preview__aside-title">{asset.title}</p>
            </div>
            <div className="assets-preview__detail-grid">
              <div><span>类型</span><strong>{palette.formatLabel || asset.asset_type}</strong></div>
              <div><span>来源</span><strong>{taskType}</strong></div>
              <div><span>创建</span><strong>{formatDate(asset.created_at)}</strong></div>
              <div><span>ID</span><strong>#{asset.id}</strong></div>
            </div>
            {asset.source_url ? (
              <div>
                <span className="assets-preview__aside-label">源文件</span>
                <p className="assets-preview__url">{asset.source_url}</p>
              </div>
            ) : null}
            <div className="assets-preview__quick-actions">
              <button type="button" onClick={() => copy(asset.title, 'title')}>
                {copied === 'title' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                复制标题
              </button>
              <button type="button" onClick={() => copy(asset.source_url, 'url')} disabled={!asset.source_url}>
                {copied === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                复制链接
              </button>
            </div>
          </aside>
        </div>

        {asset.tags.length > 0 ? (
          <footer className="assets-preview__tags">
            {asset.tags.map((tag) => (
              <span key={tag} className="assets-preview__tag">{tag}</span>
            ))}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
