import type { AssetRecord, GenerationTaskRecord, ProjectRecord } from '../../types/workspace';
import type { GlobalSearchPayload, GlobalSearchResult } from './types';
import { taskTypeLabels } from '../generation/types';

function normalize(value: unknown) {
  return String(value ?? '').toLowerCase().trim();
}

function includesQuery(value: unknown, query: string) {
  return normalize(value).includes(query);
}

function compact(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function projectMatches(project: ProjectRecord, query: string) {
  return [
    project.name,
    project.slug,
    project.brief,
    project.status_tag,
    project.folder_path,
    project.folder_name,
    project.platform_tags?.join(' '),
    project.brand_context ? JSON.stringify(project.brand_context) : '',
  ].some((value) => includesQuery(value, query));
}

export function assetMatches(asset: AssetRecord, query: string) {
  return [
    asset.title,
    asset.asset_type,
    asset.source_url,
    asset.tags.join(' '),
    asset.metadata ? JSON.stringify(asset.metadata) : '',
  ].some((value) => includesQuery(value, query));
}

export function taskMatches(task: GenerationTaskRecord, query: string) {
  return [
    task.id,
    task.task_type,
    taskTypeLabels[task.task_type],
    task.status,
    task.error_message,
    task.result?.logs?.join(' '),
  ].some((value) => includesQuery(value, query));
}

export function buildGlobalSearchResults(
  queryInput: string,
  payload: GlobalSearchPayload,
): GlobalSearchResult[] {
  const query = normalize(queryInput);
  if (!query) return [];

  const projects = payload.projects
    .filter((project) => projectMatches(project, query))
    .slice(0, 5)
    .map<GlobalSearchResult>((project) => ({
      id: `project-${project.id}`,
      kind: 'project',
      label: project.name,
      description: compact(project.brief || project.slug || '项目'),
      tab: 'projects',
      project,
    }));

  const assets = payload.assets
    .filter((asset) => assetMatches(asset, query))
    .slice(0, 5)
    .map<GlobalSearchResult>((asset) => ({
      id: `asset-${asset.id}`,
      kind: 'asset',
      label: asset.title,
      description: `${asset.asset_type} · ${asset.tags.slice(0, 3).join(' / ') || '未打标签'}`,
      tab: 'assets',
      asset,
    }));

  const tasks = payload.tasks
    .filter((task) => taskMatches(task, query))
    .slice(0, 5)
    .map<GlobalSearchResult>((task) => ({
      id: `task-${task.id}`,
      kind: 'task',
      label: `#${task.id} ${taskTypeLabels[task.task_type] ?? task.task_type}`,
      description: task.error_message || `${task.status} · ${task.token_count ?? 0} tokens`,
      tab: 'dashboard',
      task,
    }));

  const baseActions: GlobalSearchResult[] = [
    { id: 'action-content', kind: 'action', label: '生成内容包', description: '从 brief 生成标题、正文、标签和分镜', tab: 'content' },
    { id: 'action-projects', kind: 'action', label: '管理项目', description: '切换项目、编辑品牌记忆和活动', tab: 'projects' },
    { id: 'action-assets', kind: 'action', label: '打开资产库', description: '查看已沉淀的图片、文案、音频和视频', tab: 'assets' },
    { id: 'action-config', kind: 'action', label: 'AI 设置', description: '配置 Provider、模型和 API Key', tab: 'config' },
  ];
  const actions = baseActions.filter((item) => includesQuery(`${item.label} ${item.description}`, query)).slice(0, 3);

  return [...projects, ...assets, ...tasks, ...actions].slice(0, 10);
}
