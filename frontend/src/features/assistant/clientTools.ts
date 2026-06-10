import type { ToolHandler } from './types';

/**
 * Tools that the backend returns as `kind: 'navigate'`. The frontend
 * intercepts these client-side and runs the actual navigation —
 * no backend state changes.
 *
 * New client-side tools are registered here. They MUST be idempotent
 * (the backend may retry the same tool_call_id).
 */
export const clientTools: Record<string, ToolHandler> = {
  navigate: async (args) => ({
    kind: 'navigate',
    tab: String(args.tab ?? ''),
    project_id: typeof args.project_id === 'number' ? args.project_id : undefined,
    asset_id: typeof args.asset_id === 'number' ? args.asset_id : undefined,
    reason: typeof args.reason === 'string' ? args.reason : '',
  }),
};

export function isClientTool(name: string): boolean {
  return Object.hasOwn(clientTools, name);
}
