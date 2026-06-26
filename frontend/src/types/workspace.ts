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
  product_name?: string;
  industry?: string;
  website?: string;
  audience?: string;
  pain_points?: string;
  buying_motivations?: string;
  tone?: string;
  headline_preference?: string;
  punctuation_preference?: string;
  selling_points?: string;
  visual_style?: string;
  campaign_goal?: string;
  forbidden_words?: string;
  compliance_rules?: string;
  competitor_restrictions?: string;
  platform?: string | string[];
  channel_rules?: string;
  content_formats?: string;
  reference_links?: string;
  case_studies?: string;
  historical_assets?: string;
  [key: string]: string | number | boolean | string[] | undefined;
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
  // PR#8 added these field references but never extended the type.
  // Image prompt 节点: 风格 skill 选择
  style_skill?: string;
  // 视频节点: 用户可配置的时长上限（与后端 duration 同义但允许用户覆盖）
  duration_cap?: number;
  // RAG 检索节点: 检索关键词（与 prompt 不同，是用户输入的搜索 query）
  query?: string;
}

export interface WorkflowNode {
  id: string;
  type: 'context' | 'copy' | 'image' | 'image_prompt' | 'image_generation' | 'storyboard' | 'video_generation' | 'audio' | 'retrieval' | 'review' | 'custom_agent' | 'rag_search' | string;
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

export interface WorkflowRunEventRecord {
  id: number;
  workflow_run_id: number;
  node_run_id: number | null;
  event_type: string;
  node_id: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface WorkflowNodeRunRecord {
  id: number;
  workflow_run_id: number;
  generation_task_id: number | null;
  retry_of_id: number | null;
  node_id: string;
  node_type: string;
  node_label: string;
  status: 'pending' | 'queued' | 'running' | 'saving_asset' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';
  attempt: number;
  input_snapshot: Record<string, unknown>;
  output_summary: Record<string, unknown>;
  error_code: string;
  error_message: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowRunRecord {
  id: number;
  draft_id: number;
  organization_id: number;
  project_id: number | null;
  campaign_id: number | null;
  requested_by_id: number | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'partial_success' | 'cancelled';
  idempotency_key: string;
  graph_version: string;
  input_snapshot: Record<string, unknown>;
  summary: Record<string, unknown>;
  total_nodes: number;
  completed_nodes: number;
  failed_nodes: number;
  token_count: number;
  estimated_cost_usd: string;
  actual_cost_usd: string;
  celery_task_id: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  node_runs: WorkflowNodeRunRecord[];
  events: WorkflowRunEventRecord[];
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
  usage_summary?: {
    total_tokens: number;
    total_cost_usd: string;
    last_30d_tokens: number;
    last_30d_cost_usd: string;
    task_count: number;
    successful_tasks: number;
    failed_tasks: number;
  };
  usage_by_provider?: Array<{
    provider: string;
    total_tokens: number;
    cost_usd: string;
  }>;
  recent_usage?: Array<{
    provider: string;
    model_name: string;
    total_tokens: number;
    cost_usd: string;
    created_at: string;
  }>;
}

export interface GenerationTaskRecord {
  id: number;
  task_type: 'copy' | 'image' | 'image_prompt' | 'storyboard' | 'video' | 'audio' | 'review' | 'rag_search' | 'custom_agent' | 'brainstorm';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  celery_task_id?: string;
  result: {
    data?: unknown;
    logs?: string[];
  };
  error_message: string;
  token_count?: number;
  cost_usd?: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string | null;
}

export type AssetType = 'image' | 'audio' | 'video' | 'document';

export interface AssetRecord {
  id: number;
  organization_id: number;
  project_id: number | null;
  campaign_id: number | null;
  asset_type: AssetType;
  title: string;
  source_url: string;
  tags: string[];
  metadata: {
    source?: 'manual' | 'generation' | 'workflow' | string;
    generation_task_id?: number;
    task_type?: string;
    workflow_run_id?: number;
    workflow_draft_id?: number;
    workflow_node_run_id?: number;
    workflow_node_id?: string;
    workflow_node_type?: string;
    workflow_node_label?: string;
    review?: {
      risk_count?: number;
      verdict?: string;
      requires_revision?: boolean;
    };
    result?: Record<string, unknown>;
    [key: string]: unknown;
  };
  created_at: string;
}
