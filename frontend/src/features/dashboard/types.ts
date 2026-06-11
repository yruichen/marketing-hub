import type { OrganizationRecord } from '../../types/workspace';

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
  };
  tasks_by_type: Record<string, number>;
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