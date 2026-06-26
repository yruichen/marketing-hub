import { useCallback, useState } from 'react';
import { apiFetch } from '../../hooks/useApi';
import type { CommunityItem } from './types';

const DEMO_USERNAME = import.meta.env.VITE_DEMO_USERNAME || 'DEMO';
import type { WorkspaceScope } from '../dashboard/types';

interface UseCommunityOptions {
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
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
    } catch {
      triggerToast('灵感搜索请求失败', 'error');
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
          username: username || DEMO_USERNAME,
          organization: workspaceScope?.organization.slug,
          project: workspaceScope?.project.slug,
          campaign: workspaceScope?.campaign.id,
          creation_type: type,
          title,
          content,
          image_url: imageUrl,
          audio_url: audioUrl,
        }),
      });
      if (res.ok) {
        triggerToast('已成功分享到手绘工坊社区！', 'success');
        await fetchCommunity();
        onSuccess?.();
      } else {
        triggerToast('作品分享失败', 'error');
      }
    } catch {
      triggerToast('分享失败，无法连接服务器', 'error');
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
    handleRAGSearch,
    shareToCommunity,
    resetSearch,
  };
}
