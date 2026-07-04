import type { CreationContent } from '../generation/types';

export interface CommunityItem {
  id: number;
  username: string;
  creation_type: 'copy' | 'image' | 'storyboard' | 'audio' | 'video';
  creation_type_display: string;
  title: string;
  content: CreationContent;
  image_url?: string;
  audio_url?: string;
  tags?: string[];
  likes: number;
  created_at: string;
  published_at?: string | null;
  visibility?: 'private' | 'organization' | 'public';
  metadata?: Record<string, unknown>;
  similarity_score?: number;
  ai_generated?: boolean;
  reported_count?: number;
  moderation_status?: string;
  review_status?: string;
}
