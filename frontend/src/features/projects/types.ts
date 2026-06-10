import type { BrandContext, CampaignRecord, FolderRecord, OrganizationRecord, ProjectRecord, WorkspaceDraftRecord } from '../../types/workspace';

export type ViewMode = 'icon' | 'list' | 'board';

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
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
}

export const PLATFORM_CHOICES = ['小红书', '抖音', '微信公众号', '视频号', 'B站'];

export const STATUS_CHOICES = ['creating', 'draft', 'published', 'archived'];

export const STATUS_LABELS: Record<string, string> = {
  creating: '生产中',
  draft: '草稿',
  review: '待审',
  published: '已发布',
  archived: '已归档',
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
