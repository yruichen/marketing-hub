import { useCallback, useEffect, useState } from 'react';
import { apiFetch, parseApiErrorResponse } from '../../hooks/useApi';

const COLLECT_KEY = 'mh_collected_templates';

function readIdList(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'number') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, values: number[]) {
  localStorage.setItem(key, JSON.stringify(values));
}

export function useTemplateSocial(currentUsername?: string | null) {
  const [followedCreators, setFollowedCreators] = useState<string[]>([]);
  const [collectedIds, setCollectedIds] = useState<number[]>(() => readIdList(COLLECT_KEY));
  const [followLoading, setFollowLoading] = useState(false);

  const refreshFollowing = useCallback(async () => {
    if (!currentUsername) {
      setFollowedCreators([]);
      return;
    }
    try {
      const response = await apiFetch('/profiles/me/following/');
      if (!response.ok) return;
      const payload = await response.json().catch(() => null);
      const results = Array.isArray(payload?.results) ? payload.results : [];
      setFollowedCreators(results.map((item: { username?: string }) => item.username).filter(Boolean));
    } catch {
      // ignore
    }
  }, [currentUsername]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshFollowing();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshFollowing]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === COLLECT_KEY) setCollectedIds(readIdList(COLLECT_KEY));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const isFollowing = useCallback(
    (username: string) => followedCreators.includes(username),
    [followedCreators],
  );

  const isCollected = useCallback(
    (templateId: number) => collectedIds.includes(templateId),
    [collectedIds],
  );

  const toggleFollow = useCallback(async (username: string) => {
    if (!username || username === currentUsername || followLoading) return false;
    const nextFollow = !followedCreators.includes(username);
    setFollowLoading(true);
    try {
      const response = await apiFetch(`/profiles/${encodeURIComponent(username)}/follow/`, {
        method: nextFollow ? 'POST' : 'DELETE',
      });
      if (!response.ok) {
        throw await parseApiErrorResponse(response, `/profiles/${encodeURIComponent(username)}/follow/`);
      }
      setFollowedCreators((prev) => (
        nextFollow
          ? [...new Set([...prev, username])]
          : prev.filter((name) => name !== username)
      ));
      return true;
    } catch {
      return false;
    } finally {
      setFollowLoading(false);
    }
  }, [currentUsername, followLoading, followedCreators]);

  const toggleCollect = useCallback((templateId: number) => {
    setCollectedIds((prev) => {
      const next = prev.includes(templateId)
        ? prev.filter((id) => id !== templateId)
        : [...prev, templateId];
      writeList(COLLECT_KEY, next);
      return next;
    });
    return true;
  }, []);

  return {
    followedCreators,
    collectedIds,
    isFollowing,
    isCollected,
    toggleFollow,
    toggleCollect,
    refreshFollowing,
  };
}

export function creatorNoteFromItem(metadata?: Record<string, unknown>): string {
  const note = metadata?.creator_note;
  return typeof note === 'string' ? note.trim() : '';
}
