import { Archive, Folder, Inbox, RefreshCw, Star } from 'lucide-react';
import type { FolderRecord, ProjectRecord } from '../../types/workspace';
import { getProjectFolder } from './types';

interface DesktopSidebarProps {
  folders: FolderRecord[];
  projects: ProjectRecord[];
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
  projects,
  activeFolderPath,
  onSelectFolder,
  onDropProject,
  onRefresh,
  loading,
}: DesktopSidebarProps) {
  const activeCount = projects.filter((project) => !project.is_archived).length;
  const archivedCount = projects.length - activeCount;
  const countForFolder = (path: string) => projects.filter((project) => getProjectFolder(project) === path).length;

  return (
    <aside className="desktop-sidebar">
      <div className="desktop-sidebar__header">
        <div>
          <h3>项目范围</h3>
          <span>{activeCount} 个进行中</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="desktop-sidebar__refresh"
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
        <span className="desktop-sidebar__count">{projects.length}</span>
      </button>

      <button
        type="button"
        onClick={() => onSelectFolder('__archived__')}
        className={`desktop-sidebar__item ${activeFolderPath === '__archived__' ? 'desktop-sidebar__item--active' : ''}`}
      >
        <Archive />
        <span className="desktop-sidebar__item__label">归档</span>
        <span className="desktop-sidebar__count">{archivedCount}</span>
      </button>

      <div className="desktop-sidebar__section-label mt-4">文件夹</div>

      {folders.length === 0 && (
        <div className="desktop-sidebar__empty">
          <Inbox className="h-4 w-4" />
          <span>暂无文件夹</span>
        </div>
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
          <span className="desktop-sidebar__count">{folder.project_count || countForFolder(folder.path)}</span>
        </button>
      ))}

      <div className="flex-1" />

      <div className="desktop-sidebar__footer">
        <span>拖拽项目到文件夹可快速移动</span>
      </div>
    </aside>
  );
}
