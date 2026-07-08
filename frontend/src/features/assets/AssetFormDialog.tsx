import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { AssetRecord, AssetType } from '../../types/workspace';
import type { AssetCreateInput, AssetUpdateInput } from './useAssets';

interface AssetFormDialogProps {
  open: boolean;
  initial: AssetRecord | null; // null = 新建模式
  onClose: () => void;
  onSave: (input: AssetCreateInput | AssetUpdateInput) => Promise<unknown>;
}

const ASSET_TYPE_OPTIONS: AssetType[] = ['image', 'audio', 'video', 'document'];

/**
 * 新建 / 编辑同一个表单：
 *   - 字段：title / asset_type / source_url / tags（逗号分隔输入）
 *   - initial 非空 → 编辑模式（id 自动走 PATCH）
 *   - initial 为空 → 新建模式（走 POST）
 *
 * 状态完全本地，外部只关心 onSave 回调结果。
 */
export function AssetFormDialog({ open, initial, onClose, onSave }: AssetFormDialogProps) {
  const [title, setTitle] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('document');
  const [sourceUrl, setSourceUrl] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [format, setFormat] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    // dialog 重新打开时把表单 state 同步回 initial，符合 effect 语义。
    /* eslint-disable react-hooks/set-state-in-effect */
    setTitle(initial?.title || '');
    setAssetType(initial?.asset_type || 'document');
    setSourceUrl(initial?.source_url || '');
    setTagsText((initial?.tags || []).join(', '));
    setFormat(typeof initial?.metadata?.format === 'string' ? initial.metadata.format : '');
    setRightsConfirmed(Boolean(initial?.metadata?.rights_confirmed_at));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, initial]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    const tags = tagsText.split(',').map((s) => s.trim()).filter(Boolean);
    const metadata: Record<string, unknown> = { ...(initial?.metadata || {}) };
    if (format.trim()) metadata.format = format.trim();
    if (!format.trim()) delete metadata.format;
    if (!initial && rightsConfirmed) {
      metadata.license_status = 'user_confirmed';
      metadata.rights_confirmed_at = new Date().toISOString();
    }

    if (initial) {
      await onSave({
        title: title.trim(),
        asset_type: assetType,
        source_url: sourceUrl.trim(),
        tags,
        metadata,
      });
    } else {
      await onSave({
        title: title.trim(),
        asset_type: assetType,
        source_url: sourceUrl.trim(),
        tags,
        metadata,
        rights_confirmed: rightsConfirmed,
      });
    }
    setSubmitting(false);
    onClose();
  };

  return (
    <div
      className="assets-preview__backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? '编辑资产' : '新建资产'}
      onClick={onClose}
    >
      <form
        className="assets-form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className="assets-form__header">
          <h3 className="assets-form__title">{initial ? '编辑资产' : '新建资产'}</h3>
          <button type="button" onClick={onClose} className="assets-form__close" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="assets-form__body">
          <label className="assets-form__field">
            <span className="assets-form__label">标题 *</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="assets-form__input"
              required
              maxLength={255}
              autoFocus
            />
          </label>

          <label className="assets-form__field">
            <span className="assets-form__label">类型</span>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetType)}
              className="assets-form__input"
            >
              {ASSET_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <label className="assets-form__field">
            <span className="assets-form__label">资源 URL</span>
            <input
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className="assets-form__input"
              placeholder="https://… 或本地路径"
            />
          </label>

          <label className="assets-form__field">
            <span className="assets-form__label">格式（文档可选 json/md/txt/csv/html）</span>
            <input
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="assets-form__input"
              placeholder="留空时自动从 URL 推"
            />
          </label>

          <label className="assets-form__field">
            <span className="assets-form__label">标签（逗号分隔）</span>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              className="assets-form__input"
              placeholder="如：春季, 种草, 短视频"
            />
          </label>
          {!initial ? (
            <label className="flex items-start gap-2 text-[11px] font-bold leading-5 text-[var(--editorial-text-muted)]">
              <input
                type="checkbox"
                checked={rightsConfirmed}
                onChange={(e) => setRightsConfirmed(e.target.checked)}
                className="mt-1"
              />
              <span>我确认对该素材拥有权利或已取得上传、编辑和在工作区内使用的授权。</span>
            </label>
          ) : null}
        </div>

        <footer className="assets-form__footer">
          <button type="button" onClick={onClose} className="assets-form__btn">取消</button>
          <button
            type="submit"
            disabled={submitting || !title.trim() || (!initial && !rightsConfirmed)}
            className="assets-form__btn assets-form__btn--primary"
          >
            {submitting ? '保存中…' : initial ? '保存修改' : '创建'}
          </button>
        </footer>
      </form>
    </div>
  );
}
