import { useCallback } from 'react';
import { useState } from 'react';
import { apiFetch } from '../../hooks/useApi';
import type { GenerationTaskRecord } from '../../types/workspace';
import type { WorkspaceScope } from '../dashboard/types';
import type { VideoOutput } from './types';
import {
  explainGenerationError,
  idleTaskUiState,
  phaseFromTaskStatus,
  taskDisplayName,
  taskProgressMessage,
  type GenerationTaskUiState,
} from './taskStatus';

const DEMO_USERNAME = import.meta.env.VITE_DEMO_USERNAME || 'DEMO';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

interface SubmitOptions {
  setLoading: (loading: boolean) => void;
  setAgentLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setLatestTask: (task: GenerationTaskRecord) => void;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  fetchDashboard: () => Promise<void>;
  onWorkspaceRefresh?: () => Promise<void>;
}

export function useGenerationTask({
  setLoading,
  setAgentLogs,
  setLatestTask,
  triggerToast,
  workspaceScope,
  username,
  fetchDashboard,
  onWorkspaceRefresh,
}: SubmitOptions) {
  const [taskUiState, setTaskUiState] = useState<GenerationTaskUiState>(idleTaskUiState);

  const pollGenerationTask = useCallback(async (
    taskId: number,
    maxAttempts = 30,
    intervalMs = 900,
    onTick?: (task: GenerationTaskRecord, attempt: number) => void,
  ): Promise<GenerationTaskRecord> => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const res = await apiFetch(`/tasks/${taskId}/`);
      if (!res.ok) {
        throw new Error('Task polling failed');
      }
      const task: GenerationTaskRecord = await res.json();
      setLatestTask(task);
      const progress = taskProgressMessage(task, attempt);
      setTaskUiState({
        phase: phaseFromTaskStatus(task.status),
        task,
        title: progress.title,
        message: progress.message,
        detail: progress.detail,
      });
      onTick?.(task, attempt);
      if (task.status === 'succeeded' || task.status === 'failed') {
        return task;
      }
      await wait(intervalMs);
    }
    const res = await apiFetch(`/tasks/${taskId}/`);
    if (!res.ok) {
      throw new Error('Task polling failed');
    }
    const task: GenerationTaskRecord = await res.json();
    setLatestTask(task);
    const progress = taskProgressMessage(task);
    setTaskUiState({
      phase: phaseFromTaskStatus(task.status),
      task,
      title: progress.title,
      message: progress.message,
      detail: progress.detail,
    });
    return task;
  }, [setLatestTask]);

  const submitQueuedGeneration = useCallback(async <T,>(
    taskType: GenerationTaskRecord['task_type'],
    payload: Record<string, unknown>,
    applyResult: (result: T) => void,
    initialLog: string,
    successMessage: string,
  ) => {
    setLoading(true);
    setTaskUiState({
      phase: 'submitting',
      task: null,
      title: `${taskDisplayName(taskType)}任务正在提交`,
      message: '正在保存输入并创建生成任务。',
      detail: '提交成功后会显示任务编号和实时状态。',
      startedAt: Date.now(),
    });
    setAgentLogs([initialLog, '正在连接 AI 并生成，请稍候…']);
    try {
      const res = await apiFetch('/tasks/', {
        method: 'POST',
        body: JSON.stringify({
          task_type: taskType,
          payload,
          username: username || DEMO_USERNAME,
          organization: workspaceScope?.organization.slug,
          project: workspaceScope?.project.slug,
          campaign: workspaceScope?.campaign.id,
          run_now: true,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errorInfo = explainGenerationError(errBody.error || errBody.detail || `任务提交失败 (${res.status})`, res.status);
        setTaskUiState({
          phase: 'failed',
          task: null,
          title: errorInfo.message,
          message: errorInfo.detail,
          recoveryActions: errorInfo.recoveryActions,
        });
        throw new Error(errorInfo.message);
      }
      const data: { task: GenerationTaskRecord } = await res.json();
      setLatestTask(data.task);
      const createdProgress = taskProgressMessage(data.task);
      setTaskUiState({
        phase: phaseFromTaskStatus(data.task.status),
        task: data.task,
        title: createdProgress.title,
        message: createdProgress.message,
        detail: createdProgress.detail,
        startedAt: Date.now(),
      });
      const task = data.task.status === 'succeeded' || data.task.status === 'failed'
        ? data.task
        : await pollGenerationTask(data.task.id);

      if (task.status === 'failed') {
        setAgentLogs(task.result?.logs || []);
        const errorInfo = explainGenerationError(task.error_message || 'Queued task failed');
        setTaskUiState({
          phase: 'failed',
          task,
          title: errorInfo.message,
          message: errorInfo.detail,
          recoveryActions: errorInfo.recoveryActions,
        });
        throw new Error(errorInfo.message);
      }
      if (task.status !== 'succeeded') {
        setTaskUiState({
          phase: 'timeout',
          task,
          title: `${taskDisplayName(task.task_type)}任务仍未完成`,
          message: '系统已经停止自动轮询，任务可能仍在后台运行。',
          detail: `当前状态：${task.status}。可稍后从任务中心或首页继续查看。`,
          recoveryActions: ['稍后刷新任务状态', '确认 worker 是否运行', '如果重复卡住，请联系管理员查看队列'],
        });
        setAgentLogs((prev) => [
          ...prev,
          `任务 #${task.id} 状态：${task.status}。若长时间无结果，请检查后端是否在运行。`,
        ]);
        triggerToast('生成未完成，请稍后重试', 'error');
        return;
      }

      const result = task.result.data as T;
      applyResult(result);
      setAgentLogs(task.result.logs || []);
      fetchDashboard();
      const successProgress = taskProgressMessage(task);
      setTaskUiState({
        phase: 'succeeded',
        task,
        title: successProgress.title,
        message: successProgress.message,
        detail: successProgress.detail,
      });
      triggerToast(successMessage, 'success');
    } catch (err) {
      const errorInfo = explainGenerationError(err);
      setTaskUiState((prev) => prev.phase === 'failed' || prev.phase === 'timeout'
        ? prev
        : {
            phase: 'failed',
            task: prev.task,
            title: errorInfo.message,
            message: errorInfo.detail,
            recoveryActions: errorInfo.recoveryActions,
          });
      triggerToast(errorInfo.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [pollGenerationTask, workspaceScope, username, setLoading, setAgentLogs, setLatestTask, triggerToast, fetchDashboard]);

  const submitVideoGeneration = useCallback(async (
    payload: Record<string, unknown>,
    applyResult: (result: VideoOutput) => void,
    onPollHint?: (hint: string) => void,
  ) => {
    setLoading(true);
    setTaskUiState({
      phase: 'submitting',
      task: null,
      title: '视频任务正在提交',
      message: '正在创建长视频生成任务。',
      detail: '视频通常需要 2-5 分钟，页面刷新后仍可在任务中心查看。',
      startedAt: Date.now(),
    });
    setAgentLogs(['[0.00s] [INFO] 提交 Agnes 视频任务…', '视频生成通常需要 2–5 分钟，请保持页面打开。']);
    const startedAt = Date.now();
    try {
      const res = await apiFetch('/tasks/', {
        method: 'POST',
        body: JSON.stringify({
          task_type: 'video',
          payload,
          username: username || DEMO_USERNAME,
          organization: workspaceScope?.organization.slug,
          project: workspaceScope?.project.slug,
          campaign: workspaceScope?.campaign.id,
          run_now: false,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errorInfo = explainGenerationError(errBody.error || errBody.detail || `任务提交失败 (${res.status})`, res.status);
        setTaskUiState({
          phase: 'failed',
          task: null,
          title: errorInfo.message,
          message: errorInfo.detail,
          recoveryActions: errorInfo.recoveryActions,
        });
        throw new Error(errorInfo.message);
      }
      const data: { task: GenerationTaskRecord } = await res.json();
      setLatestTask(data.task);
      const createdProgress = taskProgressMessage(data.task);
      setTaskUiState({
        phase: phaseFromTaskStatus(data.task.status),
        task: data.task,
        title: createdProgress.title,
        message: createdProgress.message,
        detail: createdProgress.detail,
        startedAt,
      });
      setAgentLogs((prev) => [...prev, `任务 #${data.task.id} 已入队，每 3 秒轮询一次…`]);

      const task = await pollGenerationTask(
        data.task.id,
        150,
        3000,
        (current, attempt) => {
          const elapsed = Math.round((Date.now() - startedAt) / 1000);
          const statusLabel = current.status === 'running' ? '生成中' : current.status;
          onPollHint?.(`任务 #${current.id} · ${statusLabel} · 已等待 ${elapsed}s`);
          const progress = taskProgressMessage(current, attempt);
          setTaskUiState({
            phase: phaseFromTaskStatus(current.status),
            task: current,
            title: progress.title,
            message: progress.message,
            detail: `${progress.detail || ''} · 已等待 ${elapsed}s`.trim(),
            startedAt,
          });
          setAgentLogs((prev) => {
            const head = prev.slice(0, 3);
            return [...head, `轮询 ${attempt + 1}：${statusLabel}（${elapsed}s）`];
          });
        },
      );

      if (task.status === 'failed') {
        setAgentLogs(task.result?.logs || []);
        const errorInfo = explainGenerationError(task.error_message || '视频生成失败');
        setTaskUiState({
          phase: 'failed',
          task,
          title: errorInfo.message,
          message: errorInfo.detail,
          recoveryActions: errorInfo.recoveryActions,
        });
        throw new Error(errorInfo.message);
      }
      if (task.status !== 'succeeded') {
        setTaskUiState({
          phase: 'timeout',
          task,
          title: '视频任务仍未完成',
          message: '系统已经停止自动轮询，任务可能仍在后台运行。',
          detail: `当前状态：${task.status}。可稍后从任务中心或资产库查看。`,
          recoveryActions: ['稍后刷新任务状态', '确认 worker 是否运行', '如果重复卡住，请联系管理员查看视频队列'],
        });
        throw new Error('视频生成超时，请稍后在资产库查看');
      }

      applyResult(task.result.data as VideoOutput);
      setAgentLogs(task.result.logs || []);
      await fetchDashboard();
      await onWorkspaceRefresh?.();
      const result = task.result.data as VideoOutput;
      const successProgress = taskProgressMessage(task);
      setTaskUiState({
        phase: 'succeeded',
        task,
        title: successProgress.title,
        message: result.is_demo_fallback ? '已返回演示视频，未调用真实视频模型。' : successProgress.message,
        detail: result.is_demo_fallback ? '请在 AI 设置检查 Agnes 视频模型配置。' : successProgress.detail,
        recoveryActions: result.is_demo_fallback ? ['前往 AI 设置检查 API Key', '确认视频模型名称', '重新运行视频任务'] : undefined,
      });
      triggerToast(
        result.is_demo_fallback ? '演示视频已返回（非真实 API）' : '视频已生成，可在下方直接播放',
        result.is_demo_fallback ? 'info' : 'success',
      );
    } catch (err) {
      const errorInfo = explainGenerationError(err);
      setTaskUiState((prev) => prev.phase === 'failed' || prev.phase === 'timeout'
        ? prev
        : {
            phase: 'failed',
            task: prev.task,
            title: errorInfo.message,
            message: errorInfo.detail,
            recoveryActions: errorInfo.recoveryActions,
          });
      triggerToast(errorInfo.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [pollGenerationTask, workspaceScope, username, setLoading, setAgentLogs, setLatestTask, triggerToast, fetchDashboard, onWorkspaceRefresh]);

  return { submitQueuedGeneration, submitVideoGeneration, taskUiState };
}
