import { useState } from 'react';
import { Check, Folder, Inbox, Plus, RefreshCw, Trash, Trash2, X } from 'lucide-react';
import type { FolderRecord, ProjectRecord } from '../../types/workspace';

interface DesktopSidebarProps {
  folders: FolderRecord[];
  projects: ProjectRecord[];
  activeFolderPath: string;
  onSelectFolder: (path: string) => void;
  onDropProject: (folder: FolderRecord) => void;
  onRefresh: () => void;
  onCreateFolder: () => void;
  onDeleteFolder: (folder: FolderRecord) => void;
  deletedFolderCount?: number;
  loading: boolean;
}

export function DesktopSidebar({
  folders,
  activeFolderPath,
  onSelectFolder,
  onDropProject,
  onRefresh,
  onCreateFolder,
  onDeleteFolder,
  deletedFolderCount = 0,
  loading,
}: DesktopSidebarProps) {
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<number[]>([]);

  const toggleSelect = (folderId: number) => {
    setSelectedFolderIds((prev) =>
      prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]
    );
  };

  const handleBatchDelete = async () => {
    const count = selectedFolderIds.length;
    if (count === 0) return;
    if (!window.confirm(`将 ${count} 个文件夹移至回收站？`)) return;
    for (const id of selectedFolderIds) {
      const folder = folders.find((f) => f.id === id);
      if (folder) await onDeleteFolder(folder);
    }
    setSelectedFolderIds([]);
    setSelectMode(false);
  };

  const handleExitSelect = () => {
    setSelectMode(false);
    setSelectedFolderIds([]);
  };

  return (
    <aside className="desktop-sidebar">
      <div className="desktop-sidebar__header">
        <div>
          <h3>文件夹</h3>
        </div>
        <div className="flex items-center gap-1">
          {selectMode ? (
            <>
              <span className="text-[9px] text-[var(--editorial-text-gray)]">{selectedFolderIds.length} 个</span>
              {selectedFolderIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  className="desktop-sidebar__refresh text-rose-600 hover:bg-rose-50"
                  title="删除所选"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                onClick={handleExitSelect}
                className="desktop-sidebar__refresh"
                title="退出选择"
              >
                <X className="h-3 w-3" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSelectMode(true)}
                className="desktop-sidebar__refresh"
                title="选择文件夹"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={onRefresh}
                className="desktop-sidebar__refresh"
                title="刷新"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {folders.length === 0 && (
        <div className="desktop-sidebar__empty">
          <Inbox className="h-4 w-4" />
          <span>暂无文件夹</span>
        </div>
      )}

      {folders.map((folder) => (
        <div key={folder.id} className="relative">
          <button
            type="button"
            onClick={() => selectMode ? toggleSelect(folder.id) : onSelectFolder(folder.path)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onDropProject(folder);
            }}
            title={folder.path}
            className={`desktop-sidebar__item ${!selectMode && activeFolderPath === folder.path ? 'desktop-sidebar__item--active' : ''} ${selectMode && selectedFolderIds.includes(folder.id) ? 'desktop-sidebar__item--active' : ''}`}
          >
            {selectMode ? (
              <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${selectedFolderIds.includes(folder.id) ? 'bg-[var(--info-accent)] border-[var(--info-accent)] text-white' : 'border-[var(--editorial-text-gray)]'}`}>
                {selectedFolderIds.includes(folder.id) ? <Check className="h-3 w-3" /> : null}
              </span>
            ) : (
              <Folder />
            )}
            <span className="desktop-sidebar__item__label">{folder.path}</span>
            <span className="desktop-sidebar__count">{folder.asset_count ?? 0}</span>
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={onCreateFolder}
        className="desktop-sidebar__item text-[var(--editorial-accent-blue)]"
      >
        <Plus className="h-3.5 w-3.5" />
        <span className="desktop-sidebar__item__label">新建文件夹</span>
      </button>

      <div className="flex-1" />

      <div className="desktop-sidebar__footer">
        <span>拖拽项目到文件夹可快速移动</span>
      </div>

      <button
        type="button"
        onClick={() => onSelectFolder('__trash__')}
        className={`desktop-sidebar__item ${activeFolderPath === '__trash__' ? 'desktop-sidebar__item--active' : ''}`}
      >
        <Trash />
        <span className="desktop-sidebar__item__label">回收站</span>
        <span className="desktop-sidebar__count">{deletedFolderCount || 0}</span>
      </button>
    </aside>
  );
}
