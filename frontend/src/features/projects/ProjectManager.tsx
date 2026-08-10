import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Library } from 'lucide-react';
import { apiDelete, apiFetch, apiGet, apiPatch, apiPost, buildErrorToast } from '../../hooks/useApi';
import type {
  BrandContext,
  CampaignRecord,
  FolderRecord,
  ProjectRecord,
} from '../../types/workspace';
import { DesktopSidebar } from './DesktopSidebar';
import { DesktopCanvas } from './DesktopCanvas';
import { Inspector } from './Inspector';
import { ContextMenu } from './ContextMenu';
import { buildProjectContextItems } from './contextMenuItems';
import { CreateFolderForm } from './CreateFolderForm';
import { CreateProjectForm } from './CreateProjectForm';
import { useFilteredProjects } from './useFilteredProjects';
import {
  EMPTY_BRAND_CONTEXT,
  getProjectActivityTime,
  getProjectFolder,
  type ProjectDetail,
  type ProjectForm,
  type ProjectManagerProps,
  type ProjectSortKey,
  type ViewMode,
} from './types';
import './desktop.css';
import '../assets/assets.css';

interface ContextMenuState {
  x: number;
  y: number;
  project: ProjectRecord;
}

const ALL_FILTER = '全部';

export function ProjectManager({ organization, activeProjectId, onSelectScope, triggerToast, onOpenAssetsLibrary, onOpenTemplateLibrary, onPublishAsset }: ProjectManagerProps) {
  const queryClient = useQueryClient();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search] = useState('');
  const [platformFilter] = useState(ALL_FILTER);
  const [statusFilter] = useState(ALL_FILTER);
  const [folderFilter] = useState(ALL_FILTER);
  const [sidebarFolderPath, setSidebarFolderPath] = useState<string>(ALL_FILTER);
  const [viewMode] = useState<ViewMode>('list');
  const [sortKey] = useState<ProjectSortKey>('recent');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [newFolderName] = useState('');
  const [newProject, setNewProject] = useState<ProjectForm>({
    name: '',
    brief: '',
    folder_id: null,
    folder_path: '',
    platform_tags: [],
    status_tag: 'creating',
  });
  const [newCampaignName, setNewCampaignName] = useState('');
  const [draftContext, setDraftContext] = useState<BrandContext>(EMPTY_BRAND_CONTEXT);
  const [brandContextSaving, setBrandContextSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [trashProjects, setTrashProjects] = useState<ProjectRecord[]>([]);
  const [trashFolders, setTrashFolders] = useState<FolderRecord[]>([]);
  const [deletedFolders, setDeletedFolders] = useState<FolderRecord[]>([]);
  const initialFolderSetRef = useRef(false);

  const organizationSlug = organization?.slug ?? null;
  const projectsQueryKey = useMemo(() => ['projects', organizationSlug], [organizationSlug]);
  const foldersQueryKey = useMemo(() => ['projects-folders', organizationSlug], [organizationSlug]);
  const brandContextDirty = useMemo(
    () => JSON.stringify(draftContext) !== JSON.stringify({ ...EMPTY_BRAND_CONTEXT, ...(selectedProject?.brand_context || {}) }),
    [draftContext, selectedProject?.brand_context],
  );

  // ===== data fetch =====
  const fetchProjects = useCallback(
    async (preferredProjectId?: number) => {
      if (!organizationSlug) {
        setProjects([]);
        setFolders([]);
        setSelectedProject(null);
        return;
      }
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
          setSelectedIds([detail.id]);
          setDraftContext({ ...EMPTY_BRAND_CONTEXT, ...(detail.brand_context || {}) });
          setInspectorOpen(false);
        } else {
          setSelectedProject(null);
          setSelectedIds([]);
          setInspectorOpen(false);
        }
      } catch (err) {
        triggerToast(buildErrorToast(err, '项目列表加载失败'));
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

  // On initial mount, default to first folder when folders are loaded
  const foldersReady = folders.length > 0;
  useEffect(() => {
    if (foldersReady && !initialFolderSetRef.current && sidebarFolderPath === ALL_FILTER) {
      initialFolderSetRef.current = true;
      setSidebarFolderPath(folders[0].path);
    }
  }, [foldersReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadProject = useCallback(
    async (projectId: number, openInspector = true) => {
      setLoading(true);
      try {
        const detail = await apiGet<ProjectDetail>(`/projects/${projectId}/`);
        setSelectedProject(detail);
        setSelectedIds([detail.id]);
        setDraftContext({ ...EMPTY_BRAND_CONTEXT, ...(detail.brand_context || {}) });
        setInspectorOpen(openInspector);
      } catch (err) {
        triggerToast(buildErrorToast(err, '项目详情加载失败'));
      } finally {
        setLoading(false);
      }
    },
    [triggerToast],
  );

  // 监听工作流运行事件，刷新当前选中项目的详情（含 assets）。
  useEffect(() => {
    const onAssetsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: number }>).detail;
      if (!detail?.projectId) return;
      if (selectedProject?.id === detail.projectId) {
        void loadProject(detail.projectId, inspectorOpen);
      }
    };
    window.addEventListener('mh:assets-updated', onAssetsUpdated);
    return () => window.removeEventListener('mh:assets-updated', onAssetsUpdated);
  }, [selectedProject?.id, inspectorOpen, loadProject]);

  useEffect(() => {
    const onOpenProject = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: number; openInspector?: boolean }>).detail;
      if (!detail?.projectId) return;
      void loadProject(detail.projectId, detail.openInspector ?? true);
    };
    window.addEventListener('mh:open-project', onOpenProject);
    return () => window.removeEventListener('mh:open-project', onOpenProject);
  }, [loadProject]);

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
    } catch (err) {
      triggerToast(buildErrorToast(err, '文件夹创建失败'));
    } finally {
      setLoading(false);
    }
  };

  const deleteFolder = async (folder: FolderRecord) => {
    try {
      await apiDelete(`/folders/${folder.id}/`);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setDeletedFolders((prev) => [...prev, folder]);
      triggerToast('文件夹已移至回收站', 'info');
    } catch (err) {
      triggerToast(buildErrorToast(err, '文件夹删除失败'));
    }
  };

  const restoreFolder = async (folder: FolderRecord) => {
    try {
      await apiPost(`/folders/${folder.id}/restore/`, {});
      setTrashFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setFolders((prev) => [...prev, folder]);
      triggerToast('文件夹已恢复', 'success');
    } catch (err) {
      triggerToast(buildErrorToast(err, '文件夹恢复失败'));
    }
  };

  const permanentDeleteFolder = async (folder: FolderRecord) => {
    if (!window.confirm(`永久删除文件夹「${folder.path}」？不可恢复。`)) return;
    try {
      await apiDelete(`/folders/${folder.id}/?permanent=true`);
    } catch {
      // ignore
    }
    setTrashFolders((prev) => prev.filter((f) => f.id !== folder.id));
    setDeletedFolders((prev) => prev.filter((f) => f.id !== folder.id));
    triggerToast('文件夹已永久删除', 'info');
  };

  const createProject = async () => {
    if (!organization || !newProject.name.trim() || !newProject.brief.trim()) return;
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
      setNewProject({
        name: '',
        brief: '',
        folder_id: null,
        folder_path: '',
        platform_tags: [],
        status_tag: 'creating',
      });
      await fetchProjects(project.id);
      await loadProject(project.id, true);
    } catch (err) {
      triggerToast(buildErrorToast(err, '项目创建失败'));
    } finally {
      setLoading(false);
    }
  };

  const saveBrandContext = async () => {
    if (!selectedProject) return;
    setBrandContextSaving(true);
    try {
      const project = await apiPatch<ProjectRecord>(`/projects/${selectedProject.id}/`, {
        brand_context: draftContext,
        brief: selectedProject.brief,
      });
      setSelectedProject({ ...selectedProject, ...project });
      setProjects((prev) => prev.map((item) => (item.id === project.id ? { ...item, ...project } : item)));
      setDraftContext({ ...EMPTY_BRAND_CONTEXT, ...(project.brand_context || {}) });
      triggerToast('品牌记忆已保存', 'success');
    } catch (err) {
      triggerToast(buildErrorToast(err, '品牌记忆保存失败'));
    } finally {
      setBrandContextSaving(false);
    }
  };

  const updateProjectMeta = async (patch: Partial<ProjectRecord>) => {
    if (!selectedProject) return;
    try {
      const project = await apiPatch<ProjectRecord>(`/projects/${selectedProject.id}/`, patch);
      setSelectedProject({ ...selectedProject, ...project });
      await fetchProjects(selectedProject.id);
    } catch (err) {
      triggerToast(buildErrorToast(err, '项目元数据更新失败'));
    }
  };

  const createCampaign = async () => {
    if (!selectedProject || !newCampaignName.trim()) return;
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
      setNewCampaignName('');
      triggerToast('活动已创建', 'success');
    } catch (err) {
      triggerToast(buildErrorToast(err, '活动创建失败'));
    }
  };

  const deleteProject = async (project: ProjectRecord) => {
    if (!window.confirm(`将「${project.name}」移至回收站？30 天后自动永久删除。`)) return;
    try {
      await apiDelete(`/projects/${project.id}/`);
      if (selectedProject?.id === project.id) {
        setSelectedProject(null);
        setInspectorOpen(false);
      }
      await fetchProjects();
      triggerToast('项目已移至回收站', 'info');
    } catch (err) {
      triggerToast(buildErrorToast(err, '项目删除失败'));
    }
  };

  const restoreProject = async (project: ProjectRecord) => {
    try {
      await apiPost(`/projects/${project.id}/restore/`, {});
      await fetchProjects(selectedProject?.id);
      triggerToast('项目已从回收站恢复', 'success');
    } catch (err) {
      triggerToast(buildErrorToast(err, '项目恢复失败'));
    }
  };

  const handleDropToFolder = async (project: ProjectRecord, folder: FolderRecord) => {
    if (getProjectFolder(project) === folder.path) return;
    try {
      await apiPatch<ProjectRecord>(`/projects/${project.id}/`, {
        ...(folder.id > 0 ? { folder_id: folder.id } : {}),
        folder_path: folder.path,
      });
      await fetchProjects(project.id);
      triggerToast('项目已移动到目标文件夹', 'success');
    } catch (err) {
      triggerToast(buildErrorToast(err, '项目移动失败'));
    }
  };

  const toggleSelected = (projectId: number) => {
    setSelectedIds((prev) => (prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]));
  };

  // ===== derived state =====
  const displayFolders = useMemo(() => {
    const foldersByPath = new Map<string, FolderRecord>();
    const projectCountByPath = new Map<string, number>();

    for (const project of projects) {
      const path = getProjectFolder(project);
      projectCountByPath.set(path, (projectCountByPath.get(path) || 0) + 1);
    }

    for (const folder of folders) {
      const path = folder.path || folder.name || '默认文件夹';
      if (!foldersByPath.has(path)) {
        foldersByPath.set(path, { ...folder, path });
      }
    }

    for (const project of projects) {
      const path = getProjectFolder(project);
      if (!foldersByPath.has(path)) {
        foldersByPath.set(path, {
          id: -foldersByPath.size - 1,
          organization_id: project.organization_id,
          parent_id: null,
          name: path,
          slug: path,
          path,
          sort_order: foldersByPath.size,
          permission_scope: 'workspace',
          project_count: 0,
          is_archived: false,
          created_at: project.created_at,
          updated_at: project.updated_at,
        });
      }
    }

    return Array.from(foldersByPath.values())
      .map((folder) => ({
        ...folder,
        project_count: projectCountByPath.get(folder.path) || 0,
      }))
      .sort((a, b) => (a.sort_order - b.sort_order) || a.path.localeCompare(b.path, 'zh-CN'));
  }, [folders, projects]);

  // When sidebar folder changes, load trash if needed
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (sidebarFolderPath === '__trash__' && organizationSlug) {
      try {
        const params = new URLSearchParams({ organization: organizationSlug, trash: 'true' });
        apiFetch(`/projects/?${params.toString()}`)
          .then((r) => r.ok ? r.json() : [])
          .then((data) => setTrashProjects(Array.isArray(data) ? data : []))
          .catch(() => setTrashProjects([]));
        apiFetch(`/folders/?${params.toString()}`)
          .then((r) => r.ok ? r.json() : [])
          .then((data) => setTrashFolders(Array.isArray(data) ? data : []))
          .catch(() => setTrashFolders([]));
      } catch { setTrashProjects([]); }
    }
  }, [sidebarFolderPath, organizationSlug]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const sidebarScopedProjects = useMemo(() => {
    if (sidebarFolderPath === ALL_FILTER) return projects;
    if (sidebarFolderPath === '__trash__') return trashProjects;
    return projects.filter((p) => getProjectFolder(p) === sidebarFolderPath);
  }, [projects, sidebarFolderPath, trashProjects]);

  const filteredProjectsBase = useFilteredProjects(sidebarScopedProjects, {
    search,
    platformFilter,
    statusFilter,
    folderFilter,
  });

  const filteredProjects = useMemo(() => {
    const sorted = [...filteredProjectsBase];
    sorted.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      if (sortKey === 'campaigns') return (b.campaign_count || 0) - (a.campaign_count || 0);
      if (sortKey === 'assets') return (b.asset_count || 0) - (a.asset_count || 0);
      if (sortKey === 'cost') return Number(b.total_cost_usd || 0) - Number(a.total_cost_usd || 0);
      return Date.parse(getProjectActivityTime(b)) - Date.parse(getProjectActivityTime(a));
    });
    return sorted;
  }, [filteredProjectsBase, sortKey]);

  // ===== selection / open =====
  const onSelectProject = (project: ProjectRecord, event: MouseEvent) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      toggleSelected(project.id);
      return;
    }
    setSelectedIds([project.id]);
    void loadProject(project.id, false);
  };

  const onOpenProject = async (project: ProjectRecord) => {
    setSelectedIds([project.id]);
    await loadProject(project.id, true);
  };

  const setProjectAsCurrent = (project: ProjectRecord, campaign?: CampaignRecord) => {
    onSelectScope(project, campaign);
  };

  const onContextMenuFor = (project: ProjectRecord, event: MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, project });
  };

  const onCheckToggle = (projectId: number) => {
    toggleSelected(projectId);
  };

  const closeContextMenu = () => setContextMenu(null);

  return (
    <div className="desktop-shell relative">
      <DesktopSidebar
        folders={displayFolders}
        projects={projects}
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
        onCreateFolder={() => setShowCreateFolder((v) => !v)}
        onDeleteFolder={deleteFolder}
        deletedFolderCount={deletedFolders.length + trashFolders.length}
        loading={loading}
      />

      <div className="desktop-canvas">
        <div className="desktop-canvas__intro">
          <p>
            项目用于归类收纳资产库中选中的产出。在资产库多选后「加入项目」，再在此查看、整理并发布到模板库。
          </p>
          <div className="desktop-canvas__flow">
            <button type="button" onClick={onOpenAssetsLibrary} className="desktop-canvas__flow-link">
              资产库
            </button>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
            <span>我的项目</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
            <button type="button" onClick={onOpenTemplateLibrary} className="desktop-canvas__flow-link" disabled={!onOpenTemplateLibrary}>
              <Library className="h-3 w-3 inline mr-1" />
              模板库
            </button>
          </div>
        </div>
        {showCreateProject ? (
          <div className="desktop-create-panel">
            <CreateProjectForm
              form={newProject}
              folders={displayFolders}
              loading={loading}
              onChange={setNewProject}
              onCreate={() => void createProject()}
            />
          </div>
        ) : null}

        {showCreateFolder ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCreateFolder(false)}>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-5 shadow-[var(--shadow-soft)] w-[360px]" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-black mb-3">新建文件夹</h3>
              <CreateFolderForm
                onCreate={(name) => {
                  void createFolder(name);
                  setShowCreateFolder(false);
                }}
                loading={loading}
                defaultName={newFolderName}
              />
            </div>
          </div>
        ) : null}

        <DesktopCanvas
          viewMode={viewMode}
          projects={filteredProjects}
          folders={displayFolders}
          activeProjectId={activeProjectId}
          selectedIds={selectedIds}
          isTrashView={sidebarFolderPath === '__trash__'}
          trashFolders={trashFolders}
          onRestoreFolder={restoreFolder}
          onPermanentDeleteFolder={permanentDeleteFolder}
          loading={loading}
          onSelectProject={onSelectProject}
          onOpenProject={(p) => void onOpenProject(p)}
          onSetCurrentProject={setProjectAsCurrent}
          onContextMenu={onContextMenuFor}
          onCheckToggle={onCheckToggle}
          onDropToFolder={(p, f) => void handleDropToFolder(p, f)}
        />

      </div>

      <Inspector
        open={inspectorOpen && !!selectedProject}
        selectedProject={selectedProject}
        draftContext={draftContext}
        folders={displayFolders}
        newCampaignName={newCampaignName}
        onNewCampaignNameChange={setNewCampaignName}
        onCreateCampaign={() => void createCampaign()}
        onUpdateMeta={(patch) => void updateProjectMeta(patch)}
        onUpdateDraftContext={setDraftContext}
        onSaveBrandContext={() => void saveBrandContext()}
        brandContextDirty={brandContextDirty}
        brandContextSaving={brandContextSaving}
        onSelectCampaign={(c) => {
          if (selectedProject) setProjectAsCurrent(selectedProject, c);
        }}
        onSetCurrent={() => {
          if (selectedProject) setProjectAsCurrent(selectedProject, undefined);
        }}
        onDelete={() => {
          if (selectedProject) void deleteProject(selectedProject);
        }}
        onClose={() => setInspectorOpen(false)}
        onOpenAssetsLibrary={onOpenAssetsLibrary ?? (() => undefined)}
        onPublishAsset={onPublishAsset}
        projectSlug={selectedProject?.slug}
        onAssetsChanged={() => {
          if (selectedProject) void loadProject(selectedProject.id, inspectorOpen);
        }}
      />

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          items={buildProjectContextItems({
            isDeleted: !!contextMenu.project.deleted_at,
            onOpen: () => void onOpenProject(contextMenu.project),
            onSetAsCurrent: () => setProjectAsCurrent(contextMenu.project, undefined),
            onRestore: () => void restoreProject(contextMenu.project),
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
