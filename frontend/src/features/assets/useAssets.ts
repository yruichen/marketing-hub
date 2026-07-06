import { useCallback, useEffect, useRef, useState } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../hooks/useApi';
import type { AssetRecord } from '../../types/workspace';
import type { AssetsListResponse, AssetFilterState } from './types';

interface UseAssetsResult {
  data: AssetsListResponse | null;
  loading: boolean;
  error: string | null;
  page: number;
  setPage: (next: number) => void;
  refresh: () => void;
  createAsset: (input: AssetCreateInput) => Promise<AssetRecord | null>;
  updateAsset: (id: number, patch: AssetUpdateInput) => Promise<AssetRecord | null>;
  deleteAsset: (id: number) => Promise<boolean>;
}

export interface AssetCreateInput {
  title: string;
  asset_type: AssetRecord['asset_type'];
  source_url?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  project_id?: number | null;
  campaign_id?: number | null;
  rights_confirmed?: boolean;
}

export type AssetUpdateInput = Partial<Omit<AssetCreateInput, 'project_id' | 'campaign_id'>> & {
  project_id?: number | null;
  campaign_id?: number | null;
};

/**
 * 组织级 assets 数据源（页码分页 + CRUD）：
 *   - 每次 page / filter / organization 变化自动拉一次
 *   - createAsset / updateAsset / deleteAsset 后立即 refresh
 */
export function useAssets(
  organizationSlug: string,
  filter: AssetFilterState,
  pageSize: number = 60,
): UseAssetsResult {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AssetsListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);

  const fetchPage = useCallback(
    async (pageToLoad: number) => {
      const params = new URLSearchParams({
        organization: organizationSlug,
        page: String(pageToLoad),
        page_size: String(pageSize),
      });
      if (filter.type !== 'all') params.set('asset_type', filter.type);
      if (filter.source !== 'all') params.set('source', filter.source);
      if (filter.preview === 'with_file') params.set('has_source', '1');
      if (filter.preview === 'records_only') params.set('has_source', '0');
      if (filter.search.trim()) params.set('search', filter.search.trim());
      params.set('unfiled', 'true');

      const query = params.toString();
      const requestKey = `/workspace/assets/?${query}`;
      if (inFlightKeyRef.current === requestKey) return;
      inFlightKeyRef.current = requestKey;

      setLoading(true);
      setError(null);
      try {
        const result = await apiGet<AssetsListResponse>(requestKey);
        setData(result);
      } catch {
        setError('资产加载失败');
      } finally {
        if (inFlightKeyRef.current === requestKey) {
          inFlightKeyRef.current = null;
        }
        setLoading(false);
      }
    },
    [organizationSlug, filter.type, filter.source, filter.preview, filter.search, pageSize],
  );

  // 筛选条件 / 页码变化 → 重新拉
  useEffect(() => {
    // 这里 effect 的目的是把 filter/page 变化 sync 到外部 fetch，符合 effect 语义。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPage(page);
  }, [fetchPage, page]);

  const refresh = useCallback(() => {
    void fetchPage(page);
  }, [fetchPage, page]);

  const createAsset = useCallback(
    async (input: AssetCreateInput): Promise<AssetRecord | null> => {
      try {
        const created = await apiPost<AssetRecord>(
          '/workspace/assets/',
          { organization: organizationSlug, ...input },
        );
        await fetchPage(page);
        return created;
      } catch {
        setError('创建资产失败');
        return null;
      }
    },
    [organizationSlug, page, fetchPage],
  );

  const updateAsset = useCallback(
    async (id: number, patch: AssetUpdateInput): Promise<AssetRecord | null> => {
      try {
        const updated = await apiPatch<AssetRecord>(`/workspace/assets/${id}/`, patch);
        await fetchPage(page);
        return updated;
      } catch {
        setError('更新资产失败');
        return null;
      }
    },
    [page, fetchPage],
  );

  const deleteAsset = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        await apiDelete(`/workspace/assets/${id}/`);
        await fetchPage(page);
        return true;
      } catch {
        setError('删除资产失败');
        return false;
      }
    },
    [page, fetchPage],
  );

  return { data, loading, error, page, setPage, refresh, createAsset, updateAsset, deleteAsset };
}
