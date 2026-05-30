import type { Page } from '@playwright/test';

type RoutePayload = Record<string, unknown> | Array<Record<string, unknown>>;

const now = '2026-05-30T00:00:00.000Z';

const organization = {
  id: 1,
  name: 'Marketing Hub',
  slug: 'marketing-hub',
};

const project = {
  id: 101,
  organization_id: 1,
  folder_id: 11,
  folder_name: '默认文件夹',
  folder_path_display: '默认文件夹',
  name: 'Core Launch',
  slug: 'core-launch',
  brief: 'Default workspace for the local upgrade scaffold.',
  brand_context: {
    brand_name: 'Core Launch',
    audience: '品牌运营',
    tone: '清晰专业',
    selling_points: '内容包生成',
    visual_style: 'editorial',
    campaign_goal: '新品上市',
  },
  folder_path: '默认文件夹',
  platform_tags: ['小红书', '抖音', '微信公众号'],
  status_tag: 'creating',
  sort_order: 0,
  is_archived: false,
  created_at: now,
  updated_at: now,
  campaign_count: 1,
  asset_count: 5,
  draft_count: 2,
  template_count: 1,
  pending_review_count: 1,
  latest_generation_status: 'succeeded',
  recent_activity_at: now,
  total_cost_usd: '0.10318',
};

const folders = [
  {
    id: 11,
    organization_id: 1,
    parent_id: null,
    name: '默认文件夹',
    slug: 'default',
    path: '默认文件夹',
    sort_order: 0,
    permission_scope: 'workspace',
    is_archived: false,
    project_count: 1,
    created_at: now,
    updated_at: now,
  },
];

const campaigns = [
  {
    id: 201,
    project_id: 101,
    name: 'Product Launch',
    objective: '新品上市全链路营销活动',
    status: 'active',
    created_at: now,
    updated_at: now,
  },
];

const workflowNodes = [
  {
    id: 'brand-brief',
    type: 'context',
    label: '品牌卖点提炼',
    x: 72,
    y: 118,
    width: 240,
    height: 144,
    status: 'succeeded',
    config: { summary: 'Default workspace for the local upgrade scaffold.' },
    input_schema: {},
    output_schema: { summary: 'String', brand_context: 'Object' },
    output: { summary: 'Default workspace for the local upgrade scaffold.' },
  },
  {
    id: 'copy-agent',
    type: 'copy',
    label: '小红书文案专家',
    x: 370,
    y: 98,
    width: 240,
    height: 144,
    status: 'succeeded',
    config: { tone: '清晰专业', platform: 'Xiaohongshu' },
    input_schema: { product_description: 'String', tone: 'String', platform: 'String' },
    output_schema: { title: 'String', paragraphs: 'String[]', tags: 'String[]', call_to_action: 'String' },
    output: { title: 'Core Launch', paragraphs: ['Ready to ship.'] },
  },
  {
    id: 'image-agent',
    type: 'image',
    label: '配图生成器',
    x: 680,
    y: 210,
    width: 240,
    height: 144,
    status: 'running',
    config: { style: 'editorial', aspect_ratio: '1:1' },
    input_schema: { prompt: 'String', style: 'String', aspect_ratio: 'String' },
    output_schema: { image_url: 'URL', revised_prompt: 'String' },
    output: { prompt: 'cover image', style: 'editorial' },
  },
  {
    id: 'story-agent',
    type: 'storyboard',
    label: '分镜脚本导演',
    x: 140,
    y: 320,
    width: 240,
    height: 144,
    status: 'idle',
    config: { duration: 30, target_audience: '品牌运营' },
    input_schema: { video_topic: 'String', duration: 'Number', target_audience: 'String' },
    output_schema: { scenes: 'Scene[]', total_duration_seconds: 'Number' },
    output: {},
  },
];

const workflowEdges = [
  { id: 'edge-brand-copy', source: 'brand-brief', target: 'copy-agent' },
  { id: 'edge-copy-image', source: 'copy-agent', target: 'image-agent' },
  { id: 'edge-brand-story', source: 'brand-brief', target: 'story-agent' },
];

const template = {
  id: 501,
  organization_id: 1,
  source_project_id: 101,
  source_campaign_id: 201,
  title: 'Core Launch Workflow',
  description: '4 nodes / 3 edges',
  author_username: 'ROOT',
  brand_context: project.brand_context,
  nodes: workflowNodes,
  edges: workflowEdges,
  preview_image_url: '',
  tags: ['workflow', 'core-launch'],
  is_public: true,
  fork_count: 1,
  created_at: now,
  updated_at: now,
};

const draft = {
  id: 301,
  organization_id: 1,
  project_id: 101,
  campaign_id: 201,
  name: 'Default Workflow',
  brand_context: project.brand_context,
  nodes: workflowNodes,
  edges: workflowEdges,
  viewport: {},
  selected_node_id: 'brand-brief',
  status: 'draft',
  last_run_summary: {},
  created_at: now,
  updated_at: now,
};

const dashboard = {
  scope: {
    organization,
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug,
      brief: project.brief,
      brand_context: project.brand_context,
    },
    campaign: campaigns[0],
    username: 'ROOT',
  },
  metrics: {
    task_count: 15,
    queued_tasks: 1,
    running_tasks: 0,
    successful_tasks: 15,
    failed_tasks: 0,
    total_tokens: 6440,
    total_cost_usd: '0.1288',
    asset_count: 8,
    community_count: 1,
  },
  tasks_by_type: {
    copy: 6,
    image: 6,
    storyboard: 2,
    audio: 1,
  },
  recent_usage: [
    { provider: 'mock', model_name: 'default', total_tokens: 816, cost_usd: '0.0163', created_at: now },
  ],
};

const workspaceBootstrap = {
  scope: dashboard.scope,
};

const billing = {
  current_plan: 'pro',
  current_limits: { name: 'Pro', project_limit: 20, storage_gb: 50, advanced_agents: true, byok_discount: '10%' },
  project_count: 2,
  plans: {
    free: { name: 'Free', project_limit: 3, storage_gb: 5, advanced_agents: false, byok_discount: '0%' },
    pro: { name: 'Pro', project_limit: 20, storage_gb: 50, advanced_agents: true, byok_discount: '10%' },
    enterprise: { name: 'Enterprise', project_limit: 9999, storage_gb: 500, advanced_agents: true, byok_discount: '20%' },
  },
};

const aiConfig = [
  {
    id: 1,
    provider: 'mock',
    provider_display: 'Mock Sandbox',
    api_key: 'Unset',
    base_url: '',
    model_name: 'gpt-mock-agent',
    billing_mode: 'platform',
    is_active: true,
  },
];

const community = [
  {
    id: 801,
    username: 'ROOT',
    creation_type: 'copy',
    creation_type_display: '文案',
    title: 'Core Launch 开场文案',
    content: { title: 'Core Launch', paragraphs: ['Ready to ship.'] },
    image_url: '',
    audio_url: '',
    likes: 8,
    created_at: now,
    similarity_score: 0.92,
  },
];

function json(payload: RoutePayload, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(payload) };
}

export async function installMocks(page: Page) {
  await page.route('**/api/auth/login/', async (route) => {
    await route.fulfill(json({ token: 'demo-token', username: 'ROOT' }));
  });
  await page.route('**/api/ai/config/', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill(json(aiConfig[0]));
      return;
    }
    await route.fulfill(json(aiConfig));
  });
  await page.route('**/api/workspace/bootstrap/**', async (route) => {
    await route.fulfill(json(workspaceBootstrap));
  });
  await page.route('**/api/dashboard/**', async (route) => {
    await route.fulfill(json(dashboard));
  });
  await page.route('**/api/billing/plans/**', async (route) => {
    await route.fulfill(json(billing));
  });
  await page.route('**/api/community/creations/**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill(json({ ok: true }));
      return;
    }
    await route.fulfill(json(community));
  });
  await page.route('**/api/community/search/**', async (route) => {
    await route.fulfill(json({ results: community, rag_logs: ['检索到历史素材 1 条'] }));
  });
  await page.route('**/api/tasks/**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill(json({
        task: {
          id: 9001,
          task_type: 'copy',
          status: 'succeeded',
          result: { data: { title: 'Done', body: 'Ready' }, logs: ['[0.01s] [INFO] done'] },
          error_message: '',
          created_at: now,
        },
      }));
      return;
    }
    await route.fulfill(json({
      id: 9001,
      task_type: 'copy',
      status: 'succeeded',
      result: { data: { title: 'Done', body: 'Ready' }, logs: ['[0.01s] [INFO] done'] },
      error_message: '',
      created_at: now,
    }));
  });
  await page.route('**/api/projects/?**', async (route) => {
    await route.fulfill(json([project]));
  });
  await page.route('**/api/folders/?**', async (route) => {
    await route.fulfill(json(folders));
  });
  await page.route('**/api/projects/101/**', async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill(json({ ...project }));
      return;
    }
    await route.fulfill(json({
      ...project,
      campaigns,
      drafts: [draft],
      assets: [
        { id: 1, asset_type: 'copy', title: 'Core Launch 文案', created_at: now },
        { id: 2, asset_type: 'image', title: 'Core Launch 视觉草图', created_at: now },
      ],
    }));
  });
  await page.route('**/api/folders/**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill(json({
        id: 12,
        organization_id: 1,
        parent_id: null,
        name: '新文件夹',
        slug: 'new-folder',
        path: '新文件夹',
        sort_order: 1,
        permission_scope: 'workspace',
        is_archived: false,
        project_count: 0,
        created_at: now,
        updated_at: now,
      }));
      return;
    }
    await route.fulfill(json(folders));
  });
  await page.route('**/api/campaigns/**', async (route) => {
    await route.fulfill(json({
      id: 202,
      project_id: 101,
      name: 'Launch Wave',
      objective: '新品上市全链路营销活动',
      status: 'active',
      created_at: now,
      updated_at: now,
    }));
  });
  await page.route('**/api/templates/**', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill(json(template));
      return;
    }
    if (route.request().url().includes('/fork/')) {
      await route.fulfill(json({ draft, template }));
      return;
    }
    await route.fulfill(json([template]));
  });
  await page.route('**/api/drafts/**', async (route) => {
    if (route.request().method() === 'POST' || route.request().method() === 'PATCH') {
      await route.fulfill(json(draft));
      return;
    }
    await route.fulfill(json(draft));
  });
  await page.route('**/api/billing/plans/', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill(json(billing));
      return;
    }
    await route.fulfill(json(billing));
  });
}
