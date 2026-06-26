import type { BrandContext, CampaignRecord, ProjectRecord } from '../../types/workspace';
import { BrandMemoryEditor } from '../brand-memory';
import { PLATFORM_CHOICES, STATUS_CHOICES, STATUS_LABELS } from './types';

interface InspectorMetaProps {
  selectedProject: ProjectRecord;
  draftContext: BrandContext;
  folders: Array<{ id: number; path: string }>;
  onUpdateMeta: (patch: Partial<ProjectRecord>) => void;
  onUpdateDraftContext: (next: BrandContext) => void;
  onSaveBrandContext: () => void;
  brandContextDirty: boolean;
  brandContextSaving: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function InspectorProjectMeta({
  selectedProject,
  draftContext,
  folders,
  onUpdateMeta,
  onUpdateDraftContext,
  onSaveBrandContext,
  brandContextDirty,
  brandContextSaving,
  onArchive,
  onDelete,
  onClose,
}: InspectorMetaProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="desktop-inspector__section">
        <span className="desktop-inspector__label">文件夹</span>
        <input
          className="desktop-inspector__input"
          value={selectedProject.folder_path || ''}
          onChange={(e) => onUpdateMeta({ folder_path: e.target.value })}
          placeholder="文件夹路径"
          list="inspector-folder-list"
        />
        <datalist id="inspector-folder-list">
          {folders.map((f) => (
            <option key={f.id} value={f.path} />
          ))}
        </datalist>
      </div>

      <div className="desktop-inspector__section">
        <span className="desktop-inspector__label">状态</span>
        <select
          className="desktop-inspector__input"
          value={selectedProject.status_tag || 'creating'}
          onChange={(e) => onUpdateMeta({ status_tag: e.target.value })}
        >
          {STATUS_CHOICES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s] || s}
            </option>
          ))}
        </select>
      </div>

      <div className="desktop-inspector__section">
        <span className="desktop-inspector__label">平台标签</span>
        <div className="desktop-inspector__chips">
          {PLATFORM_CHOICES.map((platform) => {
            const active = (selectedProject.platform_tags || []).includes(platform);
            return (
              <button
                key={platform}
                type="button"
                onClick={() => {
                  const current = selectedProject.platform_tags || [];
                  onUpdateMeta({
                    platform_tags: active
                      ? current.filter((p) => p !== platform)
                      : [...current, platform],
                  });
                }}
                className={`desktop-inspector__chip ${active ? 'desktop-inspector__chip--active' : ''}`}
              >
                {platform}
              </button>
            );
          })}
        </div>
      </div>

      <BrandMemoryEditor
        project={selectedProject}
        context={draftContext}
        isDirty={brandContextDirty}
        isSaving={brandContextSaving}
        onChange={onUpdateDraftContext}
        onSave={onSaveBrandContext}
      />

      <div className="border-t border-dashed border-[var(--editorial-stroke)]/30 pt-4 flex gap-2">
        <button type="button" onClick={onArchive} className="desktop-toolbar__btn flex-1">
          {selectedProject.is_archived ? '恢复' : '归档'}
        </button>
        <button type="button" onClick={onDelete} className="desktop-toolbar__btn flex-1 text-rose-500">
          删除
        </button>
      </div>

      <button type="button" onClick={onClose} className="text-[9px] text-[var(--editorial-text-gray)] underline mt-2 self-start">
        关闭检查器
      </button>
    </div>
  );
}

interface InspectorCampaignsProps {
  campaigns: CampaignRecord[];
  onSelectCampaign: (campaign: CampaignRecord) => void;
}

export function InspectorCampaigns({ campaigns, onSelectCampaign }: InspectorCampaignsProps) {
  if (campaigns.length === 0) {
    return <p className="text-[10px] text-[var(--editorial-text-gray)]">暂无活动</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {campaigns.map((campaign) => (
        <button
          key={campaign.id}
          type="button"
          onClick={() => onSelectCampaign(campaign)}
          className="text-left border border-[var(--editorial-stroke)]/40 p-2 hover:border-[var(--editorial-stroke)] transition-all"
        >
          <span className="block text-[10px] font-black">{campaign.name}</span>
          <span className="block text-[9px] text-[var(--editorial-text-gray)] mt-1">
            {campaign.status} / {campaign.objective}
          </span>
        </button>
      ))}
    </div>
  );
}

interface InspectorAssetsProps {
  assets: Array<{ id: number; asset_type: string; title: string; created_at: string }>;
  onOpenLibrary: () => void;
}

export function InspectorAssets({ assets, onOpenLibrary }: InspectorAssetsProps) {
  if (assets.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[10px] text-[var(--editorial-text-gray)]">项目暂无资产记录</p>
        <button type="button" onClick={onOpenLibrary} className="text-[10px] text-[var(--editorial-accent-blue)] font-bold hover:underline self-start">
          → 打开资产库查看
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {assets.slice(0, 5).map((asset) => (
        <div key={asset.id} className="border-b border-dashed border-[var(--editorial-stroke)]/30 pb-1.5 text-[10px]">
          <span className="font-black uppercase">{asset.asset_type}</span>
          <span className="mx-1.5 text-[var(--editorial-text-gray)]">/</span>
          <span>{asset.title}</span>
        </div>
      ))}
      {assets.length > 5 ? (
        <p className="text-[9px] text-[var(--editorial-text-gray)] mt-1">
          还有 {assets.length - 5} 个资产…
        </p>
      ) : null}
      <button type="button" onClick={onOpenLibrary} className="text-[10px] text-[var(--editorial-accent-blue)] font-bold hover:underline self-start mt-1">
        → 打开资产库（{assets.length}）
      </button>
    </div>
  );
}
