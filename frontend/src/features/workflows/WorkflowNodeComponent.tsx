import { Bot, ExternalLink, GitBranch, Image as ImageIcon, Settings2, Sparkles } from 'lucide-react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { NodeType } from './definition';
import { nodeTypeLabelKeys, presets, statusLabelKeys } from './presentation';
import { useI18n } from '../../shared/i18n';
import {
  buildWorkflowPreviewItems,
  nodeStatusDotClass,
  resolveNodeOutputDisplay,
  schemaText,
  workflowNodeRunStepLabel,
  type WorkflowPreviewItem,
} from './utils';

export interface FlowNodeData {
  [key: string]: unknown;
  label: string;
  nodeType: NodeType;
  config: Record<string, unknown>;
  output: Record<string, unknown>;
  status: string;
  errorMessage?: string;
  taskId?: number;
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  isConnectionSource?: boolean;
  isCompatibleTarget?: boolean;
  connectionModeActive?: boolean;
  readOnly?: boolean;
  onStartConnect?: (id: string) => void;
  onOpenContextMenu?: (id: string, x: number, y: number) => void;
  onOpenDetails?: (id: string, mode?: 'edit' | 'ai') => void;
}

export type FlowNode = Node<FlowNodeData>;

function PreviewTile({ item }: { item: WorkflowPreviewItem }) {
  if (item.kind === 'image' && item.url) {
    return (
      <img
        src={item.url}
        alt={item.label}
        className="h-full w-full rounded-[7px] border border-[var(--border-subtle)] bg-[var(--surface-muted)] object-cover"
      />
    );
  }
  if (item.kind === 'video' && item.url) {
    return (
      <video
        src={item.url}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full rounded-[7px] border border-[var(--border-subtle)] bg-black object-cover"
      />
    );
  }
  if (item.kind === 'audio') {
    return (
      <div className="flex h-full flex-col justify-end rounded-[7px] border border-[var(--border-subtle)] bg-[var(--surface-hover)] p-2">
        <div className="flex h-10 items-end gap-1">
          {Array.from({ length: 12 }).map((_, index) => (
            <span key={index} className="flex-1 bg-[var(--editorial-accent-blue)]/75" style={{ height: `${18 + ((index * 11) % 28)}%` }} />
          ))}
        </div>
        <span className="mt-1 truncate text-[8px] font-black text-[var(--editorial-text-gray)]">{item.label}</span>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col justify-between rounded-[7px] border border-[var(--border-subtle)] bg-[var(--surface-hover)] p-2">
      <span className="text-[8px] font-black uppercase text-[var(--editorial-text-gray)]">{item.label}</span>
      <p className="line-clamp-4 text-[10px] font-semibold leading-snug text-[var(--editorial-text-muted)]">
        {item.text || '已绑定资产'}
      </p>
    </div>
  );
}

function NodePreview({
  output,
  config,
  status,
  errorMessage,
}: {
  output: Record<string, unknown>;
  config: Record<string, unknown>;
  status: string;
  errorMessage?: string;
}) {
  const items = buildWorkflowPreviewItems(output, config);
  const display = status === 'failed' && errorMessage
    ? { kind: 'text' as const, text: errorMessage }
    : resolveNodeOutputDisplay(output, status);

  if (items.length > 0) {
    const [primary, ...rest] = items;
    return (
      <div className="mt-3 min-h-0 flex-1">
        <div className="h-[124px] overflow-hidden rounded-[8px] bg-[var(--surface-muted)]">
          <PreviewTile item={primary} />
        </div>
        {rest.length > 0 ? (
          <div className="mt-2 flex h-12 gap-1.5 overflow-hidden">
            {rest.slice(0, 5).map((item) => (
              <div key={item.id} className="h-12 w-12 shrink-0 overflow-hidden rounded-[7px]">
                <PreviewTile item={item} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3 flex min-h-[146px] flex-1 flex-col rounded-[8px] border border-dashed border-[var(--border-default)] bg-[var(--surface-hover)] p-3">
      <span className="text-[8px] font-black uppercase tracking-wide text-[var(--editorial-text-gray)]">节点产物</span>
      {display.kind === 'copy' ? (
        <div className="mt-2 min-h-0 flex-1">
          {display.title ? <h5 className="line-clamp-2 text-[13px] font-black leading-snug text-[var(--editorial-text)]">{display.title}</h5> : null}
          <p className="mt-1 line-clamp-5 text-[11px] font-semibold leading-snug text-[var(--editorial-text-muted)]">{display.body}</p>
        </div>
      ) : (
        <div className="mt-2 flex min-h-0 flex-1 items-center gap-2">
          <ImageIcon className="h-5 w-5 shrink-0 text-[var(--editorial-text-gray)]" />
          <p className={`line-clamp-5 text-[11px] font-semibold leading-snug ${status === 'failed' ? 'text-rose-600' : 'text-[var(--editorial-text-muted)]'}`}>
            {display.text}
          </p>
        </div>
      )}
    </div>
  );
}

export function WorkflowNodeComponent({ data, id, selected }: NodeProps<FlowNode>) {
  const { t } = useI18n();
  const {
    label,
    nodeType,
    status,
    output,
    config,
    errorMessage,
    inputSchema,
    outputSchema,
    isConnectionSource,
    isCompatibleTarget,
    connectionModeActive,
    onStartConnect,
    onOpenContextMenu,
    onOpenDetails,
  } = data;
  const preset = presets.find((item) => item.type === nodeType);
  const Icon = preset?.icon || Settings2;
  const statusKey = statusLabelKeys[status];
  const typeKey = nodeTypeLabelKeys[nodeType];
  const statusLabel = statusKey ? t(statusKey) : status || t('workflow.status.idle');
  const typeLabel = label || (typeKey ? t(typeKey) : preset ? t(preset.labelKey) : nodeType);
  const isDimmedTarget = connectionModeActive && !isConnectionSource && !isCompatibleTarget;
  const isActive = status === 'running' || status === 'queued';
  const inputText = schemaText(inputSchema);
  const outputText = schemaText(outputSchema);

  return (
    <div
      data-workflow-node-id={id}
      className={`workflow-node-card group h-full min-h-[300px] w-full overflow-hidden rounded-[8px] border bg-[var(--surface-elevated)] p-3 shadow-[var(--shadow-panel)] transition duration-150 ${selected ? 'workflow-node-card--selected' : ''} ${isConnectionSource ? 'workflow-node-card--source' : ''} ${isDimmedTarget ? 'opacity-40' : ''}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onOpenDetails?.(id, 'edit');
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenContextMenu?.(id, event.clientX, event.clientY);
      }}
    >
      <Handle
        id="input"
        type="target"
        position={Position.Left}
        className="!h-5 !w-5 !border-2 !border-[var(--surface-elevated)] !bg-[var(--editorial-accent-blue)] !shadow-md !transition-all group-hover:!scale-110"
        title="输入端口"
      />
      <Handle
        id="output"
        type="source"
        position={Position.Right}
        className="!h-5 !w-5 !border-2 !border-[var(--surface-elevated)] !bg-[var(--brand-accent-strong)] !shadow-md !transition-all group-hover:!scale-110"
        title="输出端口"
      />

      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-2 py-1 text-[8px] font-black text-[var(--editorial-text-gray)]">
                <Icon className="h-3 w-3" /> {typeLabel}
              </span>
              <span className={`inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-2 py-1 text-[8px] font-black ${isActive ? 'text-blue-600' : 'text-[var(--editorial-text-gray)]'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${nodeStatusDotClass(status)} ${status === 'running' ? 'animate-pulse' : ''}`} />
                {statusLabel}
              </span>
            </div>
            <h4 className="mt-2 line-clamp-2 text-[17px] font-black leading-tight text-[var(--editorial-text)]" title={typeLabel}>
              {typeLabel}
            </h4>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStartConnect?.(id);
            }}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] border border-[var(--border-default)] bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)]"
            title="从此节点开始连线"
            aria-label={`从 ${typeLabel} 开始连线`}
          >
            <GitBranch className="h-3.5 w-3.5" />
          </button>
        </header>

        <NodePreview output={output as Record<string, unknown>} config={config as Record<string, unknown>} status={status} errorMessage={errorMessage} />

        <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
          <div className="min-w-0 rounded-[7px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-2 py-1.5">
            <span className="block font-black text-[var(--editorial-text-gray)]">输入</span>
            <span className="block truncate font-semibold text-[var(--editorial-text-muted)]" title={inputText}>{inputText}</span>
          </div>
          <div className="min-w-0 rounded-[7px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-2 py-1.5">
            <span className="block font-black text-[var(--editorial-text-gray)]">输出</span>
            <span className="block truncate font-semibold text-[var(--editorial-text-muted)]" title={outputText}>{outputText}</span>
          </div>
        </div>

        <footer className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2">
          <span className="min-w-0 truncate text-[9px] font-black text-[var(--editorial-text-gray)]">{workflowNodeRunStepLabel(status)}</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenDetails?.(id, 'ai');
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)]"
              title="AI 编辑"
              aria-label={`AI 编辑 ${typeLabel}`}
            >
              <Bot className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpenDetails?.(id, 'edit');
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-[var(--border-default)] bg-[var(--surface-panel)] px-2 text-[9px] font-black hover:bg-[var(--surface-hover)]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              打开
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
