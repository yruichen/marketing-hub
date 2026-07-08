import type { GenerationTaskRecord } from '../../types/workspace';
import { resolveErrorActions, type ErrorAction } from '../../shared/api/errorActions';
import { buildUserFacingError, getUserFacingError } from '../../shared/api/errors';
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
  actions?: ErrorAction[];
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
  const body = raw instanceof Error
    ? { message: raw.message }
    : (typeof raw === 'string' ? { message: raw } : raw);
  const facing = status
    ? buildUserFacingError({ status, body, fallbackMessage: '生成任务失败。' })
    : getUserFacingError(raw, { title: '生成任务失败', message: '生成任务失败。' });
  const actions = resolveErrorActions(facing, raw);

  return {
    message: facing.title === '操作失败' ? facing.message : (facing.title || facing.message),
    detail: facing.action || facing.detail || facing.message,
    recoveryActions: facing.recoveryActions || ['检查输入是否完整', '稍后重试', '如果重复失败，请联系管理员查看任务日志'],
    actions,
    code: facing.code,
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
