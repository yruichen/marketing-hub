import {
  Bot,
  Braces,
  Clapperboard,
  Code,
  File,
  FileText,
  Film,
  Heading,
  Image as ImageIcon,
  Music,
  Search,
  Sparkles,
  Table,
  Video,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import type { AssetRecord, AssetType } from '../../types/workspace';

export type AssetPalette = {
  /** CSS 变量名（取自 assets.css 的 --asset-palette-*） */
  cssVar: string;
  /** 备用兜底色（不依赖 CSS 变量，调试 / 截屏用） */
  fallbackBg: string;
  fallbackFg: string;
  /** 备用图标大小 */
  icon: LucideIcon;
  /** 文档类子格式标签（仅 document 类型有） */
  formatLabel?: string;
};

/**
 * 视觉矩阵：按 (asset_type, task_type) 二维区分，再叠加文档扩展名。
 * 每种 (type, task_type) 一个独有色板；同色板内按 format 换图标。
 */

type TaskType =
  | 'copy'
  | 'image'
  | 'storyboard'
  | 'audio'
  | 'video'
  | 'rag_search'
  | 'custom_agent'
  | string
  | undefined;

const PALETTES: Record<string, AssetPalette> = {
  'image:image':         { cssVar: '--asset-palette-blue',    fallbackBg: '#DBEAFE', fallbackFg: '#1D4ED8', icon: ImageIcon,     formatLabel: '图片' },
  'image:custom_agent':  { cssVar: '--asset-palette-purple',  fallbackBg: '#EDE9FE', fallbackFg: '#6D28D9', icon: Sparkles,      formatLabel: '创意图' },
  'image:storyboard':    { cssVar: '--asset-palette-cyan',    fallbackBg: '#CFFAFE', fallbackFg: '#0E7490', icon: Film,          formatLabel: '分镜图' },

  'audio:audio':         { cssVar: '--asset-palette-green',   fallbackBg: '#DCFCE7', fallbackFg: '#15803D', icon: Music,         formatLabel: '音频' },
  'audio:custom_agent':  { cssVar: '--asset-palette-teal',    fallbackBg: '#CCFBF1', fallbackFg: '#0F766E', icon: Wand2,         formatLabel: '合成音' },

  'video:video':         { cssVar: '--asset-palette-red',     fallbackBg: '#FEE2E2', fallbackFg: '#B91C1C', icon: Video,         formatLabel: '视频' },
  'video:custom_agent':  { cssVar: '--asset-palette-orange',   fallbackBg: '#FFEDD5', fallbackFg: '#C2410C', icon: Clapperboard,  formatLabel: '创意视频' },
  'video:storyboard':    { cssVar: '--asset-palette-rose',    fallbackBg: '#FFE4E6', fallbackFg: '#BE123C', icon: Film,          formatLabel: '分镜' },

  'document:copy':           { cssVar: '--asset-palette-amber',   fallbackBg: '#FEF3C7', fallbackFg: '#B45309', icon: FileText,  formatLabel: '文案' },
  'document:storyboard':     { cssVar: '--asset-palette-yellow',  fallbackBg: '#FEF9C3', fallbackFg: '#A16207', icon: Film,      formatLabel: '分镜稿' },
  'document:rag_search':     { cssVar: '--asset-palette-slate',   fallbackBg: '#E2E8F0', fallbackFg: '#334155', icon: Search,    formatLabel: '检索' },
  'document:custom_agent':   { cssVar: '--asset-palette-violet',  fallbackBg: '#EDE9FE', fallbackFg: '#5B21B6', icon: Bot,       formatLabel: '智能体' },

  'document:manual':         { cssVar: '--asset-palette-stone',   fallbackBg: '#E7E5E4', fallbackFg: '#44403C', icon: FileText,  formatLabel: '文档' },
  'document:other':          { cssVar: '--asset-palette-zinc',    fallbackBg: '#F4F4F5', fallbackFg: '#3F3F46', icon: File,      formatLabel: '文档' },
};

const FALLBACK: Record<AssetType, AssetPalette> = {
  image:    { cssVar: '--asset-palette-blue',   fallbackBg: '#DBEAFE', fallbackFg: '#1D4ED8', icon: ImageIcon, formatLabel: '图片' },
  audio:    { cssVar: '--asset-palette-green',  fallbackBg: '#DCFCE7', fallbackFg: '#15803D', icon: Music,     formatLabel: '音频' },
  video:    { cssVar: '--asset-palette-red',    fallbackBg: '#FEE2E2', fallbackFg: '#B91C1C', icon: Video,     formatLabel: '视频' },
  document: { cssVar: '--asset-palette-zinc',   fallbackBg: '#F4F4F5', fallbackFg: '#3F3F46', icon: File,      formatLabel: '文档' },
};

/**
 * 文档扩展名 → 图标。优先级：后端 metadata.format > URL 扩展名。
 */
const DOC_FORMAT_ICON: Record<string, LucideIcon> = {
  json: Braces,
  md: Heading,
  markdown: Heading,
  txt: FileText,
  csv: Table,
  tsv: Table,
  html: Code,
  htm: Code,
  xml: Code,
  log: FileText,
};

/**
 * 从 source_url 推文档扩展名。无扩展名 → null。
 * 处理 query string 和 hash。
 */
export function detectDocFormat(sourceUrl: string | undefined | null): string | null {
  if (!sourceUrl) return null;
  try {
    // 取 pathname 段，忽略 query/hash
    const u = new URL(sourceUrl, 'http://x');
    const m = u.pathname.match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    // 非 URL 字符串，按原始尾巴找
    const m = sourceUrl.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
    return m ? m[1].toLowerCase() : null;
  }
}

/**
 * 取 asset 的视觉配置。
 * 文档类型会按扩展名覆盖图标（不影响色板）。
 */
export function getAssetPalette(asset: AssetRecord): AssetPalette {
  const taskType = (asset.metadata?.task_type as TaskType) || (asset.metadata?.source === 'manual' ? 'manual' : undefined);
  const key = `${asset.asset_type}:${taskType || 'other'}`;
  const palette = PALETTES[key] || FALLBACK[asset.asset_type];

  // 文档类按扩展名换图标
  if (asset.asset_type === 'document') {
    const formatFromMeta = typeof asset.metadata?.format === 'string' ? asset.metadata.format : null;
    const format = formatFromMeta || detectDocFormat(asset.source_url);
    if (format && DOC_FORMAT_ICON[format]) {
      return { ...palette, icon: DOC_FORMAT_ICON[format] };
    }
  }
  return palette;
}
