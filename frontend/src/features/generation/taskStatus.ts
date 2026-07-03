import type { GenerationTaskRecord } from '../../types/workspace';
import { taskTypeLabels } from './types';

export type GenerationTaskPhase =
  | 'idle'
  | 'submitting'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timeout';

export interface GenerationTaskUiState {
  phase: GenerationTaskPhase;
  task: GenerationTaskRecord | null;
  title: string;
  message: string;
  detail?: string;
  recoveryActions?: string[];
  startedAt?: number;
}

export const idleTaskUiState: GenerationTaskUiState = {
  phase: 'idle',
  task: null,
  title: '',
  message: '',
};

const expectedDurations: Record<string, string> = {
  copy: '通常 5-20 秒',
  image: '通常 15-60 秒',
  storyboard: '通常 5-30 秒',
  audio: '通常 10-60 秒',
  video: '通常 2-5 分钟',
  review: '通常 5-20 秒',
  rag_search: '通常 3-10 秒',
  custom_agent: '通常 10-60 秒',
};

export function taskDisplayName(taskType: string) {
  return taskTypeLabels[taskType] ?? taskType;
}

export function expectedTaskDuration(taskType?: string) {
  if (!taskType) return '耗时取决于输入长度和模型队列';
  return expectedDurations[taskType] ?? '耗时取决于输入长度和模型队列';
}

export function phaseFromTaskStatus(status: GenerationTaskRecord['status']): GenerationTaskPhase {
  if (status === 'queued') return 'queued';
  if (status === 'running') return 'running';
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed') return 'failed';
  return 'idle';
}

export function explainGenerationError(raw: unknown, status?: number) {
  const text = raw instanceof Error ? raw.message : String(raw || '生成任务失败');
  const lowered = text.toLowerCase();

  if (
    lowered.includes('legal policies require consent')
    || lowered.includes('requires consent')
    || lowered.includes('policy consent')
    || lowered.includes('consent')
    || lowered.includes('条款')
    || lowered.includes('隐私政策')
  ) {
    return {
      message: '需要先同意最新条款。',
      detail: '当前账号还没有完成服务条款、隐私政策或 AI 使用规则确认。',
      recoveryActions: ['点击页面顶部的「同意并继续」', '确认后重新提交生成任务', '如果没有看到提示，请刷新页面后再试'],
    };
  }
  if (status === 401 || status === 403 || lowered.includes('permission') || lowered.includes('csrf')) {
    return {
      message: '登录状态或项目权限异常。',
      detail: '当前账号可能没有访问这个项目，或登录会话已经过期。',
      recoveryActions: ['重新登录后再试', '确认当前项目属于你的工作区', '让管理员检查你的成员角色'],
    };
  }
  if (status === 402 || lowered.includes('quota') || lowered.includes('credit') || lowered.includes('额度')) {
    return {
      message: '当前额度不足，任务没有继续执行。',
      detail: '系统已阻止继续消耗模型额度。',
      recoveryActions: ['查看计费页余额', '联系管理员发放测试额度', '切换到自有 API Key'],
    };
  }
  if (status === 429 || lowered.includes('rate') || lowered.includes('too many')) {
    return {
      message: '请求过于频繁，系统正在保护任务队列。',
      detail: '短时间内提交了太多生成请求。',
      recoveryActions: ['稍后重试', '等待当前任务完成', '减少连续点击提交'],
    };
  }
  if (lowered.includes('timeout') || lowered.includes('abort') || lowered.includes('超时')) {
    return {
      message: '模型响应超时。',
      detail: '输入可能过长，或当前模型服务拥堵。',
      recoveryActions: ['缩短输入内容', '稍后重试', '在 AI 设置里切换模型'],
    };
  }
  if (lowered.includes('provider') || lowered.includes('api key') || lowered.includes('401') || lowered.includes('403')) {
    return {
      message: '模型服务配置可能不可用。',
      detail: 'Provider、API Key 或模型名称需要管理员检查。',
      recoveryActions: ['前往 AI 设置检查密钥', '换一个模型后重试', '联系管理员查看后台错误'],
    };
  }

  return {
    message: '生成任务失败。',
    detail: text,
    recoveryActions: ['检查输入是否完整', '稍后重试', '如果重复失败，请联系管理员查看任务日志'],
  };
}

export function taskProgressMessage(task: GenerationTaskRecord, attempt?: number) {
  const label = taskDisplayName(task.task_type);
  if (task.status === 'queued') {
    return {
      title: `${label}任务已进入队列`,
      message: '正在等待 worker 处理。',
      detail: `预计耗时：${expectedTaskDuration(task.task_type)}${typeof attempt === 'number' ? ` · 第 ${attempt + 1} 次检查` : ''}`,
    };
  }
  if (task.status === 'running') {
    return {
      title: `${label}任务运行中`,
      message: '正在根据当前项目和品牌记忆生成内容。',
      detail: `预计耗时：${expectedTaskDuration(task.task_type)}${typeof attempt === 'number' ? ` · 第 ${attempt + 1} 次检查` : ''}`,
    };
  }
  if (task.status === 'succeeded') {
    return {
      title: `${label}任务已完成`,
      message: '结果已返回，可继续审阅、复制或沉淀到资产库。',
      detail: task.cost_usd ? `本次记录成本 $${task.cost_usd}` : undefined,
    };
  }
  return {
    title: `${label}任务失败`,
    message: '任务没有成功完成。',
    detail: task.error_message || '请根据下方建议处理后重试。',
  };
}
