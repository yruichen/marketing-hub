import { useEffect, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { AssetFilter } from './AssetFilter';
import { AssetCard } from './AssetCard';
import { AssetPreviewModal } from './AssetPreviewModal';
import { AssetFormDialog } from './AssetFormDialog';
import { Pagination } from './Pagination';
import { useAssets } from './useAssets';
import type { AssetFilterState, AssetsLibraryProps } from './types';
import type { AssetRecord } from '../../types/workspace';
import './assets.css';

const DEFAULT_FILTER: AssetFilterState = { type: 'all', search: '' };
const PAGE_SIZE = 60;

type DialogState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; asset: AssetRecord };

/**
 * 资产库主组件：
 *   - 顶部：标题 + 刷新 + 「新建资产」按钮
 *   - 筛选条（类型 chips + 搜索）
 *   - 5 个 group（按 metadata.task_type 分），每组可独立折叠
 *   - 底部：Pagination 页码
 *   - AssetFormDialog：新建 / 编辑共用
 *   - AssetPreviewModal：预览
 *   - 监听 mh:assets-updated 自动 refresh
 */
export function AssetsLibrary({ organizationSlug }: AssetsLibraryProps) {
  const [filter, setFilter] = useState<AssetFilterState>(DEFAULT_FILTER);
  const { data, loading, error, page, setPage, refresh, createAsset, updateAsset, deleteAsset } =
    useAssets(organizationSlug, filter, PAGE_SIZE);
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' });

  // 监听工作流运行完成事件，自动刷新
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('mh:assets-updated', handler);
    return () => window.removeEventListener('mh:assets-updated', handler);
  }, [refresh]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const typeCounts = data?.type_counts;
  const recentCount = items.filter((asset) => {
    const created = new Date(asset.created_at).getTime();
    return Number.isFinite(created) && Date.now() - created < 1000 * 60 * 60 * 24 * 7;
  }).length;

  const handleFilterChange = (next: AssetFilterState) => {
    setFilter(next);
    setPage(1);
  };

  const handleSaveDialog = async (
    input: Parameters<typeof createAsset>[0] | Parameters<typeof updateAsset>[1],
  ) => {
    if (dialog.mode === 'create') {
      await createAsset(input as Parameters<typeof createAsset>[0]);
    } else if (dialog.mode === 'edit') {
      await updateAsset(dialog.asset.id, input as Parameters<typeof updateAsset>[1]);
    }
    setDialog({ mode: 'closed' });
  };

  const handleDelete = async (asset: AssetRecord) => {
    await deleteAsset(asset.id);
    if (previewAsset?.id === asset.id) setPreviewAsset(null);
  };

  return (
    <section className="assets-library">
      <header className="assets-library__header">
        <div>
          <span className="assets-library__eyebrow">Brand asset wall</span>
          <h2 className="assets-library__title">资产库</h2>
          <p className="assets-library__subtitle">
            统一查看文案、图片、音频、视频和智能体沉淀；点击卡片即可进入沉浸预览。
          </p>
        </div>
        <div className="assets-library__stats" aria-label="资产统计">
          <div>
            <strong>{total}</strong>
            <span>总资产</span>
          </div>
          <div>
            <strong>{recentCount}</strong>
            <span>近 7 天</span>
          </div>
          <div>
            <strong>{typeCounts?.image ?? 0}</strong>
            <span>图片</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="assets-library__refresh"
            title="刷新"
            aria-label="刷新"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setDialog({ mode: 'create' })}
            className="assets-library__new"
            title="新建资产"
          >
            <Plus className="h-3.5 w-3.5" />
            新建资产
          </button>
        </div>
      </header>

      <AssetFilter
        filter={filter}
        onChange={handleFilterChange}
        typeCounts={typeCounts}
        total={total}
      />

      {error ? <div className="assets-library__error">{error}</div> : null}

      {items.length === 0 && !loading ? (
        <div className="assets-library__empty">
          <strong>还没有可用资产</strong>
          <span>运行工作流或生成内容后，文案、图片、音频、视频会自动沉淀到这里。</span>
        </div>
      ) : (
        <div className="assets-library__grid assets-library__grid--wall">
          {items.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onPreview={setPreviewAsset}
              onEdit={(a) => setDialog({ mode: 'edit', asset: a })}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />

      {previewAsset ? (
        <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} />
      ) : null}

      {dialog.mode !== 'closed' ? (
        <AssetFormDialog
          open
          initial={dialog.mode === 'edit' ? dialog.asset : null}
          onClose={() => setDialog({ mode: 'closed' })}
          onSave={handleSaveDialog}
        />
      ) : null}
    </section>
  );
}
