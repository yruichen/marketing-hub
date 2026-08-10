import { useCallback, useState } from 'react';
import { apiFetch, buildErrorToast, parseApiErrorResponse } from '../../hooks/useApi';
import type { TriggerToastFn } from '../../shared/types/toast';
import type { CommunityItem } from './types';

import type { WorkspaceScope } from '../dashboard/types';

interface UseCommunityOptions {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  triggerToast: TriggerToastFn;
  onLikeUpdate?: (id: number, likes: number) => void;
}

interface CommunitySearchResponse {
  results: CommunityItem[];
  rag_logs: string[];
}

export function useCommunity({ workspaceScope, username, triggerToast, onLikeUpdate }: UseCommunityOptions) {
  const [communityItems, setCommunityItems] = useState<CommunityItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [ragLogs, setRagLogs] = useState<string[]>([]);
  const [isRagActive, setIsRagActive] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchCommunity = useCallback(async () => {
    try {
      const res = await apiFetch('/community/creations/');
      if (res.ok) {
        const data: CommunityItem[] = await res.json();
        setCommunityItems(data);
      }
    } catch (err) {
      console.error('Failed to fetch community items', err);
    }
  }, []);

  const handleLike = useCallback(async (id: number) => {
    try {
      const res = await apiFetch(`/community/creations/${id}/like/`, {
        method: 'POST',
      });
      if (res.ok) {
        const data: { likes: number } = await res.json();
        setCommunityItems((prev) => prev.map((item) => item.id === id ? { ...item, likes: data.likes } : item));
        onLikeUpdate?.(id, data.likes);
        triggerToast('点赞成功！', 'success');
      }
    } catch (err) {
      console.error('Failed to like', err);
    }
  }, [triggerToast, onLikeUpdate]);

  const handleReport = useCallback(async (id: number) => {
    try {
      const res = await apiFetch(`/community/creations/${id}/report/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'other', description: 'User submitted report from community card.' }),
      });
      if (res.ok) {
        setCommunityItems((prev) => prev.map((item) => (
          item.id === id ? { ...item, reported_count: (item.reported_count || 0) + 1 } : item
        )));
        triggerToast('举报已提交，运营会复核处理', 'success');
      } else {
        const err = await parseApiErrorResponse(res, `/community/creations/${id}/report/`);
        triggerToast(buildErrorToast(err, '举报提交失败'));
      }
    } catch (err) {
      triggerToast(buildErrorToast(err, '举报提交失败', '无法连接服务器，请稍后重试'));
    }
  }, [triggerToast]);

  const handleRAGSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setIsRagActive(false);
      await fetchCommunity();
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/community/search/?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data: CommunitySearchResponse = await res.json();
        setCommunityItems(data.results);
        setRagLogs(data.rag_logs);
        setIsRagActive(true);
        triggerToast('品牌灵感已完成对齐', 'success');
      }
    } catch (err) {
      triggerToast(buildErrorToast(err, '灵感搜索请求失败'));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, fetchCommunity, triggerToast]);

  const shareToCommunity = useCallback(async (
    type: CommunityItem['creation_type'],
    title: string,
    content: CommunityItem['content'],
    imageUrl = '',
    audioUrl = '',
    onSuccess?: () => void,
  ) => {
    try {
      const res = await apiFetch('/community/creations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username || '',
          organization: workspaceScope?.organization.slug,
          project: workspaceScope?.project.slug,
          campaign: workspaceScope?.campaign?.id,
          creation_type: type,
          title,
          content,
          image_url: imageUrl,
          audio_url: audioUrl,
          visibility: 'public',
          responsibility_confirmed: true,
          ai_generated: true,
        }),
      });
      if (res.ok) {
        triggerToast('已成功分享到手绘工坊社区！', 'success');
        await fetchCommunity();
        onSuccess?.();
      } else {
        const err = await parseApiErrorResponse(res, '/community/creations/');
        triggerToast(buildErrorToast(err, '作品分享失败'));
      }
    } catch (err) {
      triggerToast(buildErrorToast(err, '分享失败', '无法连接服务器，请稍后重试'));
    }
  }, [workspaceScope, username, triggerToast, fetchCommunity]);

  const resetSearch = useCallback(async () => {
    setSearchQuery('');
    setIsRagActive(false);
    await fetchCommunity();
  }, [fetchCommunity]);

  return {
    communityItems,
    setCommunityItems,
    searchQuery,
    setSearchQuery,
    ragLogs,
    isRagActive,
    loading,
    setLoading,
    fetchCommunity,
    handleLike,
    handleReport,
    handleRAGSearch,
    shareToCommunity,
    resetSearch,
  };
}
