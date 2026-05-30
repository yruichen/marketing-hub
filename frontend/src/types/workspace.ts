export type NodeStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed';

export interface OrganizationRecord {
  id: number;
  name: string;
  slug: string;
}

export interface BrandContext {
  brand_name?: string;
  audience?: string;
  tone?: string;
  selling_points?: string;
  visual_style?: string;
  campaign_goal?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface ProjectRecord {
  id: number;
  organization_id: number;
  name: string;
  slug: string;
  brief: string;
  brand_context: BrandContext;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  campaign_count?: number;
  asset_count?: number;
  draft_count?: number;
  template_count?: number;
}

export interface CampaignRecord {
  id: number;
  project_id: number;
  name: string;
  objective: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowNodeConfig {
  brand_name?: string;
  product_description?: string;
  tone?: string;
  platform?: string;
  prompt?: string;
  style?: string;
  aspect_ratio?: string;
  video_topic?: string;
  duration?: number;
  target_audience?: string;
  text?: string;
  voice_id?: string;
  speed?: number;
  summary?: string;
}

export interface WorkflowNode {
  id: string;
  type: 'context' | 'copy' | 'image' | 'storyboard' | 'audio' | 'rag_search' | string;
  label: string;
  x: number;
  y: number;
  status?: NodeStatus;
  config: WorkflowNodeConfig;
  output?: Record<string, unknown>;
  task_id?: number;
  error_message?: string;
  feedback?: string;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface WorkspaceDraftRecord {
  id: number;
  organization_id: number;
  project_id: number;
  campaign_id: number | null;
  name: string;
  brand_context: BrandContext;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport: Record<string, unknown>;
  selected_node_id: string;
  status: 'draft' | 'running' | 'completed' | 'failed';
  last_run_summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplateRecord {
  id: number;
  organization_id: number | null;
  source_project_id: number | null;
  source_campaign_id: number | null;
  title: string;
  description: string;
  author_username: string;
  brand_context: BrandContext;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  preview_image_url: string;
  tags: string[];
  is_public: boolean;
  fork_count: number;
  created_at: string;
  updated_at: string;
}

export interface GenerationTaskRecord {
  id: number;
  task_type: 'copy' | 'image' | 'storyboard' | 'audio' | 'rag_search';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  result: {
    data?: unknown;
    logs?: string[];
  };
  error_message: string;
  created_at: string;
}
