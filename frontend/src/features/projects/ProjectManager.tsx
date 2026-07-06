import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Folder } from 'lucide-react';
import type { AssetRecord } from '../../types/workspace';
import { apiDelete, apiFetch, apiGet, apiPatch, apiPost } from '../../hooks/useApi';
import type {
  BrandContext,
  CampaignRecord,
  FolderRecord,
  ProjectRecord,
} from '../../types/workspace';
import { DesktopSidebar } from './DesktopSidebar';
import { DesktopCanvas } from './DesktopCanvas';
import { AssetFilter } from '../assets/AssetFilter';
import { AssetGroup } from '../assets/AssetGroup';
import { AssetFormDialog } from '../assets/AssetFormDialog';
import { AssetPreviewModal } from '../assets/AssetPreviewModal';
import { useAssetGroups } from '../assets/useAssetGroups';
import type { AssetFilterState } from '../assets/types';
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
  formatProjectCost,
  getProjectActivityTime,
  getProjectFolder,
  getProjectStatus,
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

export function ProjectManager({ organization, activeProjectId, onSelectScope, triggerToast, onOpenAssetsLibrary }: ProjectManagerProps) {
  const queryClient = useQueryClient();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState(ALL_FILTER);
  const [statusFilter, setStatusFilter] = useState(ALL_FILTER);
  const [folderFilter, setFolderFilter] = useState(ALL_FILTER);
  const [sidebarFolderPath, setSidebarFolderPath] = useState<string>(ALL_FILTER);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortKey, setSortKey] = useState<ProjectSortKey>('recent');
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
  const [brandContextSaving, setBrandContextSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [selectedFolderInfo, setSelectedFolderInfo] = useState<null | {id: number; name: string; path: string}>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [trashProjects, setTrashProjects] = useState<ProjectRecord[]>([]);
  const [trashFolders, setTrashFolders] = useState<FolderRecord[]>([]);
  const [deletedFolders, setDeletedFolders] = useState<FolderRecord[]>([]);
  const initialFolderSetRef = useRef(false);

  const organizationSlug = organization?.slug || 'marketing-hub';
  const projectsQueryKey = useMemo(() => ['projects', organizationSlug], [organizationSlug]);
  const foldersQueryKey = useMemo(() => ['projects-folders', organizationSlug], [organizationSlug]);
  const brandContextDirty = useMemo(
    () => JSON.stringify(draftContext) !== JSON.stringify({ ...EMPTY_BRAND_CONTEXT, ...(selectedProject?.brand_context || {}) }),
    [draftContext, selectedProject?.brand_context],
  );

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
          setSelectedIds([detail.id]);
          setDraftContext({ ...EMPTY_BRAND_CONTEXT, ...(detail.brand_context || {}) });
          setInspectorOpen(false);
        } else {
          setSelectedProject(null);
          setSelectedIds([]);
          setInspectorOpen(false);
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
      } catch {
        triggerToast('项目详情加载失败', 'error');
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

  const deleteFolder = async (folder: FolderRecord) => {
    try {
      await apiDelete(`/folders/${folder.id}/`);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setDeletedFolders((prev) => [...prev, folder]);
      triggerToast('文件夹已移至回收站', 'info');
    } catch {
      triggerToast('文件夹删除失败', 'error');
    }
  };

  const restoreFolder = async (folder: FolderRecord) => {
    try {
      await apiPost(`/folders/${folder.id}/restore/`, {});
      setTrashFolders((prev) => prev.filter((f) => f.id !== folder.id));
      setFolders((prev) => [...prev, folder]);
      triggerToast('文件夹已恢复', 'success');
    } catch {
      triggerToast('文件夹恢复失败', 'error');
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
      setNewProject({
        name: '新营销项目',
        brief: '新品上市全链路营销活动',
        folder_id: null,
        folder_path: '默认文件夹',
        platform_tags: ['小红书'],
        status_tag: 'creating',
      });
      await fetchProjects(project.id);
      await loadProject(project.id, true);
    } catch {
      triggerToast('项目创建失败', 'error');
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
    } catch {
      triggerToast('品牌记忆保存失败', 'error');
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
    } catch {
      triggerToast('项目删除失败', 'error');
    }
  };

  const restoreProject = async (project: ProjectRecord) => {
    try {
      await apiPost(`/projects/${project.id}/restore/`, {});
      await fetchProjects(selectedProject?.id);
      triggerToast('项目已从回收站恢复', 'success');
    } catch {
      triggerToast('项目恢复失败', 'error');
    }
  };

  const archiveProject = async (_project: ProjectRecord) => {};

  const handleDropToFolder = async (project: ProjectRecord, folder: FolderRecord) => {
    if (getProjectFolder(project) === folder.path) return;
    try {
      await apiPatch<ProjectRecord>(`/projects/${project.id}/`, {
        ...(folder.id > 0 ? { folder_id: folder.id } : {}),
        folder_path: folder.path,
      });
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

  // When sidebar folder changes, look up folder info and load assets
  useEffect(() => {
    if (sidebarFolderPath === '__trash__') {
      setSelectedFolderInfo(null);
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
    } else if (sidebarFolderPath && sidebarFolderPath !== ALL_FILTER) {
      const folder = displayFolders.find((f) => f.path === sidebarFolderPath);
      if (folder) {
        setSelectedFolderInfo({ id: folder.id, name: folder.name, path: folder.path });
      } else {
        setSelectedFolderInfo(null);
      }
    } else {
      setSelectedFolderInfo(null);
    }
  }, [sidebarFolderPath, displayFolders, organizationSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  const folderOptions = useMemo(() => [ALL_FILTER, ...displayFolders.map((f) => f.path)], [displayFolders]);

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

  const groupedByFolder = useGroupedByFolder(displayFolders, filteredProjects);

  const projectStats = useMemo(() => {
    const review = projects.filter((p) => getProjectStatus(p) === 'review' || (p.pending_review_count || 0) > 0).length;
    const assets = projects.reduce((sum, p) => sum + (p.asset_count || 0), 0);
    const campaigns = projects.reduce((sum, p) => sum + (p.campaign_count || 0), 0);
    const spend = projects.reduce((sum, p) => sum + Number(p.total_cost_usd || 0), 0);
    return {
      total: projects.length,
      review,
      assets,
      campaigns,
      spend: formatProjectCost(String(spend)),
    };
  }, [projects]);

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

        {selectedFolderInfo ? (
          <FolderAssetsPanel
            organizationSlug={organizationSlug}
            folderId={selectedFolderInfo.id}
            key={selectedFolderInfo.id}
          />
        ) : (
        <DesktopCanvas
          viewMode={viewMode}
          projects={filteredProjects}
          folders={displayFolders}
          activeProjectId={activeProjectId}
          selectedIds={selectedIds}
          groupedByFolder={groupedByFolder}
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
        )}

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

function FolderAssetsPanel({ organizationSlug, folderId }: { organizationSlug: string; folderId: number }) {
  const [items, setItems] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewAsset, setPreviewAsset] = useState<AssetRecord | null>(null);
  const [filter, setFilter] = useState<AssetFilterState>({ type: 'all', source: 'all', preview: 'all', search: '' });
  const [editAsset, setEditAsset] = useState<AssetRecord | null>(null);

  const loadAssets = useCallback(() => {
    const params = new URLSearchParams({ organization: organizationSlug, folder: String(folderId), page_size: '200' });
    if (filter.type !== 'all') params.set('asset_type', filter.type);
    setLoading(true);
    apiFetch(`/workspace/assets/?${params.toString()}`)
      .then((r) => r.ok ? r.json() : Promise.resolve({ items: [] }))
      .then((data) => { setItems(Array.isArray(data) ? data : (data.items || [])); setLoading(false); })
      .catch(() => { setItems([]); setLoading(false); });
  }, [organizationSlug, folderId, filter]);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const handleEditAsset = (asset: AssetRecord) => setEditAsset(asset);
  const handleSaveEdit = async (input: Parameters<typeof apiFetch>) => {
    await apiPatch(`/workspace/assets/${editAsset!.id}/`, input);
    setEditAsset(null);
    loadAssets();
  };
  const handleDeleteAsset = async (asset: AssetRecord) => {
    if (!window.confirm(`删除「${asset.title}」？此操作不可撤销。`)) return;
    await apiDelete(`/workspace/assets/${asset.id}/`);
    loadAssets();
  };

  const { groups } = useAssetGroups(items);

  return (
    <div className="flex flex-col h-full min-h-0">
      <AssetFilter filter={filter} onChange={setFilter} total={items.length} />
      <div className="flex-1 min-h-0 overflow-y-auto mt-3">
        {loading ? (
          <div className="text-[11px] text-[var(--editorial-text-gray)] p-4">加载中...</div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-[11px] text-[var(--editorial-text-gray)]">暂无资产</div>
        ) : (
          <div className="assets-library__groups">
            {groups.map((group) => (
              <AssetGroup key={group.key} group={group} onPreview={setPreviewAsset} onEdit={handleEditAsset} onDelete={handleDeleteAsset} />
            ))}
          </div>
        )}
      </div>
      {previewAsset ? <AssetPreviewModal asset={previewAsset} onClose={() => setPreviewAsset(null)} /> : null}
      {editAsset ? (
        <AssetFormDialog
          open
          initial={editAsset}
          onClose={() => setEditAsset(null)}
          onSave={(input) => apiPatch(`/workspace/assets/${editAsset.id}/`, input).then(() => { setEditAsset(null); loadAssets(); })}
        />
      ) : null}
    </div>
  );
}
