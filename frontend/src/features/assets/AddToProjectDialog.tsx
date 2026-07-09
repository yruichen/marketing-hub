import { useEffect, useState } from 'react';
import { Boxes, FolderOpen } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import type { ProjectRecord } from '../../types/workspace';

interface AddToProjectDialogProps {
  selectedCount: number;
  organizationSlug: string;
  onConfirm: (projectId: number) => void;
  onClose: () => void;
}

export function AddToProjectDialog({
  selectedCount,
  organizationSlug,
  onConfirm,
  onClose,
}: AddToProjectDialogProps) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams({ organization: organizationSlug });
    apiFetch(`/projects/?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]));
  }, [organizationSlug]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-soft)] w-[420px]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-black mb-1">加入项目</h3>
        <p className="text-[10px] text-[var(--editorial-text-gray)] mb-4">
          将 {selectedCount} 个资产归入项目，便于按 campaign 整理并在模板库发布。
        </p>
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {projects.length === 0 ? (
            <p className="text-[10px] text-[var(--editorial-text-gray)] px-3 py-4">
              还没有项目，请先在「我的项目」中创建。
            </p>
          ) : (
            projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setSelectedProjectId(project.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                  selectedProjectId === project.id
                    ? 'border-[var(--brand-accent-strong)] bg-[var(--brand-accent-soft)]'
                    : 'border-transparent hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Boxes className="h-3.5 w-3.5 inline mr-2" />
                {project.name}
                {project.folder_path ? (
                  <span className="ml-2 text-[9px] font-normal text-[var(--editorial-text-gray)]">
                    <FolderOpen className="h-3 w-3 inline mr-0.5" />
                    {project.folder_path}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 text-[10px] font-black border border-[var(--border-subtle)] rounded-lg hover:bg-[var(--surface-hover)]"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!selectedProjectId || moving}
            onClick={() => {
              if (!selectedProjectId) return;
              setMoving(true);
              onConfirm(selectedProjectId);
            }}
            className="px-3 py-2 text-[10px] font-black border border-[var(--brand-accent-strong)] bg-[var(--brand-accent)] rounded-lg disabled:opacity-40"
          >
            {moving ? '加入中...' : '确认加入'}
          </button>
        </div>
      </div>
    </div>
  );
}
