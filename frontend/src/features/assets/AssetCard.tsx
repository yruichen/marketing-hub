import { useState } from 'react';
import { Check, Copy, Download, Eye, Pencil, Trash2 } from 'lucide-react';
import type { AssetRecord } from '../../types/workspace';
import { getAssetPalette, detectDocFormat } from './assetVisuals';

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
      className="asset-card"
      style={{
        ['--asset-bg' as string]: `var(${palette.cssVar}-bg, ${palette.fallbackBg})`,
        ['--asset-fg' as string]: `var(${palette.cssVar}-fg, ${palette.fallbackFg})`,
      }}
    >
      <div
        className="asset-card__media"
        onClick={() => onPreview(asset)}
        role="button"
        tabIndex={0}
        style={{ background: 'var(--asset-bg)', color: 'var(--asset-fg)' }}
      >
        {asset.asset_type === 'image' && asset.source_url ? (
          <img src={asset.source_url} alt={asset.title} loading="lazy" />
        ) : (
          <div className="asset-card__placeholder">
            <Icon className="h-12 w-12" strokeWidth={1.4} />
            <span className="asset-card__placeholder-label">
              {palette.formatLabel || asset.asset_type}
            </span>
            {asset.source_url ? (
              <span className="asset-card__placeholder-url">{truncateUrl(asset.source_url)}</span>
            ) : (
              <span className="asset-card__placeholder-url">
                {asset.asset_type === 'document'
                  ? detectDocFormat(asset.source_url)
                    ? `.${detectDocFormat(asset.source_url)}`
                    : '（无 URL）'
                  : '（无 URL）'}
              </span>
            )}
          </div>
        )}

        <span className="asset-card__type">
          {palette.formatLabel || asset.asset_type}
        </span>
      </div>

      <div className="asset-card__body">
        <h4 className="asset-card__title" title={asset.title}>{asset.title}</h4>
        {asset.tags.length > 0 ? (
          <div className="asset-card__tags">
            {asset.tags.slice(0, 3).map((t) => (
              <span key={t} className="asset-card__tag">{t}</span>
            ))}
            {asset.tags.length > 3 ? <span className="asset-card__tag">+{asset.tags.length - 3}</span> : null}
          </div>
        ) : null}
      </div>

      <div className="asset-card__actions">
        <button type="button" onClick={() => onPreview(asset)} title="预览" aria-label="预览">
          <Eye className="h-3.5 w-3.5" />
        </button>
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
          disabled={!asset.source_url && asset.asset_type === 'document'}
        >
          {copiedField === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => copy(asset.title, 'title')}
          title="复制标题"
          aria-label="复制标题"
        >
          {copiedField === 'title' ? <Check className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
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
    </article>
  );
}

function truncateUrl(url: string, max = 36): string {
  if (url.length <= max) return url;
  return url.slice(0, max - 3) + '...';
}
