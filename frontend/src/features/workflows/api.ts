import {
  apiFetch,
  apiGet,
  apiPatch,
  apiPost,
  parseApiErrorResponse,
} from '../../shared/api/client';
import type {
  BrandContext,
  GenerationTaskRecord,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRunRecord,
  WorkspaceDraftRecord,
  WorkflowAiEditResponse,
} from '../../types/workspace';
import type { ProjectDetail } from './types';

export type SaveWorkflowDraftInput = {
  project_id: number;
  campaign_id?: number;
  name: string;
  brand_context: BrandContext;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selected_node_id: string;
  status: 'draft';
};

export type WorkflowRunStartResponse = {
  workflow_run: WorkflowRunRecord;
  draft: WorkspaceDraftRecord;
  tasks: GenerationTaskRecord[];
};

export type WorkflowRetryResponse = {
  draft: WorkspaceDraftRecord;
  task: GenerationTaskRecord | null;
  workflow_run?: WorkflowRunRecord;
};

export const workflowApi = {
  getDraft: (draftId: number | string) => apiGet<WorkspaceDraftRecord>(`/drafts/${draftId}/`),
  getProject: (projectId: number) => apiGet<ProjectDetail>(`/projects/${projectId}/`),
  getRun: (workflowRunId: number) => apiGet<WorkflowRunRecord>(`/workflow-runs/${workflowRunId}/`),
  getTask: (taskId: number) => apiGet<GenerationTaskRecord>(`/tasks/${taskId}/`),
  getTasks: async (taskIds: number[]) => {
    const tasks = await Promise.all(taskIds.map((taskId) => (
      apiGet<GenerationTaskRecord>(`/tasks/${taskId}/`).catch(() => null)
    )));
    return tasks.filter((task): task is GenerationTaskRecord => task !== null);
  },
  saveDraft: (draftId: number | null, input: SaveWorkflowDraftInput) => (
    draftId
      ? apiPatch<WorkspaceDraftRecord>(`/drafts/${draftId}/`, input)
      : apiPost<WorkspaceDraftRecord>('/drafts/', input)
  ),
  startRun: (draftId: number, username: string) => apiPost<WorkflowRunStartResponse>(
    `/drafts/${draftId}/run/`,
    { username, async: true },
  ),
  editWithAi: (draftId: number, input: {
    mode: 'node' | 'workflow';
    instruction: string;
    node_id: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    brand_context: BrandContext;
  }) => apiPost<WorkflowAiEditResponse>(`/drafts/${draftId}/ai-edit/`, input),
  retryNode: async (
    draftId: number,
    nodeId: string,
    input: { username: string; feedback: string },
    idempotencyKey: string,
  ): Promise<WorkflowRetryResponse> => {
    const path = `/drafts/${draftId}/nodes/${nodeId}/retry/`;
    const response = await apiFetch(path, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw await parseApiErrorResponse(response, path);
    return response.json() as Promise<WorkflowRetryResponse>;
  },
};
