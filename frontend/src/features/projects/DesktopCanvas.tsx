import type { DragEvent, MouseEvent } from 'react';
import { Folder } from 'lucide-react';
import type { FolderRecord, ProjectRecord } from '../../types/workspace';
import type { ViewMode } from './types';
import { DesktopIcon } from './DesktopIcon';
import { STATUS_LABELS } from './types';

interface DesktopCanvasProps {
  viewMode: ViewMode;
  projects: ProjectRecord[];
  folders: FolderRecord[];
  activeProjectId: number | undefined;
  selectedIds: number[];
  groupedByFolder: Record<string, ProjectRecord[]>;

  onSelectProject: (project: ProjectRecord, event: MouseEvent) => void;
  onOpenProject: (project: ProjectRecord) => void;
  onContextMenu: (project: ProjectRecord, event: MouseEvent) => void;
  onCheckToggle: (projectId: number) => void;
  onDropToFolder: (project: ProjectRecord, folder: FolderRecord) => void;
}

/**
 * 中央桌面：按 viewMode 渲染 icon / list / board 三种视图。
 * 所有交互（点击、双击、右键、多选、拖放）通过 props 传出。
 */
export function DesktopCanvas({
  viewMode,
  projects,
  folders,
  activeProjectId,
  selectedIds,
  groupedByFolder,
  onSelectProject,
  onOpenProject,
  onContextMenu,
  onCheckToggle,
  onDropToFolder,
}: DesktopCanvasProps) {
  if (projects.length === 0) {
    return (
      <div className="desktop-icons">
        <div className="desktop-icons__empty">
          当前筛选条件下没有项目。
          <br />
          试试切换筛选或新建一个项目。
        </div>
      </div>
    );
  }

  if (viewMode === 'icon') {
    return (
      <div className="desktop-icons">
        <div className="desktop-icons__grid">
          {projects.map((project) => (
            <DesktopIcon
              key={project.id}
              id={project.id}
              name={project.name}
              kind="project"
              isSelected={selectedIds.includes(project.id)}
              isChecked={selectedIds.includes(project.id)}
              isActive={activeProjectId === project.id}
              draggable
              onDragStart={(event: DragEvent) => {
                event.dataTransfer.setData('text/plain', String(project.id));
              }}
              onClick={(event) => onSelectProject(project, event)}
              onDoubleClick={() => onOpenProject(project)}
              onContextMenu={(event) => onContextMenu(project, event)}
              onCheckToggle={() => onCheckToggle(project.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="desktop-icons">
        <div className="desktop-list">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={(event) => onSelectProject(project, event)}
              onDoubleClick={() => onOpenProject(project)}
              onContextMenu={(event) => onContextMenu(project, event)}
              className={`desktop-list__row ${selectedIds.includes(project.id) ? 'desktop-list__row--selected' : ''}`}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span className="desktop-list__row__name">{project.name}</span>
              <span className="text-[9px] text-[var(--editorial-text-gray)] shrink-0">
                {STATUS_LABELS[project.status_tag || ''] || project.status_tag || '进行中'}
              </span>
              <span className="text-[9px] text-[var(--editorial-text-gray)] shrink-0">
                {(project.platform_tags || []).join(' · ') || '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // board: 按文件夹列分组，列本身可作为拖放目标
  return (
    <div className="desktop-icons">
      <div className="desktop-board">
        {folders.map((folder) => {
          const items = groupedByFolder[folder.path] || [];
          return (
            <div
              key={folder.id}
              className="desktop-board__column"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = Number(event.dataTransfer.getData('text/plain'));
                const project = projects.find((p) => p.id === id) || null;
                if (project) onDropToFolder(project, folder);
              }}
            >
              <div className="desktop-board__column__header">
                <span>
                  <Folder className="inline h-3.5 w-3.5 mr-1" />
                  {folder.path}
                </span>
                <span className="text-[9px] text-[var(--editorial-text-gray)]">{items.length} 个项目</span>
              </div>
              <div className="desktop-board__column__items">
                {items.length === 0 ? (
                  <div className="desktop-board__empty">拖入项目或创建新项目</div>
                ) : (
                  items.map((project) => (
                    <div
                      key={project.id}
                      onClick={(event) => onSelectProject(project, event)}
                      onDoubleClick={() => onOpenProject(project)}
                      onContextMenu={(event) => onContextMenu(project, event)}
                      className={`desktop-list__row ${selectedIds.includes(project.id) ? 'desktop-list__row--selected' : ''}`}
                    >
                      <span className="desktop-list__row__name">{project.name}</span>
                      <span className="text-[9px] text-[var(--editorial-text-gray)] shrink-0">
                        {STATUS_LABELS[project.status_tag || ''] || '—'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
