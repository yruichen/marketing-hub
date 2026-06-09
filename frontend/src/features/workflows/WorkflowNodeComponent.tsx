import { GitBranch, Settings2 } from 'lucide-react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { presets, nodeTypeLabels, type NodeType } from './constants';
import { nodeStatusClass, nodeStatusDotClass, summarizeOutput, schemaText } from './utils';

export interface FlowNodeData {
  [key: string]: unknown;
  label: string;
  nodeType: NodeType;
  config: Record<string, unknown>;
  output: Record<string, unknown>;
  status: string;
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  isConnectionSource?: boolean;
  onStartConnect?: (id: string) => void;
  onOpenContextMenu?: (id: string, x: number, y: number) => void;
}

export type FlowNode = Node<FlowNodeData>;

export function WorkflowNodeComponent({ data, id, selected }: NodeProps<FlowNode>) {
  const { label, nodeType, status, output, inputSchema, outputSchema, isConnectionSource, onStartConnect, onOpenContextMenu } = data;
  const preset = presets.find((item) => item.type === nodeType);
  const Icon = preset?.icon || Settings2;
  const inputEntries = Object.entries(inputSchema || {}).slice(0, 3);
  const outputEntries = Object.entries(outputSchema || {}).slice(0, 3);

  return (
    <div
      className={`group w-full h-full border-1.5 bg-[var(--editorial-paper)] shadow-editorial-sm p-3 overflow-hidden ${nodeStatusClass(status)} ${selected ? 'ring-2 ring-[var(--editorial-accent-blue)]' : ''} ${isConnectionSource ? 'ring-2 ring-blue-500 ring-offset-1 animate-pulse' : ''}`}
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
        title="输出端口 — 拖拽到目标节点创建连线"
      />
      <div className="flex items-start justify-between gap-2 border-b border-dashed border-[var(--editorial-stroke)]/40 pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0" />
            <h4 className="text-xs font-black truncate">{label}</h4>
          </div>
          <span className="mt-1 flex items-center gap-1 text-[10px] text-[var(--editorial-text-gray)]">
            <span className={`h-1.5 w-1.5 rounded-full ${nodeStatusDotClass(status)}`} />
            {nodeTypeLabels[nodeType] || nodeType} / {status || '未运行'}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStartConnect?.(id);
          }}
          className="border border-[var(--editorial-stroke)] p-1 hover:bg-[var(--editorial-unselected)]"
          title="连线"
          aria-label={`从 ${label} 开始连线`}
        >
          <GitBranch className="h-3 w-3" />
        </button>
      </div>
      <pre className="mt-2 h-[70px] overflow-hidden whitespace-pre-wrap text-[10px] leading-relaxed text-[var(--editorial-text-gray)]">
        {summarizeOutput(output as Record<string, unknown>)}
      </pre>
      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-[var(--editorial-text-gray)]">
        <div className="min-w-0 border border-[var(--editorial-stroke)]/20 px-1.5 py-1">
          <span className="block font-black text-[var(--editorial-text)]">输入</span>
          <span className="block truncate" title={schemaText(inputSchema)}>{inputEntries.length ? inputEntries.map(([key]) => key).join(' / ') : '无'}</span>
        </div>
        <div className="min-w-0 border border-[var(--editorial-stroke)]/20 px-1.5 py-1">
          <span className="block font-black text-[var(--editorial-text)]">输出</span>
          <span className="block truncate" title={schemaText(outputSchema)}>{outputEntries.length ? outputEntries.map(([key]) => key).join(' / ') : '无'}</span>
        </div>
      </div>
    </div>
  );
}
