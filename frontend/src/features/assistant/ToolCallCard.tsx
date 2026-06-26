import { ArrowRight, CheckCircle2, Loader2, Wrench } from 'lucide-react';
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
 * Renders tool progress without exposing raw args/results. The
 * `navigate` tool is special-cased as an opt-in button.
 */
export function ToolCallCard({ call, onNavigate }: ToolCallCardProps) {
  if (call.name === 'navigate') {
    return <NavigateCard call={call} onNavigate={onNavigate} />;
  }
  const status = call.status || (call.result !== undefined ? 'done' : 'running');
  const Icon = status === 'running' ? Loader2 : status === 'error' ? Wrench : CheckCircle2;
  return (
    <div className={`assistant-tool assistant-tool--${status}`}>
      <Icon className={`assistant-tool__icon ${status === 'running' ? 'animate-spin' : ''}`} />
      <div>
        <div className="assistant-tool__name">{toolLabel(call.name)}</div>
        <div className="assistant-tool__summary">{toolSummary(call.name, status)}</div>
      </div>
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

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    list_projects: '查询项目',
    get_project: '读取项目详情',
    get_dashboard: '汇总仪表盘',
    create_copy: '生成文案',
  };
  return labels[name] || '执行工作区操作';
}

function toolSummary(name: string, status: 'running' | 'done' | 'error'): string {
  if (status === 'running') return '正在处理，请稍候';
  if (status === 'error') return '未能完成该步骤，助手会继续尝试给出可用回答';
  if (name === 'create_copy') return '文案生成步骤已完成';
  return '信息已读取，正在整理回复';
}
