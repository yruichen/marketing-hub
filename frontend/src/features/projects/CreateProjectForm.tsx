import { FolderPlus } from 'lucide-react';
import { PLATFORM_CHOICES, STATUS_CHOICES, STATUS_LABELS } from './types';
import type { ProjectForm } from './types';
import type { FolderRecord } from '../../types/workspace';

interface CreateProjectFormProps {
  form: ProjectForm;
  folders: FolderRecord[];
  loading: boolean;
  onChange: (next: ProjectForm) => void;
  onCreate: () => Promise<void> | void;
}

/**
 * 新建项目表单：name / brief / folder / status / platform_tags。
 * 状态完全受控（form + onChange），不持有内部 state。
 */
export function CreateProjectForm({ form, folders, loading, onChange, onCreate }: CreateProjectFormProps) {
  const togglePlatform = (platform: string) => {
    const exists = form.platform_tags.includes(platform);
    onChange({
      ...form,
      platform_tags: exists
        ? form.platform_tags.filter((p) => p !== platform)
        : [...form.platform_tags, platform],
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
        className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-[12px] py-2 focus:outline-none font-bold"
        placeholder="项目名称"
      />
      <textarea
        rows={2}
        value={form.brief}
        onChange={(e) => onChange({ ...form, brief: e.target.value })}
        className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] text-[11px] p-2 resize-none focus:outline-none"
        placeholder="项目简介 / Brief"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={form.folder_id ?? ''}
          onChange={(e) => {
            const folder = folders.find((f) => f.id === Number(e.target.value));
            onChange({
              ...form,
              folder_id: folder?.id ?? null,
              folder_path: folder?.path || form.folder_path,
            });
          }}
          className="desktop-inspector__input"
        >
          <option value="">默认文件夹</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.path}
            </option>
          ))}
        </select>
        <select
          value={form.status_tag}
          onChange={(e) => onChange({ ...form, status_tag: e.target.value })}
          className="desktop-inspector__input"
        >
          {STATUS_CHOICES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s] || s}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PLATFORM_CHOICES.map((platform) => {
          const active = form.platform_tags.includes(platform);
          return (
            <button
              key={platform}
              type="button"
              onClick={() => togglePlatform(platform)}
              className={`desktop-inspector__chip ${active ? 'desktop-inspector__chip--active' : ''}`}
            >
              {platform}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onCreate}
        disabled={loading || !form.name.trim() || !form.brief.trim()}
        className="desktop-toolbar__btn desktop-toolbar__btn--primary w-full justify-center"
      >
        <FolderPlus className="h-3.5 w-3.5" />
        创建项目
      </button>
    </div>
  );
}
