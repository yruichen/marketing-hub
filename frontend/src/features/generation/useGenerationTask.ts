import { useCallback } from 'react';
import { apiFetch } from '../../hooks/useApi';
import type { GenerationTaskRecord } from '../../types/workspace';
import type { WorkspaceScope } from '../dashboard/types';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

interface SubmitOptions {
  setLoading: (loading: boolean) => void;
  setAgentLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setLatestTask: (task: GenerationTaskRecord) => void;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
  workspaceScope: WorkspaceScope | null;
  username: string | null;
  fetchDashboard: () => Promise<void>;
}

export function useGenerationTask({
  setLoading,
  setAgentLogs,
  setLatestTask,
  triggerToast,
  workspaceScope,
  username,
  fetchDashboard,
}: SubmitOptions) {
  const pollGenerationTask = useCallback(async (taskId: number): Promise<GenerationTaskRecord> => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const res = await apiFetch(`/tasks/${taskId}/`);
      if (!res.ok) {
        throw new Error('Task polling failed');
      }
      const task: GenerationTaskRecord = await res.json();
      setLatestTask(task);
      if (task.status === 'succeeded' || task.status === 'failed') {
        return task;
      }
      await wait(900);
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
          username: username || 'ROOT',
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
    } catch {
      triggerToast('异步任务提交或轮询失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [pollGenerationTask, workspaceScope, username, setLoading, setAgentLogs, setLatestTask, triggerToast, fetchDashboard]);

  return { submitQueuedGeneration };
}