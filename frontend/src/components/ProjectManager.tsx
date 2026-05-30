import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowUpDown, CheckSquare, FolderPlus, LayoutGrid, LayoutList, Pencil, Plus, RefreshCw, Save, Search, Tags, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../hooks/useApi';
import type { BrandContext, CampaignRecord, FolderRecord, OrganizationRecord, ProjectRecord, WorkspaceDraftRecord } from '../types/workspace';

interface ProjectDetail extends ProjectRecord {
  campaigns: CampaignRecord[];
  drafts: WorkspaceDraftRecord[];
  assets: Array<{ id: number; asset_type: string; title: string; created_at: string }>;
}

interface ProjectManagerProps {
  organization: OrganizationRecord | null;
  activeProjectId?: number;
  onSelectScope: (project: ProjectRecord, campaign?: CampaignRecord) => void;
  triggerToast: (text: string, type?: 'success' | 'info' | 'error') => void;
}

const emptyBrandContext: BrandContext = {
  brand_name: '',
  audience: '',
  tone: '',
  selling_points: '',
  visual_style: '',
  campaign_goal: '',
};

const platformChoices = ['小红书', '抖音', '微信公众号', '视频号', 'B站'];
const statusChoices = ['creating', 'draft', 'published', 'archived'];
const statusLabels: Record<string, string> = {
  creating: '生产中',
  draft: '草稿',
  review: '待审',
  published: '已发布',
  archived: '已归档',
};

const formatUsd = (value?: string | number | null) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return '0.0000';
  return parsed.toFixed(4);
};

type ProjectForm = {
  name: string;
  brief: string;
  folder_id: number | null;
  folder_path: string;
  platform_tags: string[];
  status_tag: string;
};

export function ProjectManager({ organization, activeProjectId, onSelectScope, triggerToast }: ProjectManagerProps) {
  const queryClient = useQueryClient();
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('全部');
  const [statusFilter, setStatusFilter] = useState('全部');
  const [folderFilter, setFolderFilter] = useState('全部');
  const [viewMode, setViewMode] = useState<'list' | 'board' | 'grid'>('list');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [newFolderName, setNewFolderName] = useState('默认文件夹');
  const [newProject, setNewProject] = useState<ProjectForm>({
    name: '新营销项目',
    brief: '新品上市全链路营销活动',
    folder_id: null,
    folder_path: '默认文件夹',
    platform_tags: ['小红书'],
    status_tag: 'creating',
  });
  const [newCampaignName, setNewCampaignName] = useState('Launch Wave');
  const [draftContext, setDraftContext] = useState<BrandContext>(emptyBrandContext);

  const organizationSlug = organization?.slug || 'marketing-hub';
  const projectsQueryKey = useMemo(() => ['projects', organizationSlug], [organizationSlug]);
  const foldersQueryKey = useMemo(() => ['folders', organizationSlug], [organizationSlug]);

  const fetchProjects = useCallback(async (preferredProjectId?: number) => {
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
      const next = projectData.find((item) => item.id === preferredProjectId) || projectData.find((item) => item.id === activeProjectId) || projectData[0];
      if (next) {
        const detail = await apiGet<ProjectDetail>(`/projects/${next.id}/`);
        setSelectedProject(detail);
        setDraftContext({ ...emptyBrandContext, ...(detail.brand_context || {}) });
      } else {
        setSelectedProject(null);
      }
    } catch {
      triggerToast('项目列表加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, foldersQueryKey, organizationSlug, projectsQueryKey, queryClient, triggerToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchProjects();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchProjects]);

  const loadProject = async (projectId: number) => {
    setLoading(true);
    try {
      const detail = await apiGet<ProjectDetail>(`/projects/${projectId}/`);
      setSelectedProject(detail);
      setDraftContext({ ...emptyBrandContext, ...(detail.brand_context || {}) });
    } catch {
      triggerToast('项目详情加载失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const createFolder = async () => {
    if (!organization || !newFolderName.trim()) return;
    setLoading(true);
    try {
      const folder = await apiPost<FolderRecord>('/folders/', {
        organization: organization.slug,
        name: newFolderName,
        sort_order: folders.length,
        permission_scope: 'workspace',
      });
      setFolders((prev) => [...prev, folder]);
      setNewFolderName('');
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
          ...emptyBrandContext,
          brand_name: newProject.name,
          campaign_goal: newProject.brief,
        },
      });
      triggerToast('项目已创建', 'success');
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
      triggerToast('项目元数据已更新', 'success');
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
    const archiveFirst = window.confirm('建议先归档项目，避免误删。点击“确定”执行归档，点击“取消”继续永久删除确认。');
    if (archiveFirst) {
      await archiveProject(project);
      return;
    }
    if (!window.confirm(`永久删除「${project.name}」后不可恢复。是否继续？`)) return;
    if (!window.confirm('请再次确认：确实要永久删除这个项目吗？')) return;
    try {
      await apiDelete(`/projects/${project.id}/`);
      setSelectedProject(null);
      await fetchProjects();
      triggerToast('项目已删除', 'info');
    } catch {
      triggerToast('项目删除失败', 'error');
    }
  };

  const folderOptions = useMemo(() => ['全部', ...folders.map((folder) => folder.path)], [folders]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const brandText = Object.values(project.brand_context || {}).join(' ');
      const matchesSearch = !search.trim() || `${project.name} ${project.slug} ${project.brief} ${brandText}`.toLowerCase().includes(search.trim().toLowerCase());
      const matchesPlatform = platformFilter === '全部' || (project.platform_tags || []).includes(platformFilter);
      const matchesStatus = statusFilter === '全部' || project.status_tag === statusFilter;
      const matchesFolder = folderFilter === '全部' || (project.folder_path_display || project.folder_path || '默认文件夹') === folderFilter;
      return matchesSearch && matchesPlatform && matchesStatus && matchesFolder;
    });
  }, [folderFilter, platformFilter, projects, search, statusFilter]);

  const groupedProjects = useMemo(() => {
    return filteredProjects.reduce<Record<string, ProjectRecord[]>>((acc, project) => {
      const key = project.folder_path_display || project.folder_path || '默认文件夹';
      acc[key] = acc[key] || [];
      acc[key].push(project);
      return acc;
    }, {});
  }, [filteredProjects]);

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
    setSelectedIds((prev) => prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]);
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
    const rows = filteredProjects
      .filter((project) => selectedIds.includes(project.id))
      .map((project) => `${project.name},${project.brief},${(project.platform_tags || []).join('|')},${project.status_tag || ''}`)
      .join('\n');
    navigator.clipboard?.writeText(`项目名称,Brief,平台标签,状态\n${rows}`);
    triggerToast('已复制批量导出 CSV', 'success');
  };

  const projectCard = (project: ProjectRecord) => (
    <div
      key={project.id}
      draggable
      onDragStart={(event) => event.dataTransfer.setData('text/plain', String(project.id))}
      className={`border p-3 transition-all ${
        selectedProject?.id === project.id ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)] shadow-editorial-sm' : 'border-[var(--editorial-stroke)]/40 hover:border-[var(--editorial-stroke)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => toggleSelected(project.id)} className={`border border-[var(--editorial-stroke)] p-1 ${selectedIds.includes(project.id) ? 'bg-[var(--editorial-stroke)] text-[var(--editorial-bg)]' : ''}`} aria-label="选择项目">
          <CheckSquare className="h-3 w-3" />
        </button>
        <button type="button" onClick={() => loadProject(project.id)} className="min-w-0 flex-1 text-left">
          <h4 className="text-xs font-black truncate">{project.name}</h4>
          <span className="text-[8px] text-[var(--editorial-text-gray)] uppercase">{project.folder_path_display || project.folder_path || '默认文件夹'}</span>
          <p className="mt-2 text-[10px] text-[var(--editorial-text-gray)] line-clamp-2 leading-5">{project.brief}</p>
        </button>
        <span className="shrink-0 text-[8px] border border-[var(--editorial-stroke)] px-1.5 py-0.5">{project.is_archived ? '已归档' : statusLabels[project.status_tag || ''] || '进行中'}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[8px] text-[var(--editorial-text-gray)]">
        <span className="truncate">待审 {project.pending_review_count ?? 0}</span>
        <span className="truncate">资产 {project.asset_count ?? 0}</span>
        <span className="truncate" title={project.latest_generation_status || '暂无'}>最近 {statusLabels[project.latest_generation_status || ''] || project.latest_generation_status || '暂无'}</span>
        <span className="truncate" title={`$${formatUsd(project.total_cost_usd)}`}>用量 ${formatUsd(project.total_cost_usd)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {(project.platform_tags || []).map((tag) => (
          <span key={tag} className="border border-[var(--editorial-stroke)]/60 px-1.5 py-0.5 text-[8px]">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );

  const contextFields = useMemo(
    () => [
      ['brand_name', '品牌名称'],
      ['audience', '目标受众'],
      ['tone', '品牌语调'],
      ['selling_points', '核心卖点'],
      ['visual_style', '视觉风格'],
      ['campaign_goal', '活动目标'],
    ] as const,
    [],
  );

  const viewModes: Array<{ mode: 'list' | 'board' | 'grid'; icon: typeof LayoutList; label: string }> = [
    { mode: 'list', icon: LayoutList, label: '列表' },
    { mode: 'board', icon: ArrowUpDown, label: '看板' },
    { mode: 'grid', icon: LayoutGrid, label: '网格' },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] gap-6 font-mono">
      <section className="min-w-0 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial">
        <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-3 mb-4">
          <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider">项目库</h3>
          <button type="button" onClick={() => fetchProjects()} className="border border-[var(--editorial-stroke)] p-1.5 hover:bg-[var(--editorial-unselected)]" title="刷新">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <label className="col-span-2 flex items-center gap-2 border border-[var(--editorial-stroke)] px-2 py-1.5">
            <Search className="h-3.5 w-3.5" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full bg-transparent text-xs focus:outline-none" placeholder="搜索项目" />
          </label>
          <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className="border border-[var(--editorial-stroke)] bg-transparent px-2 py-2 text-xs">
            <option>全部</option>
            {platformChoices.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="border border-[var(--editorial-stroke)] bg-transparent px-2 py-2 text-xs">
            <option>全部</option>
            {statusChoices.map((item) => (
              <option key={item} value={item}>{statusLabels[item] || item}</option>
            ))}
          </select>
          <select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} className="col-span-2 border border-[var(--editorial-stroke)] bg-transparent px-2 py-2 text-xs">
            {folderOptions.map((folder) => (
              <option key={folder}>{folder}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex gap-1">
            {viewModes.map(({ mode, icon: Icon, label }) => (
              <button key={mode} type="button" onClick={() => setViewMode(mode)} className={`border border-[var(--editorial-stroke)] p-2 ${viewMode === mode ? 'bg-[var(--editorial-stroke)] text-[var(--editorial-bg)]' : 'hover:bg-[var(--editorial-unselected)]'}`} title={label} aria-label={label}>
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setSelectedIds(filteredProjects.map((project) => project.id))} className="border border-[var(--editorial-stroke)] px-2 py-1.5 text-[9px] font-black hover:bg-[var(--editorial-unselected)]">
            全选
          </button>
        </div>

        {selectedIds.length > 0 && (
          <div className="border border-[var(--editorial-stroke)] p-2 mb-4 flex flex-wrap gap-2 text-[9px]">
            <span className="font-black py-1">{selectedIds.length} 个已选</span>
            <button type="button" onClick={() => batchPatch({ is_archived: true }, '已批量归档')} className="border border-[var(--editorial-stroke)] px-2 py-1 hover:bg-[var(--editorial-unselected)]">归档</button>
            <button type="button" onClick={() => batchPatch({ status_tag: 'review' }, '已批量设为待审')} className="border border-[var(--editorial-stroke)] px-2 py-1 hover:bg-[var(--editorial-unselected)]">设为待审</button>
            <button type="button" onClick={batchExport} className="border border-[var(--editorial-stroke)] px-2 py-1 hover:bg-[var(--editorial-unselected)]">导出</button>
            <button type="button" onClick={() => setSelectedIds([])} className="border border-[var(--editorial-stroke)] px-2 py-1 hover:bg-[var(--editorial-unselected)]">取消选择</button>
          </div>
        )}

        <div className="space-y-3 max-h-[430px] overflow-y-auto pr-1">
          {filteredProjects.length === 0 && (
            <div className="border border-dashed border-[var(--editorial-stroke)]/50 p-5 text-xs text-[var(--editorial-text-gray)]">
              当前筛选条件下没有项目。
            </div>
          )}
          {viewMode === 'list' && filteredProjects.map((project) => projectCard(project))}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredProjects.map((project) => projectCard(project))}
            </div>
          )}
          {viewMode === 'board' && folders.map((folder) => (
            <div
              key={folder.id}
              className="border border-[var(--editorial-stroke)]/40 p-3"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const projectId = Number(event.dataTransfer.getData('text/plain'));
                const project = projects.find((item) => item.id === projectId);
                if (project) handleDropToFolder(project, folder);
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tags className="h-3.5 w-3.5" />
                  <span className="text-xs font-black">{folder.path}</span>
                </div>
                <span className="text-[9px] text-[var(--editorial-text-gray)]">{groupedProjects[folder.path]?.length || 0}</span>
              </div>
              <div className="mt-3 space-y-2">
                {(groupedProjects[folder.path] || []).length === 0 ? (
                  <div className="border border-dashed border-[var(--editorial-stroke)]/30 p-3 text-[10px] text-[var(--editorial-text-gray)]">
                    拖入项目或创建新项目
                  </div>
                ) : (groupedProjects[folder.path] || []).map((project) => projectCard(project))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-dashed border-[var(--editorial-stroke)]/40 pt-4 space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} className="border border-[var(--editorial-stroke)] bg-transparent px-2 py-2 text-xs" placeholder="新文件夹名称" />
            <button type="button" onClick={createFolder} className="border border-[var(--editorial-stroke)] p-2 hover:bg-[var(--editorial-unselected)]" title="创建文件夹" aria-label="创建文件夹">
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
          <input value={newProject.name} onChange={(event) => setNewProject({ ...newProject, name: event.target.value })} className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none" />
          <textarea rows={3} value={newProject.brief} onChange={(event) => setNewProject({ ...newProject, brief: event.target.value })} className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] text-xs p-2 resize-none focus:outline-none" />
          <div className="grid grid-cols-2 gap-2">
            <select value={newProject.folder_id ?? ''} onChange={(event) => {
              const folder = folders.find((item) => item.id === Number(event.target.value));
              setNewProject({ ...newProject, folder_id: folder?.id ?? null, folder_path: folder?.path || newProject.folder_path });
            }} className="border border-[var(--editorial-stroke)] bg-transparent px-2 py-2 text-xs">
              <option value="">默认文件夹</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.path}</option>)}
            </select>
            <select value={newProject.status_tag} onChange={(event) => setNewProject({ ...newProject, status_tag: event.target.value })} className="border border-[var(--editorial-stroke)] bg-transparent px-2 py-2 text-xs">
              {statusChoices.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {platformChoices.map((platform) => (
              <button
                key={platform}
                type="button"
                onClick={() => setNewProject((prev) => ({
                  ...prev,
                  platform_tags: prev.platform_tags.includes(platform)
                    ? prev.platform_tags.filter((item) => item !== platform)
                    : [...prev.platform_tags, platform],
                }))}
                className={`border px-2 py-1 text-[9px] ${newProject.platform_tags.includes(platform) ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-unselected)]' : 'border-[var(--editorial-stroke)]/40'}`}
              >
                {platform}
              </button>
            ))}
          </div>
          <button type="button" onClick={createProject} disabled={loading} className="w-full btn-editorial-primary py-2.5 text-[10px] font-black uppercase flex items-center justify-center gap-2">
            <FolderPlus className="h-3.5 w-3.5" />
            创建项目
          </button>
        </div>
      </section>

      <section className="min-w-0 space-y-6">
        {selectedProject ? (
          <>
            <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[var(--editorial-stroke)] pb-4">
                <div>
                  <h3 className="text-lg serif-header font-bold">{selectedProject.name}</h3>
                  <p className="text-xs text-[var(--editorial-text-gray)] mt-1 leading-relaxed">{selectedProject.brief}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onSelectScope(selectedProject, selectedProject.campaigns[0])} className="btn-editorial-secondary py-2 px-3 text-[10px] font-black uppercase flex items-center gap-2">
                    <Pencil className="h-3.5 w-3.5" />
                    设为当前
                  </button>
                  <button type="button" onClick={() => archiveProject(selectedProject)} className="border border-[var(--editorial-stroke)] p-2 hover:bg-[var(--editorial-unselected)]" title="归档">
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => deleteProject(selectedProject)} className="border border-[var(--editorial-stroke)] p-2 hover:bg-rose-500 hover:text-white" title="删除">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <input value={selectedProject.folder_path || ''} onChange={(event) => updateProjectMeta({ folder_path: event.target.value })} className="border border-[var(--editorial-stroke)] bg-transparent px-2 py-2 text-xs" placeholder="文件夹路径" />
                <select value={selectedProject.status_tag || 'creating'} onChange={(event) => updateProjectMeta({ status_tag: event.target.value })} className="border border-[var(--editorial-stroke)] bg-transparent px-2 py-2 text-xs">
                  {statusChoices.map((item) => (
                    <option key={item} value={item}>{statusLabels[item] || item}</option>
                  ))}
                </select>
                <div className="col-span-2 flex flex-wrap gap-2">
                  {platformChoices.map((platform) => {
                    const active = (selectedProject.platform_tags || []).includes(platform);
                    return (
                      <button
                        key={platform}
                        type="button"
                        onClick={() => {
                          const current = selectedProject.platform_tags || [];
                          updateProjectMeta({
                            platform_tags: active ? current.filter((item) => item !== platform) : [...current, platform],
                          });
                        }}
                        className={`border px-2 py-1 text-[9px] ${
                          active ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-unselected)]' : 'border-[var(--editorial-stroke)]/40'
                        }`}
                      >
                        {platform}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                {contextFields.map(([key, label]) => (
                  <label key={key} className="flex flex-col gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
                    {label}
                    <input value={String(draftContext[key] || '')} onChange={(event) => setDraftContext({ ...draftContext, [key]: event.target.value })} className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] text-xs py-2 focus:outline-none font-semibold" />
                  </label>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <button type="button" onClick={saveBrandContext} className="btn-editorial-primary py-2.5 px-4 text-[10px] font-black uppercase flex items-center gap-2">
                  <Save className="h-3.5 w-3.5" />
                  保存品牌记忆
                </button>
                <button type="button" onClick={() => updateProjectMeta({ platform_tags: selectedProject.platform_tags || [] })} className="btn-editorial-secondary py-2.5 px-4 text-[10px] font-black uppercase flex items-center gap-2">
                  <Plus className="h-3.5 w-3.5" />
                  只保留当前元数据
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[10px] text-[var(--editorial-text-gray)] font-black uppercase">活动</h4>
                  <button type="button" onClick={createCampaign} className="border border-[var(--editorial-stroke)] p-1.5 hover:bg-[var(--editorial-unselected)]" title="新建活动">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input value={newCampaignName} onChange={(event) => setNewCampaignName(event.target.value)} className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 mb-4 focus:outline-none" />
                <div className="space-y-2">
                  {selectedProject.campaigns.map((campaign) => (
                    <button key={campaign.id} type="button" onClick={() => onSelectScope(selectedProject, campaign)} className="w-full text-left border border-[var(--editorial-stroke)]/50 p-3 hover:border-[var(--editorial-stroke)] transition-all">
                      <span className="block text-xs font-black">{campaign.name}</span>
                      <span className="block text-[9px] text-[var(--editorial-text-gray)] mt-1">
                        {campaign.status} / {campaign.objective}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
                <h4 className="text-[10px] text-[var(--editorial-text-gray)] font-black uppercase mb-4">资产</h4>
                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {selectedProject.assets.length === 0 ? (
                    <p className="text-xs text-[var(--editorial-text-gray)]">暂无资产记录</p>
                  ) : (
                    selectedProject.assets.map((asset) => (
                      <div key={asset.id} className="border-b border-dashed border-[var(--editorial-stroke)]/30 pb-2 text-[10px]">
                        <span className="font-black uppercase">{asset.asset_type}</span>
                        <span className="mx-2 text-[var(--editorial-text-gray)]">/</span>
                        <span>{asset.title}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-8 shadow-editorial text-xs text-[var(--editorial-text-gray)]">请选择或创建项目。</div>
        )}
      </section>
    </div>
  );
}
