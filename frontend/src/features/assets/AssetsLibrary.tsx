import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, FolderOpen, Move, Plus, RefreshCw, Share2, X } from 'lucide-react';
import { AssetFilter } from './AssetFilter';
import { AssetGroup } from './AssetGroup';
import { AssetPreviewModal } from './AssetPreviewModal';
import { AssetFormDialog } from './AssetFormDialog';
import { Pagination } from './Pagination';
import { useAssets } from './useAssets';
import { useAssetGroups } from './useAssetGroups';
import type { AssetFilterState, AssetsLibraryProps } from './types';
import type { AssetRecord } from '../../types/workspace';
import { apiFetch } from '../../hooks/useApi';
import './assets.css';

const DEFAULT_FILTER: AssetFilterState = { type: 'all', source: 'all', preview: 'all', search: '' };
const PAGE_SIZE = 60;
const EMPTY_ASSETS: AssetRecord[] = [];

type DialogState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; asset: AssetRecord };

export function AssetsLibrary({
  organizationSlug,
  onOpenTemplateLibrary,
  onPublishAsset,
}: AssetsLibraryProps) {
  const [filter, setFilter] = useState<AssetFilterState>(DEFAULT_FILTER);
  const { data, loading, error, page, setPage, refresh, createAsset, updateAsset, deleteAsset } =
    useAssets(organizationSlug, filter, PAGE_SIZE);
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('mh:assets-updated', handler);
    return () => window.removeEventListener('mh:assets-updated', handler);
  }, [refresh]);

  const items = data?.items ?? EMPTY_ASSETS;
  const total = data?.total ?? 0;
  const typeCounts = data?.type_counts;
  const sourceCounts = data?.source_counts;
  const previewCounts = data?.preview_counts;
  const { groups } = useAssetGroups(items);
  const [timestamp, setTimestamp] = useState(() => Date.now());

  useEffect(() => {
    const timeout = window.setTimeout(() => setTimestamp(Date.now()), 0);
    return () => window.clearTimeout(timeout);
  }, [items]);

  const recentCount = useMemo(() => {
    const sevenDaysAgo = timestamp - 1000 * 60 * 60 * 24 * 7;
    return items.filter((asset) => {
      const created = new Date(asset.created_at).getTime();
      return Number.isFinite(created) && created >= sevenDaysAgo;
    }).length;
  }, [items, timestamp]);

  const handleFilterChange = (next: AssetFilterState) => {
    setFilter(next);
    setPage(1);
    setSelectedIds([]);
  };

  const handleSaveDialog = async (input: Parameters<typeof createAsset>[0] | Parameters<typeof updateAsset>[1]) => {
    if (dialog.mode === 'create') await createAsset(input as Parameters<typeof createAsset>[0]);
    else if (dialog.mode === 'edit') await updateAsset(dialog.asset.id, input as Parameters<typeof updateAsset>[1]);
    setDialog({ mode: 'closed' });
  };

  const handleDelete = async (asset: AssetRecord) => {
    await deleteAsset(asset.id);
    if (previewAsset?.id === asset.id) setPreviewAsset(null);
    setSelectedIds((prev) => prev.filter((id) => id !== asset.id));
  };

  const [publishingId, setPublishingId] = useState<number | null>(null);

  const handlePublish = useCallback(async (asset: AssetRecord) => {
    if (!onPublishAsset) return;
    setPublishingId(asset.id);
    try {
      await onPublishAsset(asset);
    } finally {
      setPublishingId(null);
    }
  }, [onPublishAsset]);

  const handleBatchPublish = async () => {
    if (!onPublishAsset || selectedIds.length === 0) return;
    for (const id of selectedIds) {
      const asset = items.find((item) => item.id === id);
      if (asset) {
        const ok = await onPublishAsset(asset);
        if (!ok) break;
      }
    }
    setSelectedIds([]);
    setSelectMode(false);
  };

  const toggleSelect = useCallback((assetId: number) => {
    setSelectedIds((prev) => prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]);
  }, []);

  const handleSelectAll = () => {
    if (selectedIds.length === items.length) setSelectedIds([]);
    else setSelectedIds(items.map((a) => a.id));
  };

  const handleMoveToFolder = async (folderId: number) => {
    try {
      const res = await apiFetch('/workspace/assets/batch/', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds, folder_id: folderId }),
      });
      if (res.ok) {
        setSelectedIds([]);
        setShowMoveDialog(false);
        refresh();
      }
    } catch (err) {
      console.error('Move failed', err);
    }
  };

  return (
    <section className="assets-library">
      <header className="assets-library__header">
        <div>
          <span className="assets-library__eyebrow">Brand asset wall</span>
          <h2 className="assets-library__title">资产库</h2>
          <p className="assets-library__subtitle">
            按工作流运行、生成来源整理产出；保存后可一键发布到模板库（社区），供团队复用。
          </p>
        </div>
        <div className="assets-library__stats" aria-label="资产统计">
          <div><strong>{total}</strong><span>总资产</span></div>
          <div><strong>{recentCount}</strong><span>近 7 天</span></div>
          <div><strong>{sourceCounts?.workflow ?? 0}</strong><span>工作流</span></div>
          <div><strong>{previewCounts?.with_file ?? 0}</strong><span>可预览</span></div>
          <div><strong>{previewCounts?.records_only ?? 0}</strong><span>仅记录</span></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenTemplateLibrary ? (
            <button
              type="button"
              onClick={onOpenTemplateLibrary}
              className="assets-library__template-cta"
              title="前往模板库浏览已发布模板"
            >
              <span>前往模板库</span>
              <ArrowUpRight className="h-4 w-4" />
            </button>
          ) : null}
          <button type="button" onClick={refresh} className="assets-library__refresh" title="刷新" aria-label="刷新">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={() => setSelectMode((v) => !v)} className={`assets-library__refresh ${selectMode ? 'is-active' : ''}`} title={selectMode ? '退出选择' : '选择资产'}>
            <Check className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setDialog({ mode: 'create' })} className="assets-library__new" title="新建资产">
            <Plus className="h-3.5 w-3.5" />新建资产
          </button>
        </div>
      </header>

      <AssetFilter filter={filter} onChange={handleFilterChange}
        typeCounts={typeCounts} sourceCounts={sourceCounts} previewCounts={previewCounts} total={total} />

      {selectMode && (
        <div className="flex items-center gap-3 px-1 py-2 text-[10px] font-black text-[var(--editorial-text-gray)]">
          <button type="button" onClick={handleSelectAll} className="border border-[var(--border-subtle)] px-2 py-1 rounded hover:bg-[var(--surface-hover)]">
            {selectedIds.length === items.length ? '取消全选' : '全选'}
          </button>
          <span>{selectedIds.length} / {items.length} 个已选</span>
          {selectedIds.length > 0 && onPublishAsset && (
            <button type="button" onClick={() => void handleBatchPublish()} className="border border-[var(--brand-accent-strong)] bg-[var(--brand-accent)] px-2 py-1 rounded text-black hover:opacity-90">
              <Share2 className="h-3 w-3 inline mr-1" />发布到模板库
            </button>
          )}
          {selectedIds.length > 0 && (
            <button type="button" onClick={() => setShowMoveDialog(true)} className="border border-[var(--brand-accent-strong)] bg-[var(--brand-accent)] px-2 py-1 rounded text-black hover:opacity-90">
              <Move className="h-3 w-3 inline mr-1" />移动到文件夹
            </button>
          )}
          <button type="button" onClick={() => { setSelectedIds([]); setSelectMode(false); }} className="ml-auto border border-[var(--border-subtle)] px-2 py-1 rounded hover:bg-[var(--surface-hover)]">
            <X className="h-3 w-3 inline mr-1" />退出
          </button>
        </div>
      )}

      {error ? <div className="assets-library__error">{error}</div> : null}

      {items.length === 0 && !loading ? (
        <div className="assets-library__empty">
          <strong>还没有可用资产</strong>
          <span>运行工作流或生成内容后，文案、图片、音频、视频会自动沉淀到这里。</span>
        </div>
      ) : (
        <div className="assets-library__groups">
          {groups.map((group) => (
            <AssetGroup
              key={group.key}
              group={group}
              onPreview={setPreviewAsset}
              onEdit={(a) => setDialog({ mode: 'edit', asset: a })}
              onDelete={handleDelete}
              onPublish={onPublishAsset ? handlePublish : undefined}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />

      {previewAsset ? (
        <AssetPreviewModal
          asset={previewAsset}
          onClose={() => setPreviewAsset(null)}
          onPublish={onPublishAsset ? handlePublish : undefined}
          publishing={publishingId === previewAsset.id}
        />
      ) : null}

      {dialog.mode !== 'closed' ? (
        <AssetFormDialog open initial={dialog.mode === 'edit' ? dialog.asset : null} onClose={() => setDialog({ mode: 'closed' })} onSave={handleSaveDialog} />
      ) : null}

      {showMoveDialog && (
        <MoveToFolderDialog
          selectedCount={selectedIds.length}
          organizationSlug={organizationSlug || ''}
          onConfirm={handleMoveToFolder}
          onClose={() => setShowMoveDialog(false)}
        />
      )}
    </section>
  );
}

function MoveToFolderDialog({ selectedCount, organizationSlug, onConfirm, onClose }: {
  selectedCount: number;
  organizationSlug: string;
  onConfirm: (folderId: number) => void;
  onClose: () => void;
}) {
  const [folders, setFolders] = useState<Array<{ id: number; path: string }>>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    apiFetch(`/folders/?organization=${organizationSlug}`)
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setFolders(Array.isArray(data) ? data : []))
      .catch(() => setFolders([]));
  }, [organizationSlug]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-soft)] w-[400px]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-black mb-1">移动到文件夹</h3>
        <p className="text-[10px] text-[var(--editorial-text-gray)] mb-4">将 {selectedCount} 个资产移动到所选文件夹</p>
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {folders.map((f) => (
            <button key={f.id} type="button" onClick={() => setSelectedFolderId(f.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                selectedFolderId === f.id
                  ? 'border-[var(--brand-accent-strong)] bg-[var(--brand-accent-soft)]'
                  : 'border-transparent hover:bg-[var(--surface-hover)]'
              }`}>
              <FolderOpen className="h-3.5 w-3.5 inline mr-2" />{f.path}
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-3 py-2 text-[10px] font-black border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--surface-hover)]">取消</button>
          <button type="button" disabled={!selectedFolderId || moving} onClick={() => { setMoving(true); onConfirm(selectedFolderId!); }}
            className="px-3 py-2 text-[10px] font-black border border-[var(--brand-accent-strong)] bg-[var(--brand-accent)] rounded-lg disabled:opacity-40">
            {moving ? '移动中...' : '确认移动'}
          </button>
        </div>
      </div>
    </div>
  );
}
