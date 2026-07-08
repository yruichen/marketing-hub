import type { ErrorAction } from '../../shared/api/errorActions';
import type { WorkflowEdge, WorkflowNode } from '../../types/workspace';
import { schemaText } from './utils';

export type FailureKind = 'missing_input' | 'schema_mismatch' | 'model_timeout' | 'quota' | 'provider' | 'permission' | 'unknown';

export interface FailureRecovery {
  kind: FailureKind;
  title: string;
  explanation: string;
  primaryAction: string;
  secondaryAction: string;
}

const FAILURE_PATTERNS: Array<{ kind: FailureKind; patterns: RegExp[] }> = [
  { kind: 'missing_input', patterns: [/\bmissing\b|\brequired\s+(field|input|tone|param)|\bblank\b|\bempty\b|缺少|必填|为空/i] },
  { kind: 'schema_mismatch', patterns: [/schema|contract|compatible|mismatch|不能被当前步骤使用|输出不匹配|类型/i] },
  { kind: 'model_timeout', patterns: [/timeout|timed out|超时|deadline/i] },
  { kind: 'quota', patterns: [/quota|credit|billing|limit|余额|额度|扣费/i] },
  { kind: 'permission', patterns: [/permission|forbidden|unauthorized|403|权限/i] },
  { kind: 'provider', patterns: [/provider|openai|anthropic|gemini|agnes|gateway|service unavailable|502|503|模型|供应商/i] },
];

const RECOVERY_COPY: Record<FailureKind, FailureRecovery> = {
  missing_input: {
    kind: 'missing_input',
    title: '缺少必要输入',
    explanation: '这个步骤没有拿到必需配置或上游产物，继续重试通常不会成功。',
    primaryAction: '打开配置并补齐字段',
    secondaryAction: '复制输入快照给团队排查',
  },
  schema_mismatch: {
    kind: 'schema_mismatch',
    title: '上游输出不匹配',
    explanation: '上一步产物结构和当前节点需要的输入不一致，需要检查连线或输出字段。',
    primaryAction: '查看上游输出并调整连线',
    secondaryAction: '从修正后的节点向后重跑',
  },
  model_timeout: {
    kind: 'model_timeout',
    title: '模型响应超时',
    explanation: '模型服务可能繁忙，或输入过长导致处理时间超过限制。',
    primaryAction: '缩短输入后重试',
    secondaryAction: '从此节点向后重跑',
  },
  quota: {
    kind: 'quota',
    title: '额度或限制不足',
    explanation: '本次生成可能触发额度、频率或计费限制。',
    primaryAction: '查看订阅与额度',
    secondaryAction: '降低高成本节点后重试',
  },
  provider: {
    kind: 'provider',
    title: '模型服务异常',
    explanation: '外部模型或网关返回异常，通常可以稍后重试或切换模型配置。',
    primaryAction: '打开 AI 设置',
    secondaryAction: '切换模型后向后重跑',
  },
  permission: {
    kind: 'permission',
    title: '权限不足',
    explanation: '当前账号没有执行这个恢复操作或访问相关资源的权限。',
    primaryAction: '返回首页',
    secondaryAction: '复制错误信息给管理员',
  },
  unknown: {
    kind: 'unknown',
    title: '执行失败',
    explanation: '当前错误无法自动归类，需要查看输入、上游输出和任务记录。',
    primaryAction: '复制诊断快照',
    secondaryAction: '从此节点向后重跑',
  },
};

export function classifyWorkflowFailure(message = ''): FailureRecovery {
  const match = FAILURE_PATTERNS.find((item) => item.patterns.some((pattern) => pattern.test(message)));
  return RECOVERY_COPY[match?.kind || 'unknown'];
}

const KIND_APP_ACTIONS: Partial<Record<FailureKind, ErrorAction[]>> = {
  quota: [{ id: 'open_billing', label: '查看订阅方案', primary: true, section: 'billing' }],
  provider: [{ id: 'open_ai_config', label: '打开 AI 设置', primary: true, section: 'config' }],
  permission: [{ id: 'open_dashboard', label: '返回首页', primary: true, section: 'dashboard' }],
};

export function workflowFailureAppActions(kind: FailureKind): ErrorAction[] {
  return KIND_APP_ACTIONS[kind] || [];
}

export function upstreamNodeIds(nodeId: string, edges: WorkflowEdge[]) {
  return edges.filter((edge) => edge.target === nodeId).map((edge) => edge.source);
}

export function downstreamNodeIds(nodeId: string, edges: WorkflowEdge[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  const queue = edges.filter((edge) => edge.source === nodeId).map((edge) => edge.target);
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    result.push(next);
    queue.push(...edges.filter((edge) => edge.source === next).map((edge) => edge.target));
  }
  return result;
}

export function buildNodeDiagnosticSnapshot(node: WorkflowNode, nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  const upstream = upstreamNodeIds(node.id, edges)
    .map((id) => nodes.find((item) => item.id === id))
    .filter(Boolean) as WorkflowNode[];
  const downstream = downstreamNodeIds(node.id, edges)
    .map((id) => nodes.find((item) => item.id === id)?.label || id);

  return {
    node: {
      id: node.id,
      label: node.label,
      type: node.type,
      status: node.status || 'idle',
      error_message: node.error_message || '',
      config: node.config || {},
      input_schema: schemaText(node.input_schema),
      output_schema: schemaText(node.output_schema),
    },
    upstream: upstream.map((item) => ({
      id: item.id,
      label: item.label,
      status: item.status || 'idle',
      output: item.output || {},
    })),
    downstream,
  };
}

export function formatNodeDiagnosticSnapshot(node: WorkflowNode, nodes: WorkflowNode[], edges: WorkflowEdge[]) {
  return JSON.stringify(buildNodeDiagnosticSnapshot(node, nodes, edges), null, 2);
}
