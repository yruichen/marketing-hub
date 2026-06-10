import { useEffect, useState } from 'react';
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
  const { groups } = useAssetGroups(items);
  const typeCounts = data?.type_counts;

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
          <h2 className="assets-library__title">资产库</h2>
          <p className="assets-library__subtitle">
            共享资源库：文案、图片、音频、视频、智能体输出都集中在这里。
          </p>
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
          还没有资产。运行工作流或生成内容后，资产会自动沉淀到这里。
        </div>
      ) : (
        <div className="asset-groups">
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
