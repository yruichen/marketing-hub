import type { ToolHandler } from './types';

/**
 * Client-side tool intents.
 *
 * Backend tools whose `result` carries `kind: 'navigate'` are NOT
 * executed here — they are surfaced as a "go to X" button on the
 * relevant ToolCallCard, and the user opts in by clicking it.
 *
 * This file only registers handlers that need to run in the browser
 * (e.g. local clipboard ops, file picker, etc.). Currently empty;
 * keep the export for the dispatch site in `useAssistantChat`.
 */
export const clientTools: Record<string, ToolHandler> = {};
