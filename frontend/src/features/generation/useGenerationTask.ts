import { useCallback } from 'react';
import { apiFetch } from '../../hooks/useApi';
import type { GenerationTaskRecord } from '../../types/workspace';
import type { WorkspaceScope } from '../dashboard/types';
import type { VideoOutput } from './types';

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
        throw new Error('Task submit failed');
      }
      const data: { task: GenerationTaskRecord } = await res.json();
      setLatestTask(data.task);
      const task = data.task.status === 'succeeded' || data.task.status === 'failed'
        ? data.task
        : await pollGenerationTask(data.task.id);

      if (task.status === 'failed') {
        setAgentLogs(task.result?.logs || []);
        throw new Error(task.error_message || 'Queued task failed');
      }
      if (task.status !== 'succeeded') {
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
      triggerToast(successMessage, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '异步任务提交或轮询失败';
      triggerToast(message, 'error');
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
        throw new Error(errBody.error || errBody.detail || `任务提交失败 (${res.status})`);
      }
      const data: { task: GenerationTaskRecord } = await res.json();
      setLatestTask(data.task);
      setAgentLogs((prev) => [...prev, `任务 #${data.task.id} 已入队，每 3 秒轮询一次…`]);

      const task = await pollGenerationTask(
        data.task.id,
        150,
        3000,
        (current, attempt) => {
          const elapsed = Math.round((Date.now() - startedAt) / 1000);
          const statusLabel = current.status === 'running' ? '生成中' : current.status;
          onPollHint?.(`任务 #${current.id} · ${statusLabel} · 已等待 ${elapsed}s`);
          setAgentLogs((prev) => {
            const head = prev.slice(0, 3);
            return [...head, `轮询 ${attempt + 1}：${statusLabel}（${elapsed}s）`];
          });
        },
      );

      if (task.status === 'failed') {
        setAgentLogs(task.result?.logs || []);
        throw new Error(task.error_message || '视频生成失败');
      }
      if (task.status !== 'succeeded') {
        throw new Error('视频生成超时，请稍后在资产库查看');
      }

      applyResult(task.result.data as VideoOutput);
      setAgentLogs(task.result.logs || []);
      await fetchDashboard();
      await onWorkspaceRefresh?.();
      const result = task.result.data as VideoOutput;
      triggerToast(
        result.is_demo_fallback ? '演示视频已返回（非真实 API）' : '视频已生成，可在下方直接播放',
        result.is_demo_fallback ? 'info' : 'success',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '视频生成失败';
      triggerToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [pollGenerationTask, workspaceScope, username, setLoading, setAgentLogs, setLatestTask, triggerToast, fetchDashboard, onWorkspaceRefresh]);

  return { submitQueuedGeneration, submitVideoGeneration };
}
