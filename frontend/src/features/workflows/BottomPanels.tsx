import { Plus, Share2 } from 'lucide-react';
import type { GenerationTaskRecord, WorkflowTemplateRecord } from '../../types/workspace';
import type { WorkflowSnapshot } from './types';

interface BottomPanelsProps {
  templates: WorkflowTemplateRecord[];
  versions: WorkflowSnapshot[];
  lastTasks: GenerationTaskRecord[];
  templateScope: 'organization' | 'public';
  readOnly: boolean;
  onSetTemplateScope: (scope: 'organization' | 'public') => void;
  onShareTemplate: () => void;
  onForkTemplate: (template: WorkflowTemplateRecord) => void;
  onRollbackVersion: (snapshot: WorkflowSnapshot) => void;
}

export function BottomPanels({
  templates, versions, lastTasks, templateScope, readOnly,
  onSetTemplateScope, onShareTemplate, onForkTemplate, onRollbackVersion,
}: BottomPanelsProps) {
  return (
    <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      {/* Template Library */}
      <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial-sm">
        <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-3 mb-4">
          <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase">模板库</h3>
          <button type="button" onClick={onShareTemplate} disabled={readOnly} className="border border-[var(--editorial-stroke)] p-1.5 hover:bg-[var(--editorial-unselected)] disabled:opacity-45" title="发布模板">
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 text-[9px]">
          {(['organization', 'public'] as const).map((scope) => (
            <button key={scope} type="button" onClick={() => onSetTemplateScope(scope)} className={`border border-[var(--editorial-stroke)] px-2 py-1.5 ${templateScope === scope ? 'bg-[var(--editorial-stroke)] text-[var(--editorial-bg)]' : 'hover:bg-[var(--editorial-unselected)]'}`}>
              {scope === 'organization' ? '组织模板' : '公共模板'}
            </button>
          ))}
        </div>
        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
          {templates.length === 0 ? (
            <button type="button" onClick={onShareTemplate} disabled={readOnly} className="w-full border border-dashed border-[var(--editorial-stroke)] p-4 text-[10px] text-[var(--editorial-text-gray)] hover:bg-[var(--editorial-unselected)] flex items-center justify-center gap-2 disabled:opacity-45">
              <Plus className="h-3.5 w-3.5" /> 发布当前画布
            </button>
          ) : (
            templates.map((template) => (
              <div key={template.id} className="border border-[var(--editorial-stroke)]/50 p-3">
                <h4 className="text-xs font-black">{template.title}</h4>
                <div className="text-[8px] text-[var(--editorial-text-gray)] mt-1">{template.nodes.length} 个节点 / 使用 {template.fork_count} 次</div>
                <button type="button" onClick={() => onForkTemplate(template)} disabled={readOnly} className="mt-3 w-full border border-[var(--editorial-stroke)] py-1.5 text-[9px] font-black uppercase hover:bg-[var(--editorial-unselected)] disabled:opacity-45">
                  复制到当前项目
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Version History */}
      <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial-sm">
        <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase border-b border-[var(--editorial-stroke)] pb-3 mb-4">版本历史</h3>
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {versions.length === 0 ? (
            <p className="text-[10px] text-[var(--editorial-text-gray)]">保存或运行后会生成可回滚版本。</p>
          ) : (
            versions.map((version) => (
              <div key={version.id} className="border border-[var(--editorial-stroke)]/50 p-3 text-[10px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black truncate">{version.label}</span>
                  <span className="text-[8px] text-[var(--editorial-text-gray)]">{new Date(version.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="mt-1 text-[8px] text-[var(--editorial-text-gray)]">{version.nodes.length} 节点 / {version.edges.length} 连线</div>
                <button type="button" onClick={() => onRollbackVersion(version)} disabled={readOnly} className="mt-3 w-full border border-[var(--editorial-stroke)] py-1.5 text-[9px] font-black hover:bg-[var(--editorial-unselected)] disabled:opacity-45">
                  回滚到此版本
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Run Records */}
      <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-4 shadow-editorial-sm">
        <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase border-b border-[var(--editorial-stroke)] pb-3 mb-4">运行记录</h3>
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {lastTasks.length === 0 ? (
            <p className="text-[10px] text-[var(--editorial-text-gray)]">暂无执行记录。运行工作流后结果将显示在此处。</p>
          ) : (
            lastTasks.map((task) => {
              const statusColor = task.status === 'succeeded' ? 'bg-emerald-500' : task.status === 'failed' ? 'bg-rose-500' : task.status === 'running' ? 'bg-blue-500 animate-pulse' : 'bg-amber-500';
              const resultPreview = task.result?.data ? JSON.stringify(task.result.data).slice(0, 80) : '';
              return (
                <div key={task.id} className="border border-[var(--editorial-stroke)]/50 p-3 text-[10px]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${statusColor}`} />
                      <span className="font-black">#{task.id}</span>
                      <span className="text-[var(--editorial-text-gray)]">{task.task_type}</span>
                    </div>
                    <span className="text-[8px] text-[var(--editorial-text-gray)]">{task.status}</span>
                  </div>
                  {resultPreview && (
                    <pre className="mt-2 text-[9px] text-[var(--editorial-text-gray)] font-mono truncate">{resultPreview}…</pre>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
