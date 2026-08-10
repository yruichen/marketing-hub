import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import type { AssetRecord, BrandContext, CampaignRecord, FolderRecord, ProjectRecord } from '../../types/workspace';
import { apiGet } from '../../hooks/useApi';
import { PublishTemplateDialog } from '../assets/PublishTemplateDialog';
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
  brandContextDirty: boolean;
  brandContextSaving: boolean;
  onSelectCampaign: (campaign: CampaignRecord) => void;
  onSetCurrent: () => void;
  //  () => void;
  onDelete: () => void;
  onClose: () => void;
  onOpenAssetsLibrary: () => void;
  onPublishAsset?: (asset: AssetRecord, creatorNote?: string, projectSlug?: string) => Promise<boolean>;
  projectSlug?: string;
  onAssetsChanged?: () => void;
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
  brandContextDirty,
  brandContextSaving,
  onSelectCampaign,
  onSetCurrent,
  onDelete,
  onClose,
  onOpenAssetsLibrary,
  onPublishAsset,
  projectSlug,
  onAssetsChanged,
}: InspectorProps) {
  const [publishTarget, setPublishTarget] = useState<{ id: number; title: string } | null>(null);
  const [publishingAssetId, setPublishingAssetId] = useState<number | null>(null);

  const handlePublishClick = useCallback((assetId: number) => {
    const asset = selectedProject?.assets.find((item) => item.id === assetId);
    if (!asset) return;
    setPublishTarget({ id: asset.id, title: asset.title });
  }, [selectedProject?.assets]);

  const confirmPublish = useCallback(async (creatorNote: string) => {
    if (!onPublishAsset || !publishTarget) return;
    setPublishingAssetId(publishTarget.id);
    try {
      const fullAsset = await apiGet<AssetRecord>(`/workspace/assets/${publishTarget.id}/`);
      const ok = await onPublishAsset(fullAsset, creatorNote, projectSlug);
      if (ok) {
        setPublishTarget(null);
        onAssetsChanged?.();
      }
    } finally {
      setPublishingAssetId(null);
    }
  }, [onPublishAsset, publishTarget, projectSlug, onAssetsChanged]);

  return (
    <aside className={`desktop-inspector ${open ? 'desktop-inspector--open' : ''}`}>
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
            <div className="desktop-inspector__hero">
              <p className="desktop-inspector__hero-label">当前查看</p>
              <h3>{selectedProject.name}</h3>
              <p>{selectedProject.brief || '暂无 Brief'}</p>
              <button type="button" onClick={onSetCurrent} className="desktop-toolbar__btn desktop-toolbar__btn--primary w-full justify-center">
                设为当前文件夹
              </button>
            </div>

            <CollapsibleSection title="元数据 + 品牌记忆" defaultOpen>
              <InspectorProjectMeta
                selectedProject={selectedProject}
                draftContext={draftContext}
                folders={folders}
                onUpdateMeta={onUpdateMeta}
                onUpdateDraftContext={onUpdateDraftContext}
                onSaveBrandContext={onSaveBrandContext}
                brandContextDirty={brandContextDirty}
                brandContextSaving={brandContextSaving}
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
                  disabled={!newCampaignName.trim()}
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
              <div className="max-h-[320px] overflow-y-auto">
                <InspectorAssets
                  assets={selectedProject.assets}
                  onOpenLibrary={onOpenAssetsLibrary}
                  onPublishAsset={onPublishAsset ? handlePublishClick : undefined}
                  publishingAssetId={publishingAssetId}
                />
              </div>
            </CollapsibleSection>
          </>
        ) : (
          <div className="desktop-inspector__empty">
            <span>项目详情</span>
            <p>从左侧列表选择一个项目，详情会显示在这里。页面宽度不会因为打开详情而跳动。</p>
          </div>
        )}
      </div>

      {publishTarget ? (
        <PublishTemplateDialog
          open
          assetTitle={publishTarget.title}
          loading={publishingAssetId === publishTarget.id}
          onClose={() => setPublishTarget(null)}
          onConfirm={(note) => void confirmPublish(note)}
        />
      ) : null}
    </aside>
  );
}
