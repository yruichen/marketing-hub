import { X } from 'lucide-react';
import type { BrandContext, CampaignRecord, FolderRecord, ProjectRecord } from '../../types/workspace';
import {
  InspectorProjectMeta,
  InspectorCampaigns,
  InspectorAssets,
} from './InspectorPanels';
import { CollapsibleSection } from './CollapsibleSection';

interface InspectorProps {
  open: boolean;
  selectedProject: ProjectRecord & {
    campaigns: CampaignRecord[];
    assets: Array<{ id: number; asset_type: string; title: string; created_at: string }>;
  } | null;
  draftContext: BrandContext;
  folders: FolderRecord[];
  newCampaignName: string;
  onNewCampaignNameChange: (next: string) => void;
  onCreateCampaign: () => void;
  onUpdateMeta: (patch: Partial<ProjectRecord>) => void;
  onUpdateDraftContext: (next: BrandContext) => void;
  onSaveBrandContext: () => void;
  onSelectCampaign: (campaign: CampaignRecord) => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
  onOpenAssetsLibrary: () => void;
}

/**
 * 右侧检查器：选中项目时从右滑入，未选中时滑出但保留组件（保留表单状态）。
 * 内部分三段：项目元数据 + 品牌记忆 / 活动 / 资产。
 */
export function Inspector({
  open,
  selectedProject,
  draftContext,
  folders,
  newCampaignName,
  onNewCampaignNameChange,
  onCreateCampaign,
  onUpdateMeta,
  onUpdateDraftContext,
  onSaveBrandContext,
  onSelectCampaign,
  onArchive,
  onDelete,
  onClose,
  onOpenAssetsLibrary,
}: InspectorProps) {
  return (
    <aside
      className={`desktop-inspector ${open ? 'desktop-inspector--open' : ''}`}
      aria-hidden={!open}
    >
      <div className="desktop-inspector__header">
        <span className="desktop-inspector__title">
          {selectedProject?.name || '未选中'}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭检查器"
          className="p-1 hover:bg-[var(--editorial-unselected)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="desktop-inspector__body">
        {selectedProject ? (
          <>
            <CollapsibleSection title="元数据 + 品牌记忆" defaultOpen>
              <InspectorProjectMeta
                selectedProject={selectedProject}
                draftContext={draftContext}
                folders={folders}
                onUpdateMeta={onUpdateMeta}
                onUpdateDraftContext={onUpdateDraftContext}
                onSaveBrandContext={onSaveBrandContext}
                onArchive={onArchive}
                onDelete={onDelete}
                onClose={onClose}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="活动"
              badge={selectedProject.campaigns.length}
            >
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={newCampaignName}
                  onChange={(e) => onNewCampaignNameChange(e.target.value)}
                  className="desktop-inspector__input flex-1"
                  placeholder="新活动名"
                />
                <button
                  type="button"
                  onClick={onCreateCampaign}
                  className="desktop-toolbar__btn"
                  title="新建活动"
                  aria-label="新建活动"
                >
                  添加
                </button>
              </div>
              <InspectorCampaigns campaigns={selectedProject.campaigns} onSelectCampaign={onSelectCampaign} />
            </CollapsibleSection>

            <CollapsibleSection
              title="资产"
              badge={selectedProject.assets.length}
            >
              <div className="max-h-[240px] overflow-y-auto">
                <InspectorAssets assets={selectedProject.assets} onOpenLibrary={onOpenAssetsLibrary} />
              </div>
            </CollapsibleSection>
          </>
        ) : (
          <p className="text-[10px] text-[var(--editorial-text-gray)]">
            选中一个项目以查看 / 编辑详细信息。
          </p>
        )}
      </div>
    </aside>
  );
}
