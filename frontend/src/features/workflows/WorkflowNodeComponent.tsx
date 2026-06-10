import { GitBranch, Settings2 } from 'lucide-react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { presets, statusLabels, type NodeType } from './constants';
import { nodeStatusClass, nodeStatusDotClass, resolveNodeOutputDisplay } from './utils';

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
  readOnly?: boolean;
  onStartConnect?: (id: string) => void;
  onOpenContextMenu?: (id: string, x: number, y: number) => void;
}

export type FlowNode = Node<FlowNodeData>;

function NodeResultBox({ output, status, errorMessage }: { output: Record<string, unknown>; status: string; errorMessage?: string }) {
  const isFailed = status === 'failed' && !!errorMessage;
  const display = isFailed
    ? { kind: 'text' as const, text: errorMessage! }
    : resolveNodeOutputDisplay(output, status);
  const isPending = display.kind === 'empty';

  return (
    <div
      className={`mt-2 flex-1 min-h-[76px] rounded border px-2.5 py-2 overflow-hidden flex flex-col ${
        isPending
          ? 'border-dashed border-[var(--editorial-stroke)]/50 bg-[var(--editorial-bg)]/30'
          : 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)]/60'
      }`}
    >
      <span className="text-[8px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)]/70 shrink-0">
        生成结果
      </span>
      {display.kind === 'video' ? (
        <div className="mt-1.5 flex-1 min-h-0 flex items-center gap-2">
          <video
            src={display.videoUrl}
            poster={display.thumbnailUrl}
            muted
            playsInline
            preload="metadata"
            className="h-14 w-20 shrink-0 rounded border border-[var(--editorial-stroke)]/40 object-cover bg-black"
          />
          <span className="text-[11px] leading-snug text-[var(--editorial-text)] line-clamp-3">{display.text}</span>
        </div>
      ) : display.kind === 'image' ? (
        <div className="mt-1.5 flex-1 min-h-0 flex items-center gap-2">
          <img
            src={display.imageUrl}
            alt="节点生成图片"
            className="h-14 w-14 shrink-0 rounded border border-[var(--editorial-stroke)]/40 object-cover bg-[var(--editorial-paper)]"
          />
          <span className="text-[11px] leading-snug text-[var(--editorial-text)] line-clamp-3">{display.text}</span>
        </div>
      ) : (
        <p
          className={`mt-1.5 flex-1 text-[12px] leading-snug line-clamp-4 ${
            isFailed ? 'text-rose-600' : isPending ? 'text-[var(--editorial-text-gray)]/60 italic' : 'text-[var(--editorial-text)]'
          }`}
          title={display.text}
        >
          {display.text}
        </p>
      )}
    </div>
  );
}

export function WorkflowNodeComponent({ data, id, selected }: NodeProps<FlowNode>) {
  const {
    label,
    nodeType,
    status,
    output,
    errorMessage,
    isConnectionSource,
    onStartConnect,
    onOpenContextMenu,
  } = data;
  const preset = presets.find((item) => item.type === nodeType);
  const Icon = preset?.icon || Settings2;
  const statusLabel = statusLabels[status] || status || '未运行';

  return (
    <div
      className={`group w-full h-full min-h-[188px] border-1.5 bg-[var(--editorial-paper)] shadow-editorial-sm px-3 py-2.5 overflow-hidden flex flex-col ${nodeStatusClass(status)} ${selected ? 'ring-2 ring-[var(--editorial-accent-blue)]' : ''} ${isConnectionSource ? 'ring-2 ring-blue-500 ring-offset-1 animate-pulse' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenContextMenu?.(id, e.clientX, e.clientY);
      }}
    >
      <Handle
        id="input"
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !border-2 !border-[var(--editorial-paper)] !bg-[var(--editorial-accent-blue)] !transition-all !duration-150 group-hover:!w-5 group-hover:!h-5"
        title="输入端口"
      />
      <Handle
        id="output"
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !border-2 !border-[var(--editorial-paper)] !bg-emerald-600 !transition-all !duration-150 group-hover:!w-5 group-hover:!h-5"
        title="输出端口"
      />
      <div className="flex items-start justify-between gap-2 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Icon className="h-4 w-4 shrink-0 mt-1 text-[var(--editorial-text-gray)]" aria-label={preset?.label} />
            <h4
              className="text-[20px] leading-[1.15] font-black text-[var(--editorial-text)] line-clamp-2 tracking-tight"
              title={label}
            >
              {label}
            </h4>
          </div>
          <span className="mt-1 ml-6 flex items-center gap-1 text-[9px] text-[var(--editorial-text-gray)]/80">
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${nodeStatusDotClass(status)}`} />
            <span>{statusLabel}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStartConnect?.(id);
          }}
          className="border border-[var(--editorial-stroke)] p-1.5 hover:bg-[var(--editorial-unselected)] shrink-0"
          title="连线"
          aria-label={`从 ${label} 开始连线`}
        >
          <GitBranch className="h-3.5 w-3.5" />
        </button>
      </div>
      <NodeResultBox output={output as Record<string, unknown>} status={status} errorMessage={errorMessage} />
    </div>
  );
}
