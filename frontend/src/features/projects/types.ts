import type { BrandContext, CampaignRecord, FolderRecord, OrganizationRecord, ProjectRecord, WorkspaceDraftRecord } from '../../types/workspace';
import type { TriggerToastFn } from '../../shared/types/toast';

export type ViewMode = 'icon' | 'list' | 'board';
export type ProjectSortKey = 'recent' | 'name' | 'campaigns' | 'assets' | 'cost';

export interface ProjectDetail extends ProjectRecord {
  campaigns: CampaignRecord[];
  drafts: WorkspaceDraftRecord[];
  assets: Array<{ id: number; asset_type: string; title: string; created_at: string }>;
}

export interface ProjectForm {
  name: string;
  brief: string;
  folder_id: number | null;
  folder_path: string;
  platform_tags: string[];
  status_tag: string;
}


export interface ProjectManagerProps {
  organization: OrganizationRecord | null;
  activeProjectId?: number;
  onSelectScope: (project: ProjectRecord, campaign?: CampaignRecord) => void;
  triggerToast: TriggerToastFn;
  onOpenAssetsLibrary?: () => void;
}

export const PLATFORM_CHOICES = ['小红书', '抖音', '微信公众号', '视频号', 'B站'];

export const STATUS_CHOICES = ['creating', 'draft', 'review', 'published'];

export const STATUS_LABELS: Record<string, string> = {
  creating: '生产中',
  draft: '草稿',
  review: '待审',
  published: '已发布',
};

export const CONTEXT_FIELDS: ReadonlyArray<readonly [keyof BrandContext, string]> = [
  ['brand_name', '品牌名称'],
  ['audience', '目标受众'],
  ['tone', '品牌语调'],
  ['selling_points', '核心卖点'],
  ['visual_style', '视觉风格'],
  ['campaign_goal', '活动目标'],
];

export const EMPTY_BRAND_CONTEXT: BrandContext = {
  brand_name: '',
  audience: '',
  tone: '',
  selling_points: '',
  visual_style: '',
  campaign_goal: '',
};

export type FolderRecordWithMeta = FolderRecord;

export function getProjectFolder(project: Pick<ProjectRecord, 'folder_path_display' | 'folder_path'>): string {
  return project.folder_path_display || project.folder_path || '默认文件夹';
}

export function getProjectStatus(project: Pick<ProjectRecord, 'status_tag'>): string {
  return project.status_tag || 'creating';
}

export function getProjectStatusLabel(project: Pick<ProjectRecord, 'status_tag'>): string {
  const status = getProjectStatus(project);
  return STATUS_LABELS[status] || status;
}

export function getProjectActivityTime(project: Pick<ProjectRecord, 'recent_activity_at' | 'updated_at' | 'created_at'>): string {
  return project.recent_activity_at || project.updated_at || project.created_at;
}

export function formatProjectDate(value?: string): string {
  if (!value) return '暂无';
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function formatProjectCost(value?: string): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '$0.00';
  return `$${amount.toFixed(2)}`;
}
