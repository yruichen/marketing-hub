import { Folder, Star, Archive, RefreshCw } from 'lucide-react';
import type { FolderRecord } from '../../types/workspace';

interface DesktopSidebarProps {
  folders: FolderRecord[];
  activeFolderPath: string;
  onSelectFolder: (path: string) => void;
  onDropProject: (folder: FolderRecord) => void;
  onRefresh: () => void;
  loading: boolean;
}

/**
 * 左侧栏：收藏区（全部项目 / 归档）+ 文件夹列表。
 * 文件夹可作为拖放目标（接收从桌面拖来的项目）。
 */
export function DesktopSidebar({
  folders,
  activeFolderPath,
  onSelectFolder,
  onDropProject,
  onRefresh,
  loading,
}: DesktopSidebarProps) {
  return (
    <aside className="desktop-sidebar">
      <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] px-4 py-3">
        <h3 className="text-[10px] font-black uppercase tracking-wider">收藏</h3>
        <button
          type="button"
          onClick={onRefresh}
          className="border border-[var(--editorial-stroke)] p-1 hover:bg-[var(--editorial-unselected)]"
          title="刷新"
          aria-label="刷新"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onSelectFolder('全部')}
        className={`desktop-sidebar__item ${activeFolderPath === '全部' ? 'desktop-sidebar__item--active' : ''}`}
      >
        <Star />
        <span className="desktop-sidebar__item__label">全部项目</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectFolder('__archived__')}
        className={`desktop-sidebar__item ${activeFolderPath === '__archived__' ? 'desktop-sidebar__item--active' : ''}`}
      >
        <Archive />
        <span className="desktop-sidebar__item__label">归档</span>
      </button>

      <div className="desktop-sidebar__section-label mt-4">文件夹</div>

      {folders.length === 0 && (
        <div className="px-4 py-2 text-[10px] text-[var(--editorial-text-gray)]">暂无文件夹</div>
      )}

      {folders.map((folder) => (
        <button
          key={folder.id}
          type="button"
          onClick={() => onSelectFolder(folder.path)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            onDropProject(folder);
          }}
          title={folder.path}
          className={`desktop-sidebar__item ${activeFolderPath === folder.path ? 'desktop-sidebar__item--active' : ''}`}
        >
          <Folder />
          <span className="desktop-sidebar__item__label">{folder.path}</span>
        </button>
      ))}

      <div className="flex-1" />

      <div className="border-t border-dashed border-[var(--editorial-stroke)]/30 p-3 text-[9px] text-[var(--editorial-text-gray)] leading-relaxed">
        拖动项目到文件夹可移动。
        <br />
        右键图标查看更多操作。
      </div>
    </aside>
  );
}
