import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Copy, ExternalLink, RotateCcw, Trash2, X } from 'lucide-react';
import type { WorkflowNode } from '../../types/workspace';
import { buildWorkflowPreviewItems, resolveNodeOutputDisplay, schemaText } from './utils';
import { nodeTypeLabels, statusLabels } from './constants';
import { NodeConfigFields } from './NodeConfigFields';

type DetailMode = 'edit' | 'ai';

interface WorkflowNodeDetailDialogProps {
  node: WorkflowNode | null;
  mode: DetailMode;
  readOnly: boolean;
  loadingState: string;
  onClose: () => void;
  onUpdateNode: (id: string, patch: Partial<WorkflowNode>) => void;
  onCopyNodeDiagnostics: (id: string) => void;
  onApplyAiEdit: (id: string, instruction: string, runAfter: boolean) => void;
  onRemoveNode: () => void;
}

function formatJson(value: unknown) {
  if (!value || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0)) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function NodeOutputPreview({ node }: { node: WorkflowNode }) {
  const items = buildWorkflowPreviewItems(node.output, node.config as Record<string, unknown>);
  const display = resolveNodeOutputDisplay(node.output, node.status);
  if (items.length > 0) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.id} className="overflow-hidden rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-hover)]">
            {item.kind === 'image' && item.url ? (
              <img src={item.url} alt={item.label} className="h-44 w-full object-cover" />
            ) : item.kind === 'video' && item.url ? (
              <video src={item.url} controls className="h-44 w-full bg-black object-cover" />
            ) : item.kind === 'audio' && item.url ? (
              <div className="p-3">
                <audio src={item.url} controls className="w-full" />
              </div>
            ) : (
              <div className="p-3">
                <span className="text-[9px] font-black uppercase text-[var(--editorial-text-gray)]">{item.label}</span>
                <p className="mt-2 whitespace-pre-wrap text-[11px] font-semibold leading-relaxed text-[var(--editorial-text-muted)]">{item.text || '已绑定资产'}</p>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-2.5 py-2">
              <span className="truncate text-[9px] font-black text-[var(--editorial-text-gray)]">{item.label}</span>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[9px] font-black text-[var(--editorial-accent-blue)]">
                  打开 <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-hover)] p-3">
      <span className="text-[9px] font-black uppercase text-[var(--editorial-text-gray)]">输出预览</span>
      <p className="mt-2 whitespace-pre-wrap text-[11px] font-semibold leading-relaxed text-[var(--editorial-text-muted)]">
        {display.kind === 'copy' ? [display.title, display.body].filter(Boolean).join('\n\n') : display.text}
      </p>
    </div>
  );
}

export function WorkflowNodeDetailDialog({
  node,
  mode,
  readOnly,
  loadingState,
  onClose,
  onUpdateNode,
  onCopyNodeDiagnostics,
  onApplyAiEdit,
  onRemoveNode,
}: WorkflowNodeDetailDialogProps) {
  const [activeTab, setActiveTab] = useState<DetailMode>(mode);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [aiInstruction, setAiInstruction] = useState(() => String(node?.config?.ai_edit_instruction || ''));

  const referenceUrlsText = (() => {
    const urls = Array.isArray(node?.config?.reference_urls)
      ? node.config.reference_urls.filter((url): url is string => typeof url === 'string')
      : [];
    return urls.join('\n');
  })();

  if (!node) return null;

  const updateConfig = (key: string, value: string | number) => {
    onUpdateNode(node.id, { config: { ...node.config, [key]: value } });
  };

  const updateReferenceUrls = (value: string) => {
    const reference_urls = value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    onUpdateNode(node.id, { config: { ...node.config, reference_urls } });
  };

  const saveAiInstruction = (value: string) => {
    setAiInstruction(value);
    onUpdateNode(node.id, { config: { ...node.config, ai_edit_instruction: value } });
  };

  return createPortal(
    <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/45 p-4">
      <section className="flex max-h-[min(820px,calc(100vh-28px))] w-[min(1040px,calc(100vw-24px))] flex-col overflow-hidden rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface-panel)] shadow-[var(--shadow-soft)]">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-hover)] px-2 py-1 text-[9px] font-black text-[var(--editorial-text-gray)]">
                {nodeTypeLabels[node.type] || node.type}
              </span>
              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-hover)] px-2 py-1 text-[9px] font-black text-[var(--editorial-text-gray)]">
                {statusLabels[node.status || 'idle'] || node.status || '未运行'}
              </span>
            </div>
            <input
              type="text"
              value={node.label}
              disabled={readOnly}
              onChange={(event) => onUpdateNode(node.id, { label: event.target.value })}
              className="mt-2 w-full bg-transparent text-xl font-black leading-tight text-[var(--editorial-text)] outline-none disabled:opacity-70"
              placeholder="节点名称"
            />
          </div>
          <button type="button" onClick={onClose} className="rounded-[7px] border border-[var(--border-default)] p-2 hover:bg-[var(--surface-hover)]" aria-label="关闭节点详情">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-h-0 overflow-y-auto p-4">
            <div className="mb-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`rounded-[7px] border px-3 py-2 text-[10px] font-black ${activeTab === 'edit' ? 'border-[var(--border-strong)] bg-[var(--editorial-stroke)] text-[var(--editorial-bg)]' : 'border-[var(--border-subtle)] bg-[var(--surface-hover)]'}`}
              >
                详细编辑
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                className={`inline-flex items-center gap-1.5 rounded-[7px] border px-3 py-2 text-[10px] font-black ${activeTab === 'ai' ? 'border-[var(--border-strong)] bg-[var(--editorial-stroke)] text-[var(--editorial-bg)]' : 'border-[var(--border-subtle)] bg-[var(--surface-hover)]'}`}
              >
                <Bot className="h-3.5 w-3.5" /> AI 编辑
              </button>
            </div>

            {activeTab === 'edit' ? (
              <div className="space-y-4">
                <NodeConfigFields node={node} onUpdateConfig={updateConfig} variant="popover" />
                <div className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-hover)] p-3">
                  <label className="block text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">参考素材 URL</label>
                  <textarea
                    rows={4}
                    disabled={readOnly}
                    defaultValue={referenceUrlsText}
                    onBlur={(event) => updateReferenceUrls(event.target.value)}
                    className="mt-2 w-full resize-none rounded-[7px] border border-[var(--border-default)] bg-[var(--surface-panel)] p-2 text-sm leading-relaxed outline-none focus:border-[var(--editorial-accent-blue)] disabled:opacity-60"
                    placeholder="每行一个图片、视频或素材链接"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-hover)] p-3">
                  <label className="block text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">给 AI 的修改意见</label>
                  <textarea
                    rows={8}
                    value={aiInstruction}
                    disabled={readOnly}
                    onChange={(event) => saveAiInstruction(event.target.value)}
                    className="mt-2 w-full resize-none rounded-[7px] border border-[var(--border-default)] bg-[var(--surface-panel)] p-3 text-sm leading-relaxed outline-none focus:border-[var(--editorial-accent-blue)] disabled:opacity-60"
                    placeholder="例如：保留当前结构，把语气改得更短视频化；参考图里的服装和人物不要变；失败时从这个节点向后重跑。"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={readOnly || loadingState !== 'idle' || !aiInstruction.trim()}
                      onClick={() => onApplyAiEdit(node.id, aiInstruction.trim(), false)}
                      className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-strong)] bg-[var(--editorial-stroke)] px-3 py-2 text-[10px] font-black text-[var(--editorial-bg)] disabled:opacity-45"
                    >
                      <Bot className="h-3.5 w-3.5" /> 应用修改
                    </button>
                    <button
                      type="button"
                      disabled={readOnly || loadingState !== 'idle' || !aiInstruction.trim()}
                      onClick={() => onApplyAiEdit(node.id, aiInstruction.trim(), true)}
                      className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-default)] px-3 py-2 text-[10px] font-black hover:bg-[var(--surface-panel)] disabled:opacity-45"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> 应用并重跑
                    </button>
                    <button
                      type="button"
                      onClick={() => onCopyNodeDiagnostics(node.id)}
                      className="inline-flex items-center gap-1.5 rounded-[7px] border border-[var(--border-default)] px-3 py-2 text-[10px] font-black hover:bg-[var(--surface-hover)]"
                    >
                      <Copy className="h-3.5 w-3.5" /> 复制上下文
                    </button>
                  </div>
                </div>
                {node.error_message ? (
                  <div className="rounded-[8px] border border-rose-300 bg-rose-50/70 p-3 text-rose-700">
                    <span className="text-[10px] font-black uppercase">失败原因</span>
                    <p className="mt-2 whitespace-pre-wrap text-[11px] font-semibold leading-relaxed">{node.error_message}</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <aside className="min-h-0 overflow-y-auto border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] p-4 lg:border-l lg:border-t-0">
            <div className="space-y-4">
              <NodeOutputPreview node={node} />
              <div className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-3">
                <h4 className="text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">数据接口</h4>
                <div className="mt-2 grid gap-2 text-[10px]">
                  <div>
                    <span className="font-black text-[var(--editorial-text-gray)]">输入</span>
                    <p className="mt-1 break-words font-semibold text-[var(--editorial-text-muted)]">{schemaText(node.input_schema)}</p>
                  </div>
                  <div>
                    <span className="font-black text-[var(--editorial-text-gray)]">输出</span>
                    <p className="mt-1 break-words font-semibold text-[var(--editorial-text-muted)]">{schemaText(node.output_schema)}</p>
                  </div>
                </div>
              </div>
              <details className="rounded-[8px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-3">
                <summary className="cursor-pointer text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">原始输出</summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-[10px] leading-relaxed text-[var(--editorial-text-muted)]">{formatJson(node.output) || '暂无输出'}</pre>
              </details>
            </div>
          </aside>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
          <span className="text-[9px] font-semibold text-[var(--editorial-text-gray)]">节点 ID: {node.id}</span>
          <div className="flex flex-wrap items-center gap-2">
            {confirmDelete ? (
              <>
                <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-[7px] border border-[var(--border-default)] px-3 py-2 text-[10px] font-black hover:bg-[var(--surface-hover)]">取消</button>
                <button type="button" onClick={() => { onRemoveNode(); onClose(); }} className="rounded-[7px] border border-rose-400 px-3 py-2 text-[10px] font-black text-rose-600 hover:bg-rose-50">确认删除</button>
              </>
            ) : (
              <button
                type="button"
                disabled={readOnly}
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-[7px] border border-rose-300 px-3 py-2 text-[10px] font-black text-rose-600 hover:bg-rose-50 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" /> 删除节点
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
