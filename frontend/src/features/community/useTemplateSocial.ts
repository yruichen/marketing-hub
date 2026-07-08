import { useCallback, useEffect, useState } from 'react';

const FOLLOW_KEY = 'mh_followed_creators';
const COLLECT_KEY = 'mh_collected_templates';

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function readIdList(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'number') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, values: string[] | number[]) {
  localStorage.setItem(key, JSON.stringify(values));
}

export function useTemplateSocial(currentUsername?: string | null) {
  const [followedCreators, setFollowedCreators] = useState<string[]>(() => readList(FOLLOW_KEY));
  const [collectedIds, setCollectedIds] = useState<number[]>(() => readIdList(COLLECT_KEY));

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === FOLLOW_KEY) setFollowedCreators(readList(FOLLOW_KEY));
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

  const toggleFollow = useCallback((username: string) => {
    if (!username || username === currentUsername) return false;
    setFollowedCreators((prev) => {
      const next = prev.includes(username)
        ? prev.filter((name) => name !== username)
        : [...prev, username];
      writeList(FOLLOW_KEY, next);
      return next;
    });
    return true;
  }, [currentUsername]);

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
  };
}

export function creatorNoteFromItem(metadata?: Record<string, unknown>): string {
  const note = metadata?.creator_note;
  return typeof note === 'string' ? note.trim() : '';
}
