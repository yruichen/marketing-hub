import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../hooks/useApi';
import type { CommunityItem } from '../community';

export interface CreatorSocialLink {
  label: string;
  url: string;
}

export interface CreatorProfile {
  username: string;
  email: string;
  display_name: string;
  headline: string;
  bio: string;
  location: string;
  website_url: string;
  avatar_url: string;
  banner_url: string;
  specialties: string[];
  social_links: CreatorSocialLink[];
  profile_visibility: 'workspace' | 'private';
  created_at: string;
  updated_at: string;
}

export interface CreatorProfileStats {
  creation_count: number;
  total_likes: number;
  favorite_type: string;
  favorite_type_display: string;
  latest_published_at: string | null;
}

export interface CreatorProfileResponse {
  profile: CreatorProfile;
  stats: CreatorProfileStats;
  featured_creations: CommunityItem[];
  creations: CommunityItem[];
  is_owner: boolean;
  is_private: boolean;
}

export type CreatorProfilePatch = Partial<
  Pick<
    CreatorProfile,
    | 'display_name'
    | 'headline'
    | 'bio'
    | 'location'
    | 'website_url'
    | 'avatar_url'
    | 'banner_url'
    | 'specialties'
    | 'social_links'
    | 'profile_visibility'
  >
>;

function profilePath(username?: string | null) {
  return username ? `/profiles/${encodeURIComponent(username)}/` : '/profiles/me/';
}

export function useProfile(username?: string | null) {
  const [data, setData] = useState<CreatorProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const path = useMemo(() => profilePath(username), [username]);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch(path);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.error || '个人主页加载失败');
        setData(null);
        return;
      }
      setData(payload as CreatorProfileResponse);
    } catch {
      setError('无法连接个人主页服务');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [path]);

  const saveProfile = useCallback(async (patch: CreatorProfilePatch) => {
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch('/profiles/me/', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const details = payload?.errors ? Object.values(payload.errors).join(' / ') : payload?.error;
        throw new Error(details || '资料保存失败');
      }
      setData(payload as CreatorProfileResponse);
      return payload as CreatorProfileResponse;
    } finally {
      setSaving(false);
    }
  }, []);

  const updateProfileCreation = useCallback(async (id: number, patch: { profile_featured: boolean; profile_featured_rank?: number }) => {
    setSaving(true);
    setError('');
    try {
      const response = await apiFetch(`/profiles/me/creations/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || '作品展示设置失败');
      }
      setData(payload as CreatorProfileResponse);
      return payload as CreatorProfileResponse;
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchProfile();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchProfile]);

  return {
    data,
    loading,
    saving,
    error,
    setError,
    fetchProfile,
    saveProfile,
    updateProfileCreation,
  };
}
