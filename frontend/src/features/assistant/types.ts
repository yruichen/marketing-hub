import type { AssetType } from '../../types/workspace';

export interface AssistantSession {
  id: number;
  title: string;
  context_snapshot: Record<string, unknown>;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_calls: AssistantToolCall[];
  tool_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AssistantToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status?: 'running' | 'done' | 'error';
}

export interface PageContext {
  tab?: string;
  projectId?: number;
  campaignId?: number;
  assetId?: number;
  assetType?: AssetType;
  route?: string;
  [key: string]: unknown;
}

export interface AssistantSseEvent {
  type: 'status' | 'text' | 'tool_call' | 'tool_result' | 'done' | 'error';
  delta?: string;
  status_text?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  status?: number;
  session_id?: number;
}

/**
 * Browser-side tool handler. Returns a JSON-serializable result that
 * gets attached to the corresponding tool_call card. Used for
 * intents the backend can't run (clipboard, file picker, etc.).
 */
export type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * Local chat-state shape used by the UI. Mapped from AssistantMessage
 * by AssistantPanel when loading history, and built up locally while
 * streaming.
 */
export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  toolCalls: AssistantToolCall[];
  pending?: boolean;
  statusText?: string;
}
