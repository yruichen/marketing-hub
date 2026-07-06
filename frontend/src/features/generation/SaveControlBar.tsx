import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Folder as FolderIcon, Loader2, Save, Trash2 } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';
import type { FolderRecord } from '../../types/workspace';

interface SaveControlBarProps {
  visible: boolean;
  taskId: number | null;
  organizationSlug?: string;
  onSaved?: () => void;
  onDiscard?: () => void;
}

export function SaveControlBar({
  visible,
  taskId,
  organizationSlug,
  onSaved,
  onDiscard,
}: SaveControlBarProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);

  useEffect(() => {
    if (visible && organizationSlug) {
      const params = new URLSearchParams({ organization: organizationSlug });
      apiFetch(`/folders/?${params.toString()}`)
        .then((res) => res.ok ? res.json() : [])
        .then((data) => {
          const items = Array.isArray(data) ? data : [];
          setFolders(items);
          if (items.length > 0 && !selectedFolderId) {
            setSelectedFolderId(items[0].id);
          }
        })
        .catch(() => setFolders([]));
    }
  }, [visible, organizationSlug, selectedFolderId]);

  const handleSave = useCallback(async () => {
    if (!taskId) return;
    setSaving(true);
    try {
      const res = await apiFetch('/workspace/assets/create-from-task/', {
        method: 'POST',
        body: JSON.stringify({ task_id: taskId }),
      });
      if (res.ok) {
        const asset = await res.json();
        if (selectedFolderId && asset?.id) {
          await apiFetch('/workspace/assets/batch/', {
            method: 'POST',
            body: JSON.stringify({ ids: [asset.id], folder_id: selectedFolderId }),
          });
        }
        setSaved(true);
        onSaved?.();
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('Save failed:', data.detail || data);
        setSaving(false);
      }
    } catch (err) {
      console.error('Save error:', err);
      setSaving(false);
    }
  }, [taskId, selectedFolderId, onSaved]);

  const handleDiscard = useCallback(() => {
    setDiscarded(true);
    onDiscard?.();
  }, [onDiscard]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible) {
      setSaving(false);
      setSaved(false);
      setDiscarded(false);
    }
  }, [visible]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if ((!visible || !taskId) && !saved) return null;
  if (discarded) return null;

  return (
    <div className="mt-4 rounded-xl border border-[var(--editorial-stroke)] bg-[var(--editorial-bg)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-[10px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)] min-w-[120px]">
          {saved ? '已保存' : '保存到文件夹'}
        </div>
        {!saved && (
          <>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <FolderIcon className="h-3.5 w-3.5 shrink-0 text-[var(--editorial-text-gray)]" />
              <select
                value={selectedFolderId ?? ''}
                onChange={(e) => setSelectedFolderId(Number(e.target.value) || null)}
                className="border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-2 py-1.5 text-[10px] font-bold text-[var(--editorial-text)] rounded min-w-0 max-w-[200px]"
                disabled={saving}
              >
                {folders.length === 0 && <option value="">无文件夹</option>}
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.path}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleDiscard}
                disabled={saving}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] px-3 text-[10px] font-black text-[var(--editorial-text-gray)] hover:bg-[var(--editorial-unselected)] disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                丢弃
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--brand-accent-strong)] bg-[var(--brand-accent)] px-3 text-[10px] font-black text-black hover:opacity-90 disabled:opacity-40"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </>
        )}
        {saved && (
          <div className="flex items-center gap-2 text-emerald-600 font-bold text-[10px]">
            <CheckCircle2 className="h-4 w-4" />
            已保存到 {folders.find((f) => f.id === selectedFolderId)?.path || '资产库'}
          </div>
        )}
      </div>
    </div>
  );
}
