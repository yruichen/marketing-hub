import { useState } from 'react';
import { Check, Copy, Download, ExternalLink, FileText, Pencil, Play, Trash2 } from 'lucide-react';
import type { AssetRecord } from '../../types/workspace';
import { getAssetPalette } from './assetVisuals';
import { assetTaskType, getAssetSummary } from './assetContent';

interface AssetCardProps {
  asset: AssetRecord;
  onPreview: (asset: AssetRecord) => void;
  onEdit?: (asset: AssetRecord) => void;
  onDelete?: (asset: AssetRecord) => void;
}

/**
 * 单个资产卡片：
 *   - 缩略图：image 直接 <img>，其它走 assetVisuals 矩阵配色 + 文档扩展名图标
 *   - 操作：预览 / 编辑 / 删除 / 复制 / 下载
 *   - 复制：写 clipboard.toast；下载：触发 <a download>
 */
export function AssetCard({ asset, onPreview, onEdit, onDelete }: AssetCardProps) {
  const [copiedField, setCopiedField] = useState<'url' | 'title' | null>(null);
  const palette = getAssetPalette(asset);
  const Icon = palette.icon;
  const taskType = assetTaskType(asset);
  const summary = getAssetSummary(asset);
  const dateLabel = formatAssetDate(asset.created_at);

  const copy = async (text: string, field: 'url' | 'title') => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // 忽略剪贴板拒绝
    }
  };

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

  const downloadAsText = () => {
    const blob = new Blob([asset.title], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${asset.title || `asset-${asset.id}`}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const showDownload = asset.source_url || asset.asset_type === 'document';

  return (
    <article
      className={`asset-card asset-card--${asset.asset_type}`}
      style={{
        ['--asset-bg' as string]: `var(${palette.cssVar}-bg, ${palette.fallbackBg})`,
        ['--asset-fg' as string]: `var(${palette.cssVar}-fg, ${palette.fallbackFg})`,
      }}
    >
      <button type="button" className="asset-card__open-zone" onClick={() => onPreview(asset)}>
        <div
          className="asset-card__media"
          style={{ background: 'var(--asset-bg)', color: 'var(--asset-fg)' }}
        >
          {asset.asset_type === 'image' && asset.source_url ? (
            <img src={asset.source_url} alt={asset.title} loading="lazy" />
          ) : asset.asset_type === 'audio' ? (
            <div className="asset-card__audio-preview">
              <Icon className="h-9 w-9" strokeWidth={1.4} />
              <div className="asset-card__wave" aria-hidden="true">
                {Array.from({ length: 18 }).map((_, idx) => (
                  <span key={idx} style={{ height: `${18 + ((idx * 11) % 42)}%` }} />
                ))}
              </div>
            </div>
          ) : asset.asset_type === 'video' ? (
            <div className="asset-card__video-preview">
              <div className="asset-card__play">
                <Play className="h-5 w-5" fill="currentColor" />
              </div>
              <Icon className="h-12 w-12" strokeWidth={1.2} />
            </div>
          ) : (
            <div className="asset-card__document-preview">
              <FileText className="h-8 w-8" strokeWidth={1.4} />
              <p>{summary}</p>
            </div>
          )}

          <span className="asset-card__type">
            {palette.formatLabel || asset.asset_type}
          </span>
          <span className="asset-card__open-hint">
            打开预览 <ExternalLink className="h-3 w-3" />
          </span>
        </div>

        <div className="asset-card__body">
          <div className="asset-card__meta-row">
            <span>{taskType}</span>
            <span>{dateLabel}</span>
          </div>
          <h4 className="asset-card__title" title={asset.title}>{asset.title}</h4>
          <p className="asset-card__summary">{summary}</p>
        </div>
      </button>

      <div className="asset-card__footer">
        {asset.tags.length > 0 ? (
          <div className="asset-card__tags">
            {asset.tags.slice(0, 3).map((t) => (
              <span key={t} className="asset-card__tag">{t}</span>
            ))}
            {asset.tags.length > 3 ? <span className="asset-card__tag">+{asset.tags.length - 3}</span> : null}
          </div>
        ) : null}
        <div className="asset-card__actions">
        {onEdit ? (
          <button type="button" onClick={() => onEdit(asset)} title="编辑" aria-label="编辑">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => copy(asset.source_url || asset.title, 'url')}
          title="复制链接"
          aria-label="复制链接"
          disabled={!asset.source_url}
        >
          {copiedField === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={asset.source_url ? download : downloadAsText}
          title="下载"
          aria-label="下载"
          disabled={!showDownload}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        {onDelete ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`删除「${asset.title}」？此操作不可撤销。`)) onDelete(asset);
            }}
            title="删除"
            aria-label="删除"
            className="asset-card__action--danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
        </div>
      </div>
    </article>
  );
}

function formatAssetDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
