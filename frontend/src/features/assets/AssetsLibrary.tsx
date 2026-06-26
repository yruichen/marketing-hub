import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { AssetFilter } from './AssetFilter';
import { AssetGroup } from './AssetGroup';
import { AssetPreviewModal } from './AssetPreviewModal';
import { AssetFormDialog } from './AssetFormDialog';
import { Pagination } from './Pagination';
import { useAssets } from './useAssets';
import { useAssetGroups } from './useAssetGroups';
import type { AssetFilterState, AssetsLibraryProps } from './types';
import type { AssetRecord } from '../../types/workspace';
import './assets.css';

const DEFAULT_FILTER: AssetFilterState = { type: 'all', source: 'all', preview: 'all', search: '' };
const PAGE_SIZE = 60;
const EMPTY_ASSETS: AssetRecord[] = [];

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

  const items = data?.items ?? EMPTY_ASSETS;
  const total = data?.total ?? 0;
  const typeCounts = data?.type_counts;
  const sourceCounts = data?.source_counts;
  const previewCounts = data?.preview_counts;
  const { groups } = useAssetGroups(items);
  const [timestamp, setTimestamp] = useState(() => Date.now());

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setTimestamp(Date.now());
    }, 0);
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
            按工作流运行、生成来源和预览可用性整理产物；点击卡片进入预览和溯源。
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
            <strong>{sourceCounts?.workflow ?? 0}</strong>
            <span>工作流</span>
          </div>
          <div>
            <strong>{previewCounts?.with_file ?? 0}</strong>
            <span>可预览</span>
          </div>
          <div>
            <strong>{previewCounts?.records_only ?? 0}</strong>
            <span>仅记录</span>
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
        sourceCounts={sourceCounts}
        previewCounts={previewCounts}
        total={total}
      />

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
