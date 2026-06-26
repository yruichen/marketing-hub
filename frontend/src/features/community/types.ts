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
  likes: number;
  created_at: string;
  similarity_score?: number;
}
