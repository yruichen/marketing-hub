import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../hooks/useApi';
import type {
  BrandContext,
  CampaignRecord,
  FolderRecord,
  ProjectRecord,
} from '../../types/workspace';
import { DesktopSidebar } from './DesktopSidebar';
import { DesktopToolbar } from './DesktopToolbar';
import { DesktopCanvas } from './DesktopCanvas';
import { Inspector } from './Inspector';
import { StatusBar } from './StatusBar';
import { ContextMenu } from './ContextMenu';
import { buildProjectContextItems } from './contextMenuItems';
import { CreateFolderForm } from './CreateFolderForm';
import { CreateProjectForm } from './CreateProjectForm';
import { useFilteredProjects } from './useFilteredProjects';
import { useGroupedByFolder } from './useGroupedByFolder';
import {
  EMPTY_BRAND_CONTEXT,
  type ProjectDetail,
  type ProjectForm,
  type ProjectManagerProps,
  type ViewMode,
} from './types';
import './desktop.css';

interface ContextMenuState {
  x: number;
  y: number;
  project: ProjectRecord;
}

const ALL_FILTER = '全部';
const ARCHIVED_PSEUDO = '__archived__';

export function ProjectManager({ organization, activeProjectId, onSelectScope, triggerToast }: ProjectManagerProps) {
  const queryClient = useQueryClient();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);
  const [folderFilter, setFolderFilter] = useState(ALL_FILTER);
  const [sidebarFolderPath, setSidebarFolderPath] = useState<string>(ALL_FILTER);
  const [viewMode, setViewMode] = useState<ViewMode>('icon');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [newFolderName] = useState('默认文件夹');
  const [newProject, setNewProject] = useState<ProjectForm>({
    name: '新营销项目',
    brief: '新品上市全链路营销活动',
    folder_id: null,
    folder_path: '默认文件夹',
    platform_tags: ['小红书'],
    status_tag: 'creating',
  });
  const [newCampaignName, setNewCampaignName] = useState('Launch Wave');
  const [draftContext, setDraftContext] = useState<BrandContext>(EMPTY_BRAND_CONTEXT);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);

  const organizationSlug = organization?.slug || 'marketing-hub';
  const projectsQueryKey = useMemo(() => ['projects', organizationSlug], [organizationSlug]);
  const foldersQueryKey = useMemo(() => ['projects-folders', organizationSlug], [organizationSlug]);

  // ===== data fetch =====
  const fetchProjects = useCallback(
    async (preferredProjectId?: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ organization: organizationSlug });
        const [projectData, folderData] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: projectsQueryKey,
            queryFn: () => apiGet<ProjectRecord[]>(`/projects/?${params.toString()}`),
            staleTime: 0,
          }),
          queryClient.fetchQuery({
            queryKey: foldersQueryKey,
            queryFn: () => apiGet<FolderRecord[]>(`/folders/?${params.toString()}`),
            staleTime: 0,
          }),
        ]);
        setFolders(folderData);
        setProjects(projectData);
        const next =
          projectData.find((p) => p.id === preferredProjectId) ||
          projectData.find((p) => p.id === activeProjectId) ||
          projectData[0];
        if (next) {
          const detail = await apiGet<ProjectDetail>(`/projects/${next.id}/`);
          setSelectedProject(detail);
          setDraftContext({ ...EMPTY_BRAND_CONTEXT, ...(detail.brand_context || {}) });
        } else {
          setSelectedProject(null);
        }
      } catch {
        triggerToast('项目列表加载失败', 'error');
      } finally {
        setLoading(false);
      }
    },
    [activeProjectId, foldersQueryKey, organizationSlug, projectsQueryKey, queryClient, triggerToast],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchProjects();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchProjects]);

  const loadProject = useCallback(
    async (projectId: number) => {
      setLoading(true);
      try {
        const detail = await apiGet<ProjectDetail>(`/projects/${projectId}/`);
        setSelectedProject(detail);
        setDraftContext({ ...EMPTY_BRAND_CONTEXT, ...(detail.brand_context || {}) });
      } catch {
        triggerToast('项目详情加载失败', 'error');
      } finally {
        setLoading(false);
      }
    },
    [triggerToast],
  );

  // ===== actions =====
  const createFolder = async (name: string) => {
    if (!organization || !name.trim()) return;
    setLoading(true);
    try {
      const folder = await apiPost<FolderRecord>('/folders/', {
        organization: organization.slug,
        name,
        sort_order: folders.length,
        permission_scope: 'workspace',
      });
      setFolders((prev) => [...prev, folder]);
      triggerToast('文件夹已创建', 'success');
    } catch {
      triggerToast('文件夹创建失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const project = await apiPost<ProjectRecord>('/projects/', {
        organization: organization.slug,
        name: newProject.name,
        brief: newProject.brief,
        folder_id: newProject.folder_id,
        folder_path: newProject.folder_path,
        platform_tags: newProject.platform_tags,
        status_tag: newProject.status_tag,
        brand_context: {
          ...EMPTY_BRAND_CONTEXT,
          brand_name: newProject.name,
          campaign_goal: newProject.brief,
        },
      });
      triggerToast('项目已创建', 'success');
      setShowCreateProject(false);
      await fetchProjects(project.id);
      await loadProject(project.id);
    } catch {
      triggerToast('项目创建失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveBrandContext = async () => {
    if (!selectedProject) return;
    try {
      const project = await apiPatch<ProjectRecord>(`/projects/${selectedProject.id}/`, {
        brand_context: draftContext,
        brief: selectedProject.brief,
      });
      setSelectedProject({ ...selectedProject, ...project });
      triggerToast('品牌记忆已保存', 'success');
    } catch {
      triggerToast('品牌记忆保存失败', 'error');
    }
  };

  const updateProjectMeta = async (patch: Partial<ProjectRecord>) => {
    if (!selectedProject) return;
    try {
      const project = await apiPatch<ProjectRecord>(`/projects/${selectedProject.id}/`, patch);
      setSelectedProject({ ...selectedProject, ...project });
      await fetchProjects(selectedProject.id);
    } catch {
      triggerToast('项目元数据更新失败', 'error');
    }
  };

  const createCampaign = async () => {
    if (!selectedProject) return;
    try {
      const campaign = await apiPost<CampaignRecord>('/campaigns/', {
        project_id: selectedProject.id,
        name: newCampaignName,
        objective: draftContext.campaign_goal || selectedProject.brief,
      });
      setSelectedProject({
        ...selectedProject,
        campaigns: [campaign, ...selectedProject.campaigns],
      });
      triggerToast('活动已创建', 'success');
    } catch {
      triggerToast('活动创建失败', 'error');
    }
  };

  const archiveProject = async (project: ProjectRecord) => {
    try {
      await apiPatch<ProjectRecord>(`/projects/${project.id}/`, { is_archived: !project.is_archived });
      await fetchProjects(selectedProject?.id);
      triggerToast(project.is_archived ? '项目已恢复' : '项目已归档', 'info');
    } catch {
      triggerToast('项目状态更新失败', 'error');
    }
  };

  const deleteProject = async (project: ProjectRecord) => {
    const archiveFirst = window.confirm('建议先归档项目，避免误删。点击"确定"执行归档，点击"取消"继续永久删除确认。');
    if (archiveFirst) {
      await archiveProject(project);
      return;
    }
    if (!window.confirm(`永久删除「${project.name}」后不可恢复。是否继续？`)) return;
    if (!window.confirm('请再次确认：确实要永久删除这个项目吗？')) return;
    try {
      await apiDelete(`/projects/${project.id}/`);
      if (selectedProject?.id === project.id) setSelectedProject(null);
      await fetchProjects();
      triggerToast('项目已删除', 'info');
    } catch {
      triggerToast('项目删除失败', 'error');
    }
  };

  const handleDropToFolder = async (project: ProjectRecord, folder: FolderRecord) => {
    if ((project.folder_path_display || project.folder_path || '默认文件夹') === folder.path) return;
    try {
      await apiPatch<ProjectRecord>(`/projects/${project.id}/`, { folder_id: folder.id, folder_path: folder.path });
      await fetchProjects(project.id);
      triggerToast('项目已移动到目标文件夹', 'success');
    } catch {
      triggerToast('项目移动失败', 'error');
    }
  };

  const toggleSelected = (projectId: number) => {
    setSelectedIds((prev) => (prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]));
  };

  const batchPatch = async (patch: Partial<ProjectRecord>, message: string) => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      await Promise.all(selectedIds.map((id) => apiPatch<ProjectRecord>(`/projects/${id}/`, patch)));
      setSelectedIds([]);
      await fetchProjects(selectedProject?.id);
      triggerToast(message, 'success');
    } catch {
      triggerToast('批量操作失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const batchExport = () => {
    const rows = projects
      .filter((p) => selectedIds.includes(p.id))
      .map((p) => `${p.name},${p.brief},${(p.platform_tags || []).join('|')},${p.status_tag || ''}`)
      .join('\n');
    navigator.clipboard?.writeText(`项目名称,Brief,平台标签,状态\n${rows}`);
    triggerToast('已复制批量导出 CSV', 'success');
  };

  // ===== derived state =====
  const folderOptions = useMemo(() => [ALL_FILTER, ...folders.map((f) => f.path)], [folders]);

  const sidebarScopedProjects = useMemo(() => {
    if (sidebarFolderPath === ALL_FILTER) return projects;
    if (sidebarFolderPath === ARCHIVED_PSEUDO) return projects.filter((p) => p.is_archived);
    return projects.filter((p) => (p.folder_path_display || p.folder_path || '默认文件夹') === sidebarFolderPath);
  }, [projects, sidebarFolderPath]);

  const filteredProjects = useFilteredProjects(sidebarScopedProjects, {
    search,
    platformFilter,
    statusFilter,
    folderFilter,
  });

  const groupedByFolder = useGroupedByFolder(folders, filteredProjects);

  // ===== selection / open =====
  const onSelectProject = (project: ProjectRecord, event: MouseEvent) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      toggleSelected(project.id);
      return;
    }
    setSelectedIds((prev) => (prev.includes(project.id) ? prev : [project.id]));
  };

  const onOpenProject = async (project: ProjectRecord) => {
    setSelectedIds([project.id]);
    await loadProject(project.id);
  };

  const onContextMenuFor = (project: ProjectRecord, event: MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, project });
  };

  const onCheckToggle = (projectId: number) => {
    toggleSelected(projectId);
  };

  const onSelectAll = () => setSelectedIds(filteredProjects.map((p) => p.id));
  const onClearSelection = () => setSelectedIds([]);

  const onClearFilters = () => {
    setSearch('');
    setPlatformFilter(ALL_FILTER);
    setStatusFilter(ALL_FILTER);
    setFolderFilter(ALL_FILTER);
  };

  const closeContextMenu = () => setContextMenu(null);

  return (
    <div className={`desktop-shell relative ${selectedProject ? '' : 'desktop-shell--no-inspector'}`}>
      <DesktopSidebar
        folders={folders}
        activeFolderPath={sidebarFolderPath}
        onSelectFolder={(path) => {
          setSidebarFolderPath(path);
          setSelectedIds([]);
        }}
        onDropProject={(folder) => {
          if (selectedIds.length === 1) {
            const project = projects.find((p) => p.id === selectedIds[0]);
            if (project) void handleDropToFolder(project, folder);
          } else if (selectedIds.length > 1) {
            triggerToast('请先选中单个项目再拖到文件夹', 'info');
          }
        }}
        onRefresh={() => void fetchProjects()}
        loading={loading}
      />

      <div className="desktop-canvas">
        <DesktopToolbar
          search={search}
          onSearchChange={setSearch}
          platformFilter={platformFilter}
          onPlatformFilterChange={setPlatformFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          folderOptions={folderOptions}
          folderFilter={folderFilter}
          onFolderFilterChange={setFolderFilter}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          selectedCount={selectedIds.length}
          onSelectAll={onSelectAll}
          onClearSelection={onClearSelection}
          onBatchArchive={() => void batchPatch({ is_archived: true }, '已批量归档')}
          onBatchReview={() => void batchPatch({ status_tag: 'review' }, '已批量设为待审')}
          onBatchExport={batchExport}
          onCreateProjectClick={() => setShowCreateProject((v) => !v)}
          onCreateFolderClick={() => {
            const name = window.prompt('文件夹名称', newFolderName) || newFolderName;
            if (name.trim()) void createFolder(name);
          }}
        />

        {showCreateProject ? (
          <div className="border-b border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] p-4">
            <CreateProjectForm
              form={newProject}
              folders={folders}
              loading={loading}
              onChange={setNewProject}
              onCreate={() => void createProject()}
            />
          </div>
        ) : null}

        {showCreateProject ? (
          <div className="border-b border-dashed border-[var(--editorial-stroke)]/40 bg-[var(--editorial-paper)] p-4">
            <div className="text-[10px] font-black uppercase text-[var(--editorial-text-gray)] mb-2">快速创建文件夹</div>
            <CreateFolderForm
              onCreate={(name) => void createFolder(name)}
              loading={loading}
              defaultName={newFolderName}
            />
          </div>
        ) : null}

        <DesktopCanvas
          viewMode={viewMode}
          projects={filteredProjects}
          folders={folders}
          activeProjectId={selectedProject?.id}
          selectedIds={selectedIds}
          groupedByFolder={groupedByFolder}
          onSelectProject={onSelectProject}
          onOpenProject={(p) => void onOpenProject(p)}
          onContextMenu={onContextMenuFor}
          onCheckToggle={onCheckToggle}
          onDropToFolder={(p, f) => void handleDropToFolder(p, f)}
        />

        <StatusBar
          totalCount={projects.length}
          filteredCount={filteredProjects.length}
          selectedCount={selectedIds.length}
          folderCount={folders.length}
          onClearFilters={onClearFilters}
        />
      </div>

      <Inspector
        open={!!selectedProject}
        selectedProject={selectedProject}
        draftContext={draftContext}
        folders={folders}
        newCampaignName={newCampaignName}
        onNewCampaignNameChange={setNewCampaignName}
        onCreateCampaign={() => void createCampaign()}
        onUpdateMeta={(patch) => void updateProjectMeta(patch)}
        onUpdateDraftContext={setDraftContext}
        onSaveBrandContext={() => void saveBrandContext()}
        onSelectCampaign={(c) => {
          if (selectedProject) onSelectScope(selectedProject, c);
        }}
        onArchive={() => {
          if (selectedProject) void archiveProject(selectedProject);
        }}
        onDelete={() => {
          if (selectedProject) void deleteProject(selectedProject);
        }}
        onClose={() => setSelectedProject(null)}
      />

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          items={buildProjectContextItems({
            isArchived: !!contextMenu.project.is_archived,
            onOpen: () => void onOpenProject(contextMenu.project),
            onSetAsCurrent: () => onSelectScope(contextMenu.project, undefined),
            onArchive: () => void archiveProject(contextMenu.project),
            onDelete: () => void deleteProject(contextMenu.project),
            onCopyName: () => {
              navigator.clipboard?.writeText(contextMenu.project.name);
              triggerToast('项目名已复制', 'info');
            },
          })}
        />
      ) : null}
    </div>
  );
}
