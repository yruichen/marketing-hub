import { ArrowRight } from 'lucide-react';
import type { AssistantToolCall } from './types';
import { NAV_TAB_LABELS } from './navTargets';
import './assistant.css';

interface ToolCallCardProps {
  call: AssistantToolCall;
  onNavigate: (
    tab: string,
    projectId?: number,
    assetId?: number,
    reason?: string,
  ) => void;
}

/**
 * Renders a single tool_call + its result. The `navigate` tool is
 * special-cased: instead of dumping the JSON, we render a "Go to X"
 * button so the user opts in to the jump.
 */
export function ToolCallCard({ call, onNavigate }: ToolCallCardProps) {
  if (call.name === 'navigate') {
    return <NavigateCard call={call} onNavigate={onNavigate} />;
  }
  return (
    <div className="assistant-tool">
      <div className="assistant-tool__name">→ {call.name}</div>
      {Object.keys(call.args).length > 0 ? (
        <div className="assistant-tool__args">
          {truncate(JSON.stringify(call.args))}
        </div>
      ) : null}
      {call.result !== undefined ? (
        <div className="assistant-tool__result">
          {typeof call.result === 'string'
            ? call.result
            : truncate(JSON.stringify(call.result))}
        </div>
      ) : null}
    </div>
  );
}

function NavigateCard({ call, onNavigate }: ToolCallCardProps) {
  const tab = typeof call.args.tab === 'string' ? call.args.tab : '';
  const projectId =
    typeof call.args.project_id === 'number' ? call.args.project_id : undefined;
  const assetId =
    typeof call.args.asset_id === 'number' ? call.args.asset_id : undefined;
  const reason = typeof call.args.reason === 'string' ? call.args.reason : '';
  const label = NAV_TAB_LABELS[tab] ?? tab;

  return (
    <button
      type="button"
      className="assistant-navbtn"
      onClick={() => onNavigate(tab, projectId, assetId, reason)}
      disabled={!tab}
    >
      <ArrowRight className="h-3 w-3 assistant-navbtn__arrow" />
      <span className="assistant-navbtn__label">跳到「{label}」</span>
      {reason ? <span className="assistant-navbtn__reason">{reason}</span> : null}
    </button>
  );
}

function truncate(s: string, n = 200): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
