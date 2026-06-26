import type { AppSection } from '../shared/stores/uiStore';

const sectionToPath: Record<AppSection, string> = {
  brainstorm: '/',
  dashboard: '/dashboard',
  projects: '/projects',
  content: '/generation',
  builder: '/workflows',
  assets: '/assets',
  review: '/review',
  community: '/templates',
  profile: '/profile',
  billing: '/billing',
  admin: '/admin-console',
  config: '/settings',
  copy: '/generation/copy',
  image: '/generation/image',
  storyboard: '/generation/storyboard',
  audio: '/generation/audio',
  video: '/generation/video',
};

export function pathForSection(section: AppSection) {
  return sectionToPath[section] || '/';
}

export function sectionFromPath(pathname: string): AppSection {
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/workflows')) return 'builder';
  if (pathname.startsWith('/assets')) return 'assets';
  if (pathname.startsWith('/review')) return 'review';
  if (pathname.startsWith('/templates')) return 'community';
  if (pathname.startsWith('/profile')) return 'profile';
  if (pathname.startsWith('/billing')) return 'billing';
  if (pathname.startsWith('/admin-console')) return 'admin';
  if (pathname.startsWith('/settings')) return 'config';
  if (pathname.startsWith('/generation/copy')) return 'copy';
  if (pathname.startsWith('/generation/image')) return 'image';
  if (pathname.startsWith('/generation/storyboard')) return 'storyboard';
  if (pathname.startsWith('/generation/audio')) return 'audio';
  if (pathname.startsWith('/generation/video')) return 'video';
  if (pathname.startsWith('/generation')) return 'content';
  return 'brainstorm';
}
