import type { AssetType } from '../../types/workspace';

export interface AssistantSession {
  id: number;
  title: string;
  context_snapshot: Record<string, unknown>;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssistantToolCall {
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
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
  type: 'text' | 'tool_call' | 'tool_result' | 'done' | 'error';
  delta?: string;
  name?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  session_id?: number;
}

export type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<{ kind: 'navigate'; tab: string; project_id?: number; asset_id?: number; reason?: string }>;
