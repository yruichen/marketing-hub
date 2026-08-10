import { useState } from 'react';

export interface CustomAgentForm {
  name: string;
  icon: string;
  prompt: string;
  input_fields: string;
  output_schema_text: string;
  model: string;
  temperature: number;
  failure_strategy: string;
}

const defaultForm: CustomAgentForm = {
  name: '', icon: 'Sparkles', prompt: '', input_fields: '',
  output_schema_text: '{ "response": "string" }', model: '', temperature: 0.7, failure_strategy: 'retry_once_then_skip',
};

interface CustomAgentDialogProps {
  onSave: (form: CustomAgentForm) => void;
  onClose: () => void;
}

export function CustomAgentDialog({ onSave, onClose }: CustomAgentDialogProps) {
  const [form, setForm] = useState<CustomAgentForm>({ ...defaultForm });
  const update = <K extends keyof CustomAgentForm>(key: K, value: CustomAgentForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-30 bg-black/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] shadow-editorial p-5">
        <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-3 mb-4">
          <h3 className="text-sm font-black uppercase">自定义智能体</h3>
          <button type="button" onClick={onClose} className="text-xs font-black">CLOSE</button>
        </div>
        <div className="space-y-3">
          <label className="block text-[9px] font-black uppercase text-[var(--editorial-text-gray)]">名称</label>
          <input value={form.name} onChange={(e) => update('name', e.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="智能体名称" />
          <label className="block text-[9px] font-black uppercase text-[var(--editorial-text-gray)]">图标</label>
          <input value={form.icon} onChange={(e) => update('icon', e.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="图标名 (如 Sparkles, Bot)" />
          <label className="block text-[9px] font-black uppercase text-[var(--editorial-text-gray)]">底层 Prompt</label>
          <textarea value={form.prompt} onChange={(e) => update('prompt', e.target.value)} rows={5} className="w-full bg-[var(--editorial-bg)] border border-[var(--editorial-stroke)] p-3 text-xs resize-none focus:outline-none" placeholder="描述智能体的行为和角色…" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-1">输入字段</label>
              <input value={form.input_fields} onChange={(e) => update('input_fields', e.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-1">模型</label>
              <input value={form.model} onChange={(e) => update('model', e.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" placeholder="留空使用默认" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-1">温度</label>
              <input type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={(e) => update('temperature', Number(e.target.value))} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-1">失败策略</label>
              <select value={form.failure_strategy} onChange={(e) => update('failure_strategy', e.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none">
                <option value="retry_once_then_skip">重试一次后跳过</option>
                <option value="skip">直接跳过</option>
                <option value="abort">中断工作流</option>
              </select>
            </div>
          </div>
          <label className="block text-[9px] font-black uppercase text-[var(--editorial-text-gray)]">输出 Schema</label>
          <textarea value={form.output_schema_text} onChange={(e) => update('output_schema_text', e.target.value)} rows={2} className="w-full bg-[var(--editorial-bg)] border border-[var(--editorial-stroke)] p-3 text-[10px] font-mono resize-none focus:outline-none" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-editorial-secondary px-3 py-2 text-[10px] font-black uppercase">取消</button>
            <button type="button" disabled={!form.name.trim() || !form.prompt.trim()} onClick={() => onSave(form)} className="btn-editorial-primary px-3 py-2 text-[10px] font-black uppercase disabled:opacity-40">创建</button>
          </div>
        </div>
      </div>
    </div>
  );
}
