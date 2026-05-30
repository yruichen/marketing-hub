import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, FolderPlus, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPatch, apiPost } from '../hooks/useApi';
import type { BrandContext, CampaignRecord, OrganizationRecord, ProjectRecord, WorkspaceDraftRecord } from '../types/workspace';

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

export function ProjectManager({ organization, activeProjectId, onSelectScope, triggerToast }: ProjectManagerProps) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '新营销项目',
    brief: '新品上市全链路营销活动',
  });
  const [newCampaignName, setNewCampaignName] = useState('Launch Wave');
  const [draftContext, setDraftContext] = useState<BrandContext>(emptyBrandContext);

  const organizationSlug = organization?.slug || 'marketing-hub';

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<ProjectRecord[]>(`/projects/?organization=${encodeURIComponent(organizationSlug)}`);
      setProjects(data);
      const next = data.find((item) => item.id === activeProjectId) || data[0];
      if (next) {
        const detail = await apiGet<ProjectDetail>(`/projects/${next.id}/`);
        setSelectedProject(detail);
        setDraftContext({ ...emptyBrandContext, ...(detail.brand_context || {}) });
      }
    } catch {
      triggerToast('项目列表加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, organizationSlug, triggerToast]);

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

  const createProject = async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const project = await apiPost<ProjectRecord>('/projects/', {
        organization: organization.slug,
        name: newProject.name,
        brief: newProject.brief,
        brand_context: {
          ...emptyBrandContext,
          brand_name: newProject.name,
          campaign_goal: newProject.brief,
        },
      });
      triggerToast('项目已创建', 'success');
      await fetchProjects();
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
      await fetchProjects();
      triggerToast(project.is_archived ? '项目已恢复' : '项目已归档', 'info');
    } catch {
      triggerToast('项目状态更新失败', 'error');
    }
  };

  const deleteProject = async (project: ProjectRecord) => {
    try {
      await apiDelete(`/projects/${project.id}/`);
      setSelectedProject(null);
      await fetchProjects();
      triggerToast('项目已删除', 'info');
    } catch {
      triggerToast('项目删除失败', 'error');
    }
  };

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

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 font-mono">
      <section className="xl:col-span-4 bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial">
        <div className="flex items-center justify-between border-b border-[var(--editorial-stroke)] pb-3 mb-4">
          <h3 className="text-[10px] font-black text-[var(--editorial-text-gray)] uppercase tracking-wider">// PROJECT LIBRARY</h3>
          <button
            type="button"
            onClick={fetchProjects}
            className="border border-[var(--editorial-stroke)] p-1.5 hover:bg-[var(--editorial-unselected)]"
            title="刷新"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="space-y-3 max-h-[430px] overflow-y-auto pr-1">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`border p-3 cursor-pointer transition-all ${
                selectedProject?.id === project.id
                  ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-bg)] shadow-editorial-sm'
                  : 'border-[var(--editorial-stroke)]/40 hover:border-[var(--editorial-stroke)]'
              }`}
              onClick={() => loadProject(project.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-xs font-black text-[var(--editorial-text)]">{project.name}</h4>
                  <span className="text-[8px] text-[var(--editorial-text-gray)] uppercase">{project.slug}</span>
                </div>
                <span className="text-[8px] border border-[var(--editorial-stroke)] px-1.5 py-0.5">
                  {project.is_archived ? 'ARCHIVED' : 'ACTIVE'}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[8px] text-[var(--editorial-text-gray)]">
                <span>{project.campaign_count ?? 0} Campaigns</span>
                <span>{project.asset_count ?? 0} Assets</span>
                <span>{project.draft_count ?? 0} Drafts</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-dashed border-[var(--editorial-stroke)]/40 pt-4 space-y-3">
          <input
            value={newProject.name}
            onChange={(event) => setNewProject({ ...newProject, name: event.target.value })}
            className="w-full bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-xs py-2 focus:outline-none"
          />
          <textarea
            rows={3}
            value={newProject.brief}
            onChange={(event) => setNewProject({ ...newProject, brief: event.target.value })}
            className="w-full bg-[var(--editorial-paper)] border border-[var(--editorial-stroke)] text-xs p-2 resize-none focus:outline-none"
          />
          <button
            type="button"
            onClick={createProject}
            disabled={loading}
            className="w-full btn-editorial-primary py-2.5 text-[10px] font-black uppercase flex items-center justify-center gap-2"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            创建项目
          </button>
        </div>
      </section>

      <section className="xl:col-span-8 space-y-6">
        {selectedProject ? (
          <>
            <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[var(--editorial-stroke)] pb-4">
                <div>
                  <h3 className="text-lg serif-header font-bold">{selectedProject.name}</h3>
                  <p className="text-xs text-[var(--editorial-text-gray)] mt-1 leading-relaxed">{selectedProject.brief}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onSelectScope(selectedProject, selectedProject.campaigns[0])}
                    className="btn-editorial-secondary py-2 px-3 text-[10px] font-black uppercase flex items-center gap-2"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    设为当前
                  </button>
                  <button
                    type="button"
                    onClick={() => archiveProject(selectedProject)}
                    className="border border-[var(--editorial-stroke)] p-2 hover:bg-[var(--editorial-unselected)]"
                    title="归档"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteProject(selectedProject)}
                    className="border border-[var(--editorial-stroke)] p-2 hover:bg-rose-500 hover:text-white"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                {contextFields.map(([key, label]) => (
                  <label key={key} className="flex flex-col gap-1.5 text-[10px] font-black uppercase text-[var(--editorial-text-gray)]">
                    {label}
                    <input
                      value={String(draftContext[key] || '')}
                      onChange={(event) => setDraftContext({ ...draftContext, [key]: event.target.value })}
                      className="bg-transparent border-b-1.5 border-[var(--editorial-stroke)] text-[var(--editorial-text)] text-xs py-2 focus:outline-none font-semibold"
                    />
                  </label>
                ))}
              </div>

              <button
                type="button"
                onClick={saveBrandContext}
                className="mt-5 btn-editorial-primary py-2.5 px-4 text-[10px] font-black uppercase flex items-center gap-2"
              >
                <Save className="h-3.5 w-3.5" />
                保存品牌记忆
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[10px] text-[var(--editorial-text-gray)] font-black uppercase">// CAMPAIGNS</h4>
                  <button
                    type="button"
                    onClick={createCampaign}
                    className="border border-[var(--editorial-stroke)] p-1.5 hover:bg-[var(--editorial-unselected)]"
                    title="新建活动"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  value={newCampaignName}
                  onChange={(event) => setNewCampaignName(event.target.value)}
                  className="w-full bg-transparent border-b border-[var(--editorial-stroke)] text-xs py-2 mb-4 focus:outline-none"
                />
                <div className="space-y-2">
                  {selectedProject.campaigns.map((campaign) => (
                    <button
                      key={campaign.id}
                      type="button"
                      onClick={() => onSelectScope(selectedProject, campaign)}
                      className="w-full text-left border border-[var(--editorial-stroke)]/50 p-3 hover:border-[var(--editorial-stroke)] transition-all"
                    >
                      <span className="block text-xs font-black">{campaign.name}</span>
                      <span className="block text-[9px] text-[var(--editorial-text-gray)] mt-1">{campaign.status} / {campaign.objective}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-5 shadow-editorial-sm">
                <h4 className="text-[10px] text-[var(--editorial-text-gray)] font-black uppercase mb-4">// BOUND ASSETS</h4>
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
          <div className="bg-[var(--editorial-paper)] border-1.5 border-[var(--editorial-stroke)] p-8 shadow-editorial text-xs text-[var(--editorial-text-gray)]">
            请选择或创建项目。
          </div>
        )}
      </section>
    </div>
  );
}
