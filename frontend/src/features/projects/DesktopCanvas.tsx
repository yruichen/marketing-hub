import type { DragEvent, MouseEvent } from 'react';
import {
  Boxes,
  CalendarClock,
  Check,
  CircleDollarSign,
  FileStack,
  FileText,
  Folder,
  Image,
  Layers,
  Music,
  PlayCircle,
  RadioTower,
  Video,
} from 'lucide-react';
import type { AssetRecord, FolderRecord, ProjectRecord } from '../../types/workspace';
const MAX_TRASH_DAYS = 30;
function trashRemainingText(deletedAt?: string | null): string {
  if (!deletedAt) return '';
  const deleted = new Date(deletedAt).getTime();
  if (!Number.isFinite(deleted)) return '';
  const elapsedMs = Date.now() - deleted;
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  const remaining = MAX_TRASH_DAYS - elapsedDays;
  if (remaining <= 0) return '即将自动清理';
  if (elapsedDays === 0) return '今天删除 · 剩余 ' + remaining + ' 天';
  if (elapsedDays === 1) return '昨天删除 · 剩余 ' + remaining + ' 天';
  return elapsedDays + ' 天前删除 · 剩余 ' + remaining + ' 天';
}
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
  folderAssets?: Record<string, AssetRecord[]>;
  isTrashView?: boolean;
  trashFolders?: FolderRecord[];
  loading: boolean;
  onRestoreFolder?: (folder: FolderRecord) => void;
  onPermanentDeleteFolder?: (folder: FolderRecord) => void;

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
  folderAssets = {},
  isTrashView = false,
  trashFolders = [],
  loading,
  onRestoreFolder,
  onPermanentDeleteFolder,
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

  if (projects.length === 0 && trashFolders.length === 0) {
    return (
      <div className="desktop-workspace">
        <div className="desktop-icons__empty">
          <Folder className="h-8 w-8" />
          <span>{loading ? '正在加载项目' : isTrashView ? '回收站暂无内容' : '没有匹配项目'}</span>
          <p>{loading ? '请稍候' : isTrashView ? '已删除的项目和文件夹将显示在这里' : '调整筛选或创建新项目'}</p>
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
        {isTrashView && trashFolders.length > 0 && (
          <div className="mb-3 px-1">
            <div className="text-[9px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">已删除文件夹 ({trashFolders.length})</div>
            <div className="grid grid-cols-1 gap-1">
              {trashFolders.map((f) => (
                <div key={f.id} className="border border-[var(--border-subtle)] rounded-lg px-4 py-3 bg-[var(--surface-elevated)] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-[12px] font-bold truncate">{f.path}</span>
                    <span className="text-[10px] text-[var(--editorial-text-gray)] shrink-0">{trashRemainingText(f.deleted_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-[var(--editorial-text-gray)]">{f.asset_count || 0} 资产</span>
                    <button onClick={() => onRestoreFolder?.(f)} className="text-[10px] font-black text-[var(--info-accent)] hover:underline" title="恢复文件夹">恢复</button>
                    <button onClick={() => onPermanentDeleteFolder?.(f)} className="text-[10px] font-black text-rose-500 hover:underline" title="永久删除">删除</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="project-table">
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
              <span className="project-table__date">
                {isTrashView ? trashRemainingText(project.deleted_at) : formatProjectDate(getProjectActivityTime(project))}
              </span>
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

  // board: 按文件夹列分组，按资产类型分类展示
  const ASSET_TYPE_LABEL: Record<string, string> = {
    image: '图片',
    audio: '音频',
    video: '视频',
    document: '文档',
  };

  return (
    <div className="desktop-workspace">
      <div className="desktop-board">
        {folders.map((folder) => {
          const assets = folderAssets[folder.path] || [];
          const imageAssets = assets.filter((a) => a.asset_type === 'image');
          const audioAssets = assets.filter((a) => a.asset_type === 'audio');
          const videoAssets = assets.filter((a) => a.asset_type === 'video');
          const docAssets = assets.filter((a) => a.asset_type === 'document');
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
                <div className="flex items-center gap-2 text-[9px] text-[var(--editorial-text-gray)]">
                  <span>{imageAssets.length} 图</span>
                  <span>{audioAssets.length} 音</span>
                  <span>{videoAssets.length} 视</span>
                </div>
              </div>
              <div className="desktop-board__column__items">
                {assets.length === 0 ? (
                  <div className="desktop-board__empty">暂无资产</div>
                ) : (
                  <>
                    {imageAssets.length > 0 && (
                      <>
                        <div className="px-2 py-1 mt-1 text-[8px] font-black uppercase text-[var(--editorial-text-gray)] tracking-wider">图片</div>
                        <div className="grid grid-cols-2 gap-1 px-1">
                          {imageAssets.slice(0, 4).map((asset) => (
                            <div key={asset.id} className="aspect-square rounded-lg overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-muted)]" title={asset.title}>
                              {asset.source_url ? (
                                <img src={asset.source_url} alt={asset.title} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[var(--editorial-text-gray)]">
                                  <Image className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                          ))}
                          {imageAssets.length > 4 && (
                            <div className="aspect-square rounded-lg border border-dashed border-[var(--border-subtle)] flex items-center justify-center text-[9px] font-bold text-[var(--editorial-text-gray)]">
                              +{imageAssets.length - 4}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    {audioAssets.length > 0 && (
                      <div>
                        <div className="px-2 py-1 mt-1 text-[8px] font-black uppercase text-[var(--editorial-text-gray)] tracking-wider">音频</div>
                        {audioAssets.slice(0, 3).map((asset) => (
                          <div key={asset.id} className="desktop-board__card desktop-board__card--asset">
                            <div className="flex items-center gap-2 min-w-0">
                              <Music className="h-3.5 w-3.5 shrink-0 text-[var(--editorial-text-gray)]" />
                              <span className="truncate text-[10px] font-bold">{asset.title}</span>
                            </div>
                          </div>
                        ))}
                        {audioAssets.length > 3 && <div className="text-[8px] text-[var(--editorial-text-gray)] px-2 py-1">+ {audioAssets.length - 3} 个</div>}
                      </div>
                    )}
                    {videoAssets.length > 0 && (
                      <div>
                        <div className="px-2 py-1 mt-1 text-[8px] font-black uppercase text-[var(--editorial-text-gray)] tracking-wider">视频</div>
                        {videoAssets.slice(0, 3).map((asset) => (
                          <div key={asset.id} className="desktop-board__card desktop-board__card--asset">
                            <div className="flex items-center gap-2 min-w-0">
                              <Video className="h-3.5 w-3.5 shrink-0 text-[var(--editorial-text-gray)]" />
                              <span className="truncate text-[10px] font-bold">{asset.title}</span>
                            </div>
                          </div>
                        ))}
                        {videoAssets.length > 3 && <div className="text-[8px] text-[var(--editorial-text-gray)] px-2 py-1">+ {videoAssets.length - 3} 个</div>}
                      </div>
                    )}
                    {docAssets.length > 0 && (
                      <div>
                        <div className="px-2 py-1 mt-1 text-[8px] font-black uppercase text-[var(--editorial-text-gray)] tracking-wider">文档</div>
                        {docAssets.slice(0, 3).map((asset) => (
                          <div key={asset.id} className="desktop-board__card desktop-board__card--asset">
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--editorial-text-gray)]" />
                              <span className="truncate text-[10px] font-bold">{asset.title}</span>
                            </div>
                          </div>
                        ))}
                        {docAssets.length > 3 && <div className="text-[8px] text-[var(--editorial-text-gray)] px-2 py-1">+ {docAssets.length - 3} 个</div>}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
