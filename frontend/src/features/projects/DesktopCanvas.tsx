import type { DragEvent, MouseEvent } from 'react';
import {
  Archive,
  Boxes,
  CalendarClock,
  Check,
  CircleDollarSign,
  FileStack,
  Folder,
  Layers,
  PlayCircle,
  RadioTower,
} from 'lucide-react';
import type { FolderRecord, ProjectRecord } from '../../types/workspace';
import type { ViewMode } from './types';
import {
  formatProjectCost,
  formatProjectDate,
  getProjectActivityTime,
  getProjectFolder,
  getProjectStatus,
  getProjectStatusLabel,
} from './types';

interface DesktopCanvasProps {
  viewMode: ViewMode;
  projects: ProjectRecord[];
  folders: FolderRecord[];
  activeProjectId: number | undefined;
  selectedIds: number[];
  groupedByFolder: Record<string, ProjectRecord[]>;
  loading: boolean;

  onSelectProject: (project: ProjectRecord, event: MouseEvent) => void;
  onOpenProject: (project: ProjectRecord) => void;
  onSetCurrentProject: (project: ProjectRecord) => void;
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
  loading,
  onSelectProject,
  onOpenProject,
  onSetCurrentProject,
  onContextMenu,
  onCheckToggle,
  onDropToFolder,
}: DesktopCanvasProps) {
  const renderStatus = (project: ProjectRecord) => (
    <span className={`project-status project-status--${getProjectStatus(project)}`}>
      {getProjectStatusLabel(project)}
    </span>
  );

  const renderProjectMeta = (project: ProjectRecord) => (
    <div className="project-meta-row">
      <span>
        <Folder className="h-3.5 w-3.5" />
        {getProjectFolder(project)}
      </span>
      <span>
        <CalendarClock className="h-3.5 w-3.5" />
        {formatProjectDate(getProjectActivityTime(project))}
      </span>
      <span>
        <CircleDollarSign className="h-3.5 w-3.5" />
        {formatProjectCost(project.total_cost_usd)}
      </span>
    </div>
  );

  const renderProjectStats = (project: ProjectRecord) => (
    <div className="project-stat-strip">
      <span><RadioTower className="h-3.5 w-3.5" />{project.campaign_count || 0}</span>
      <span><FileStack className="h-3.5 w-3.5" />{project.asset_count || 0}</span>
      <span><Boxes className="h-3.5 w-3.5" />{project.draft_count || 0}</span>
      {project.pending_review_count ? <b>{project.pending_review_count} 待审</b> : null}
    </div>
  );

  if (projects.length === 0) {
    return (
      <div className="desktop-workspace">
        <div className="desktop-icons__empty">
          <Folder className="h-8 w-8" />
          <span>{loading ? '正在加载项目' : '没有匹配项目'}</span>
          <p>{loading ? '请稍候' : '调整筛选或创建新项目'}</p>
        </div>
      </div>
    );
  }

  if (viewMode === 'icon') {
    return (
      <div className="desktop-workspace">
        <div className="project-card-grid">
          {projects.map((project) => (
            <article
              key={project.id}
              draggable
              onDragStart={(event: DragEvent) => {
                event.dataTransfer.setData('text/plain', String(project.id));
              }}
              onClick={(event) => onSelectProject(project, event)}
              onDoubleClick={() => onSetCurrentProject(project)}
              onContextMenu={(event) => onContextMenu(project, event)}
              className={`project-card ${selectedIds.includes(project.id) ? 'project-card--selected' : ''} ${activeProjectId === project.id ? 'project-card--active' : ''}`}
            >
              <div className="project-card__top">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCheckToggle(project.id);
                  }}
                  className={`project-check ${selectedIds.includes(project.id) ? 'project-check--checked' : ''}`}
                  aria-label={`选择 ${project.name}`}
                >
                  {selectedIds.includes(project.id) ? <Check className="h-3 w-3" /> : null}
                </button>
                {renderStatus(project)}
              </div>
              <h3>{project.name}</h3>
              <p>{project.brief || '暂无 Brief'}</p>
              <div className="project-card__tags">
                {(project.platform_tags || ['未设置平台']).slice(0, 3).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              {renderProjectStats(project)}
              {renderProjectMeta(project)}
            </article>
          ))}
        </div>
      </div>
    );
  }

  if (viewMode === 'list') {
    return (
      <div className="desktop-workspace">
        <div className="project-table">
          <div className="project-table__head">
            <span>项目</span>
            <span>状态</span>
            <span>产出</span>
            <span>平台</span>
            <span>最近活跃</span>
            <span>操作</span>
          </div>
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={(event) => onSelectProject(project, event)}
              onDoubleClick={() => onSetCurrentProject(project)}
              onContextMenu={(event) => onContextMenu(project, event)}
              className={`project-table__row ${selectedIds.includes(project.id) ? 'project-table__row--selected' : ''} ${activeProjectId === project.id ? 'project-table__row--active' : ''}`}
            >
              <div className="project-table__main">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCheckToggle(project.id);
                  }}
                  className={`project-check ${selectedIds.includes(project.id) ? 'project-check--checked' : ''}`}
                  aria-label={`选择 ${project.name}`}
                >
                  {selectedIds.includes(project.id) ? <Check className="h-3 w-3" /> : null}
                </button>
                <div className="project-table__identity">
                  <div>
                    <span className="project-table__name">{project.name}</span>
                    {activeProjectId === project.id && <span className="desktop-list__badge">当前</span>}
                    {project.is_archived && <Archive className="h-3.5 w-3.5 text-[var(--editorial-text-gray)]" />}
                  </div>
                  <p>{project.brief || '暂无 Brief'}</p>
                  {renderProjectMeta(project)}
                </div>
              </div>
              {renderStatus(project)}
              {renderProjectStats(project)}
              <span className="project-table__platforms">
                {(project.platform_tags || ['未设置平台']).map((tag) => <b key={tag}>{tag}</b>)}
              </span>
              <span className="project-table__date">{formatProjectDate(getProjectActivityTime(project))}</span>
              <div className="project-table__actions">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSetCurrentProject(project);
                  }}
                  className="desktop-list__action"
                >
                  <PlayCircle className="h-3.5 w-3.5" />设为当前
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenProject(project);
                  }}
                  className="desktop-list__action"
                >
                  <Layers className="h-3.5 w-3.5" />详情
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // board: 按文件夹列分组，列本身可作为拖放目标
  return (
    <div className="desktop-workspace">
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
                      onDoubleClick={() => onSetCurrentProject(project)}
                      onContextMenu={(event) => onContextMenu(project, event)}
                      className={`desktop-board__card ${selectedIds.includes(project.id) ? 'desktop-board__card--selected' : ''} ${activeProjectId === project.id ? 'desktop-board__card--active' : ''}`}
                    >
                      <div className="desktop-board__card-title">
                        <span>{project.name}</span>
                        {activeProjectId === project.id && <span className="desktop-list__badge">当前</span>}
                      </div>
                      <p>{project.brief || '暂无 Brief'}</p>
                      <div className="desktop-board__card-footer">
                        {renderStatus(project)}
                        <span>{project.asset_count || 0} 资产</span>
                      </div>
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
