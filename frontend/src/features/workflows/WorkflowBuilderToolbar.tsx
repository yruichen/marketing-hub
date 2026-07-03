import {
  CheckCircle2,
  Clipboard,
  ClipboardPaste,
  Eye,
  LayoutDashboard,
  Lock,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react';
import type { NodeType, presets } from './constants';

export type SaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'failed';
export type WorkflowLoadingState = 'idle' | 'saving' | 'running' | 'retrying' | 'loading';

type WorkflowPreset = (typeof presets)[number];

const toolbarButtonClass = 'h-9 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 text-[9px] font-black inline-flex items-center justify-center gap-1.5 leading-none whitespace-nowrap hover:bg-[var(--editorial-unselected)] disabled:opacity-40 disabled:hover:bg-[var(--editorial-paper)]';
const toolbarIconButtonClass = 'h-9 w-9 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] inline-flex items-center justify-center hover:bg-[var(--editorial-unselected)] disabled:opacity-40 disabled:hover:bg-[var(--editorial-paper)]';
const toolbarPrimaryClass = 'h-9 min-w-[112px] border-1.5 border-[var(--editorial-stroke)] bg-[var(--editorial-stroke)] text-[var(--editorial-bg)] px-4 text-[10px] font-black uppercase inline-flex items-center justify-center gap-2 leading-none whitespace-nowrap hover:opacity-90 disabled:opacity-45';

function SaveStatusBadge({ status }: { status: SaveStatus }) {
  const labels: Record<SaveStatus, string> = {
    clean: '已保存',
    dirty: '有未保存更改',
    saving: '正在保存...',
    saved: '已保存',
    failed: '保存失败',
  };
  const tone =
    status === 'failed'
      ? 'text-rose-600'
      : status === 'dirty'
      ? 'text-amber-700'
      : status === 'saving'
      ? 'text-blue-600'
      : 'text-emerald-700';

  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === 'failed' ? 'bg-rose-500' : status === 'dirty' ? 'bg-amber-500' : status === 'saving' ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500'}`} />
      {labels[status]}
    </span>
  );
}

interface WorkflowBuilderToolbarProps {
  projectName: string;
  campaignName: string;
  draftStatus: string;
  selectedCount: number;
  readOnly: boolean;
  saveStatus: SaveStatus;
  loadingState: WorkflowLoadingState;
  propertyPanelOpen: boolean;
  historyLength: number;
  futureLength: number;
  primaryPresets: WorkflowPreset[];
  secondaryPresets: WorkflowPreset[];
  canRunWorkflow: boolean;
  canCreateCustomAgent: boolean;
  isNodeLocked: (type: NodeType) => boolean;
  onLockedFeature: () => void;
  onAddNode: (type: NodeType, label: string) => void;
  onCreateCustomAgent: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopySelection: () => void;
  onPasteSelection: () => void;
  onFitView: () => void;
  onSave: () => void;
  onTidyLayout: () => void;
  onRunWorkflow: () => void;
  onCreateReadOnlyShare: () => void;
  onExitReadOnly: () => void;
  onTogglePropertyPanel: () => void;
}

export function WorkflowBuilderToolbar({
  projectName,
  campaignName,
  draftStatus,
  selectedCount,
  readOnly,
  saveStatus,
  loadingState,
  propertyPanelOpen,
  historyLength,
  futureLength,
  primaryPresets,
  secondaryPresets,
  canRunWorkflow,
  canCreateCustomAgent,
  isNodeLocked,
  onLockedFeature,
  onAddNode,
  onCreateCustomAgent,
  onUndo,
  onRedo,
  onCopySelection,
  onPasteSelection,
  onFitView,
  onSave,
  onTidyLayout,
  onRunWorkflow,
  onCreateReadOnlyShare,
  onExitReadOnly,
  onTogglePropertyPanel,
}: WorkflowBuilderToolbarProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[var(--editorial-stroke)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-black uppercase truncate max-w-[260px]">{projectName}</h3>
            {readOnly && <span className="border border-[var(--editorial-stroke)] px-1.5 py-0.5 text-[8px] flex items-center gap-1"><Lock className="h-3 w-3" />只读</span>}
            <SaveStatusBadge status={saveStatus} />
          </div>
          <span className="text-[9px] text-[var(--editorial-text-gray)]">{campaignName} / {draftStatus} / {selectedCount} 个已选</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-w-full">
          {primaryPresets.map((item) => {
            const Icon = item.icon;
            const locked = isNodeLocked(item.type);
            return (
              <button
                key={item.type}
                type="button"
                disabled={readOnly}
                onClick={() => locked ? onLockedFeature() : onAddNode(item.type, item.label)}
                className={toolbarButtonClass}
                title={locked ? 'Pro 节点' : undefined}
              >
                {locked ? <Lock className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}{item.label}
              </button>
            );
          })}
          <select
            disabled={readOnly}
            defaultValue=""
            onChange={(e) => {
              const item = secondaryPresets.find((preset) => preset.type === e.target.value);
              if (item) {
                if (isNodeLocked(item.type)) onLockedFeature();
                else onAddNode(item.type, item.label);
              }
              e.currentTarget.value = '';
            }}
            className={`${toolbarButtonClass} appearance-none pr-7`}
            aria-label="添加更多节点"
          >
            <option value="">+ 节点</option>
            {secondaryPresets.map((item) => (
              <option key={item.type} value={item.type} disabled={isNodeLocked(item.type)}>{isNodeLocked(item.type) ? `${item.label} · Pro` : item.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={readOnly}
            onClick={canCreateCustomAgent ? onCreateCustomAgent : onLockedFeature}
            className={toolbarButtonClass}
            title={canCreateCustomAgent ? undefined : 'Pro 智能体'}
          >
            {canCreateCustomAgent ? <Plus className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}新建智能体
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--editorial-stroke)]/70 bg-[var(--editorial-bg)]">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onUndo} disabled={historyLength === 0 || readOnly} className={toolbarIconButtonClass} title="撤销"><Undo2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onRedo} disabled={futureLength === 0 || readOnly} className={toolbarIconButtonClass} title="重做"><Redo2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onCopySelection} disabled={selectedCount === 0} className={toolbarIconButtonClass} title="复制"><Clipboard className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onPasteSelection} disabled={readOnly} className={toolbarIconButtonClass} title="粘贴"><ClipboardPaste className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onFitView} className={toolbarIconButtonClass} title="适配视图"><CheckCircle2 className="h-3.5 w-3.5" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onSave} disabled={readOnly || saveStatus === 'saving'} className={toolbarButtonClass}>
            <Save className="h-3.5 w-3.5" /> 保存
          </button>
          <button type="button" onClick={onTidyLayout} disabled={readOnly} className={toolbarButtonClass}>
            <LayoutDashboard className="h-3.5 w-3.5" />整理布局
          </button>
          <button type="button" onClick={canRunWorkflow ? onRunWorkflow : onLockedFeature} disabled={loadingState !== 'idle' || readOnly} className={toolbarPrimaryClass}>
            {canRunWorkflow ? <Play className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {canRunWorkflow ? (loadingState === 'running' ? '执行中...' : loadingState === 'retrying' ? '重试中...' : '运行工作流') : 'Pro 运行'}
          </button>
          <span className="h-9 inline-flex items-center gap-1.5 text-[9px] text-[var(--editorial-text-gray)] border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-2 leading-none">
            <span className={`h-1.5 w-1.5 rounded-full ${draftStatus === 'completed' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {draftStatus}
          </span>
          <button type="button" onClick={onCreateReadOnlyShare} className={toolbarButtonClass}><Eye className="h-3.5 w-3.5" />只读分享</button>
          {readOnly && (
            <button type="button" onClick={onExitReadOnly} className={toolbarButtonClass}>
              退出只读
            </button>
          )}
          <button type="button" onClick={onTogglePropertyPanel} className={toolbarIconButtonClass} title="展开或收起右侧属性面板">{propertyPanelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}</button>
        </div>
      </div>
    </>
  );
}
