import type { BrandContext, WorkflowEdge, WorkflowNode } from '../../types/workspace';
import { calculateBrandMemoryScore } from '../brand-memory';

export type WorkflowReadinessSeverity = 'blocker' | 'warning' | 'info';
export type WorkflowReadinessAction = 'select_node' | 'add_review' | 'open_brand_memory' | 'tidy_layout';

export interface WorkflowReadinessIssue {
  id: string;
  severity: WorkflowReadinessSeverity;
  title: string;
  detail: string;
  action?: WorkflowReadinessAction;
  actionLabel?: string;
  nodeId?: string;
}

export interface WorkflowReadinessResult {
  canRun: boolean;
  blockers: WorkflowReadinessIssue[];
  warnings: WorkflowReadinessIssue[];
  infos: WorkflowReadinessIssue[];
  orderedIssues: WorkflowReadinessIssue[];
}

const requiredConfigByType: Record<string, Array<{ key: string; label: string }>> = {
  copy: [
    { key: 'platform', label: '平台' },
    { key: 'tone', label: '语调' },
  ],
  image_prompt: [
    { key: 'style_skill', label: '风格 Skill' },
    { key: 'aspect_ratio', label: '画幅比例' },
  ],
  video_generation: [
    { key: 'aspect_ratio', label: '画幅比例' },
    { key: 'duration_cap', label: '时长上限' },
  ],
  custom_agent: [
    { key: 'prompt', label: '系统 Prompt' },
    { key: 'output_schema_text', label: '输出 Schema' },
  ],
};

function hasValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null && value !== '';
}

export function hasWorkflowCycle(nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adjacency.get(edge.source)?.push(edge.target);
    }
  }
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (inStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    inStack.add(nodeId);
    const found = (adjacency.get(nodeId) || []).some(visit);
    inStack.delete(nodeId);
    return found;
  };
  return nodes.some((node) => visit(node.id));
}

export function buildWorkflowReadiness(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  brandContext: BrandContext = {},
): WorkflowReadinessResult {
  const issues: WorkflowReadinessIssue[] = [];
  const nodeIds = new Set(nodes.map((node) => node.id));

  if (nodes.length === 0) {
    issues.push({
      id: 'empty-workflow',
      severity: 'blocker',
      title: '还没有工作流节点',
      detail: '至少需要一个业务步骤才能运行工作流。',
    });
  }

  const invalidEdges = edges.filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target));
  if (invalidEdges.length > 0) {
    issues.push({
      id: 'invalid-edges',
      severity: 'blocker',
      title: '存在失效连线',
      detail: `${invalidEdges.length} 条连线指向不存在的节点，运行前需要删除或重新连接。`,
      action: 'tidy_layout',
      actionLabel: '整理画布',
    });
  }

  if (nodes.length > 0 && hasWorkflowCycle(nodes, edges)) {
    issues.push({
      id: 'cycle',
      severity: 'blocker',
      title: '工作流存在循环依赖',
      detail: '当前执行引擎只支持无环流程。请删除形成闭环的连线。',
    });
  }

  const connectedNodeIds = new Set<string>();
  for (const edge of edges) {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  }
  const isolatedNodes = nodes.filter((node) => nodes.length > 1 && !connectedNodeIds.has(node.id));
  for (const node of isolatedNodes) {
    issues.push({
      id: `isolated-${node.id}`,
      severity: 'blocker',
      title: `「${node.label}」未接入流程`,
      detail: '这个节点没有任何输入或输出连线，运行时无法形成清晰的生产链路。',
      action: 'select_node',
      actionLabel: '定位节点',
      nodeId: node.id,
    });
  }

  for (const node of nodes) {
    const required = requiredConfigByType[node.type] || [];
    const config = (node.config || {}) as Record<string, unknown>;
    const missing = required.filter((field) => !hasValue(config[field.key]));
    if (missing.length > 0) {
      issues.push({
        id: `missing-config-${node.id}`,
        severity: 'blocker',
        title: `「${node.label}」配置不完整`,
        detail: `缺少 ${missing.map((field) => field.label).join('、')}。`,
        action: 'select_node',
        actionLabel: '打开配置',
        nodeId: node.id,
      });
    }
  }

  const brandScore = calculateBrandMemoryScore(brandContext);
  const missingCoreBrandFields = [
    ['brand_name', '品牌名'],
    ['audience', '目标受众'],
    ['tone', '语调'],
    ['selling_points', '主要卖点'],
  ].filter(([key]) => !hasValue(brandContext[key]));
  if (missingCoreBrandFields.length > 0 && nodes.some((node) => ['context', 'copy', 'review'].includes(node.type))) {
    issues.push({
      id: 'brand-memory-core-missing',
      severity: 'blocker',
      title: '核心品牌记忆缺失',
      detail: `缺少 ${missingCoreBrandFields.map(([, label]) => label).join('、')}，文案和审阅节点无法稳定使用项目上下文。`,
      action: 'open_brand_memory',
      actionLabel: '去项目页补齐',
    });
  } else if (brandScore.score < 50) {
    issues.push({
      id: 'brand-memory-low',
      severity: 'warning',
      title: '品牌记忆完整度偏低',
      detail: `当前完整度 ${brandScore.score}%，建议补齐禁区、渠道和参考素材以减少通用输出。`,
      action: 'open_brand_memory',
      actionLabel: '去项目页补齐',
    });
  }

  if (nodes.length > 0 && !nodes.some((node) => node.type === 'review')) {
    issues.push({
      id: 'missing-review',
      severity: 'warning',
      title: '缺少内容审阅节点',
      detail: '上线测试建议所有可发布产物都经过禁用词、品牌一致性和渠道规则检查。',
      action: 'add_review',
      actionLabel: '添加审阅节点',
    });
  }

  const modelNodeCount = nodes.filter((node) => node.type !== 'context' && node.type !== 'review').length;
  if (nodes.length > 0) {
    issues.push({
      id: 'run-estimate',
      severity: 'info',
      title: '运行预估',
      detail: `${nodes.length} 个步骤，其中约 ${modelNodeCount} 个会调用生成或检索能力。`,
    });
  }

  const blockers = issues.filter((issue) => issue.severity === 'blocker');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  const infos = issues.filter((issue) => issue.severity === 'info');

  return {
    canRun: blockers.length === 0,
    blockers,
    warnings,
    infos,
    orderedIssues: [...blockers, ...warnings, ...infos],
  };
}
