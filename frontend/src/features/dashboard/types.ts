import type { GenerationTaskRecord, OrganizationRecord } from '../../types/workspace';

export interface WorkspaceScope {
  organization: OrganizationRecord;
  project: {
    id: number;
    name: string;
    slug: string;
    brief: string;
    brand_context?: import('../../types/workspace').BrandContext;
  };
  campaign: {
    id: number;
    name: string;
    objective: string;
    status: string;
  };
  username: string;
}

export interface DashboardSnapshot {
  scope: WorkspaceScope;
  metrics: {
    task_count: number;
    queued_tasks: number;
    running_tasks: number;
    successful_tasks: number;
    failed_tasks: number;
    total_tokens: number;
    total_cost_usd: string;
    asset_count: number;
    community_count: number;
    project_count?: number;
    campaign_count?: number;
    draft_count?: number;
    active_task_count?: number;
    success_rate?: number;
    failure_rate?: number;
  };
  tasks_by_type: Record<string, number>;
  tasks_by_status?: Record<string, number>;
  asset_type_counts?: Record<string, number>;
  usage_by_provider?: Array<{
    provider: string;
    total_tokens: number;
    cost_usd: string;
    event_count: number;
  }>;
  usage_trend?: Array<{
    date: string;
    total_tokens: number;
    cost_usd: string;
    event_count: number;
  }>;
  workspace_health?: {
    projects: number;
    campaigns: number;
    drafts: number;
    running_drafts: number;
    completed_drafts: number;
    failed_drafts: number;
  };
  recent_tasks?: GenerationTaskRecord[];
  recent_usage: Array<{
    provider: string;
    model_name: string;
    total_tokens: number;
    cost_usd: string;
    created_at: string;
  }>;
}

export const formatUsd = (value?: string | number | null) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return '0.0000';
  return parsed.toFixed(4);
};
