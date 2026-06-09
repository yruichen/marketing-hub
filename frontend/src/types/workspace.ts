export type NodeStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped';

export interface OrganizationRecord {
  id: number;
  name: string;
  slug: string;
  subscription_plan?: 'free' | 'pro' | 'enterprise';
  plan_limits?: {
    name: string;
    project_limit: number;
    storage_gb: number;
    advanced_agents: boolean;
    byok_discount: string;
  };
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

export interface FolderRecord {
  id: number;
  organization_id: number;
  parent_id: number | null;
  name: string;
  slug: string;
  path: string;
  sort_order: number;
  permission_scope: 'workspace' | 'private' | 'restricted';
  is_archived: boolean;
  project_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectRecord {
  id: number;
  organization_id: number;
  folder_id?: number | null;
  folder_name?: string | null;
  folder_path_display?: string;
  name: string;
  slug: string;
  brief: string;
  brand_context: BrandContext;
  folder_path?: string;
  platform_tags?: string[];
  status_tag?: string;
  sort_order?: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  campaign_count?: number;
  asset_count?: number;
  draft_count?: number;
  template_count?: number;
  pending_review_count?: number;
  latest_generation_status?: string;
  recent_activity_at?: string;
  total_cost_usd?: string;
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
  name?: string;
  icon?: string;
  brand_name?: string;
  product_description?: string;
  tone?: string;
  platform?: string;
  prompt?: string;
  negative_prompt?: string;
  temperature?: number;
  style?: string;
  aspect_ratio?: string;
  model?: string;
  failure_strategy?: string;
  input_fields?: string;
  output_schema_text?: string;
  retrieval_scope?: string;
  channel_rules?: string;
  forbidden_words?: string;
  video_topic?: string;
  duration?: number;
  target_audience?: string;
  text?: string;
  voice_id?: string;
  speed?: number;
  summary?: string;
  input_schema?: Record<string, string>;
  output_schema?: Record<string, string>;
}

export interface WorkflowNode {
  id: string;
  type: 'context' | 'copy' | 'image' | 'image_prompt' | 'image_generation' | 'storyboard' | 'audio' | 'retrieval' | 'review' | 'custom_agent' | 'rag_search' | string;
  label: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  status?: NodeStatus;
  config: WorkflowNodeConfig;
  input_schema?: Record<string, string>;
  output_schema?: Record<string, string>;
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

export interface BillingPlanRecord {
  name: string;
  project_limit: number;
  storage_gb: number;
  advanced_agents: boolean;
  byok_discount: string;
}

export interface BillingPlanResponse {
  current_plan: 'free' | 'pro' | 'enterprise';
  current_limits: BillingPlanRecord;
  project_count: number;
  plans: Record<'free' | 'pro' | 'enterprise', BillingPlanRecord>;
}

export interface GenerationTaskRecord {
  id: number;
  task_type: 'copy' | 'image' | 'storyboard' | 'audio' | 'rag_search' | 'custom_agent';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  result: {
    data?: unknown;
    logs?: string[];
  };
  error_message: string;
  created_at: string;
}
