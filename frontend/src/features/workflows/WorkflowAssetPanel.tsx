import { Bot, Boxes, ChevronLeft, Image as ImageIcon, Layers3, Loader2, PackagePlus, RefreshCw, Search, Sparkles } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { useAssets } from '../assets/useAssets';
import type { AssetRecord } from '../../types/workspace';
import type { AssetFilterState } from '../assets/types';

export const WORKFLOW_ASSET_DRAG_TYPE = 'application/x-marketing-hub-asset';

export type WorkflowAssetDragPayload = {
  asset_id: number;
  asset_type: AssetRecord['asset_type'];
  title: string;
  source_url: string;
  metadata: AssetRecord['metadata'];
};

type WorkflowPanelTab = 'assets' | 'ai' | 'nodes';

interface WorkflowAssetPanelProps {
  organizationSlug?: string;
  open: boolean;
  activeTab: WorkflowPanelTab;
  globalAiInstruction: string;
  globalAiLoading: boolean;
  onToggleOpen: () => void;
  onTabChange: (tab: WorkflowPanelTab) => void;
  onGlobalAiInstructionChange: (value: string) => void;
  onApplyGlobalAi: () => void;
  onAddAssetGroup: () => void;
}

const DEFAULT_FILTER: AssetFilterState = { type: 'all', source: 'all', preview: 'all', search: '' };

function assetSummary(asset: AssetRecord) {
  const result = asset.metadata?.result;
  if (result && typeof result === 'object') {
    const text = result.summary || result.body || result.prompt || result.response || result.title;
    if (typeof text === 'string' && text.trim()) return text.trim();
  }
  return asset.tags.slice(0, 3).join(' / ') || asset.metadata?.task_type || asset.asset_type;
}

function WorkflowAssetRow({ asset }: { asset: AssetRecord }) {
  const Icon = asset.asset_type === 'image' ? ImageIcon : Boxes;
  const handleDragStart = (event: DragEvent) => {
    const payload: WorkflowAssetDragPayload = {
      asset_id: asset.id,
      asset_type: asset.asset_type,
      title: asset.title,
      source_url: asset.source_url,
      metadata: asset.metadata || {},
    };
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData(WORKFLOW_ASSET_DRAG_TYPE, JSON.stringify(payload));
    event.dataTransfer.setData('text/plain', asset.title);
  };

  return (
    <article
      draggable
      onDragStart={handleDragStart}
      className="workflow-asset-row"
      title="拖到画布创建素材组，或拖到节点追加为参考素材"
    >
      <div className="workflow-asset-row__thumb">
        {asset.asset_type === 'image' && asset.source_url ? (
          <img src={asset.source_url} alt={asset.title} loading="lazy" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="workflow-asset-row__type">{asset.asset_type}</span>
          {asset.metadata?.source === 'workflow' ? <Layers3 className="h-3 w-3 text-[var(--editorial-accent-blue)]" /> : null}
        </div>
        <h4>{asset.title}</h4>
        <p>{assetSummary(asset)}</p>
      </div>
    </article>
  );
}

export function WorkflowAssetPanel({
  organizationSlug,
  open,
  activeTab,
  globalAiInstruction,
  globalAiLoading,
  onToggleOpen,
  onTabChange,
  onGlobalAiInstructionChange,
  onApplyGlobalAi,
  onAddAssetGroup,
}: WorkflowAssetPanelProps) {
  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const assets = useAssets(organizationSlug || '__missing__', filter, 48);
  const visibleItems = useMemo(
    () => (organizationSlug ? (assets.data?.items ?? []).slice(0, 48) : []),
    [assets.data?.items, organizationSlug],
  );

  return (
    <aside className={`workflow-left-dock ${open ? 'workflow-left-dock--open' : 'workflow-left-dock--closed'}`}>
      <div className="workflow-left-dock__rail">
        <button type="button" onClick={() => { onTabChange('assets'); if (!open) onToggleOpen(); }} className={activeTab === 'assets' && open ? 'is-active' : ''} title="资产">
          <Boxes className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => { onTabChange('ai'); if (!open) onToggleOpen(); }} className={activeTab === 'ai' && open ? 'is-active' : ''} title="AI 微调">
          <Bot className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => { onTabChange('nodes'); if (!open) onToggleOpen(); }} className={activeTab === 'nodes' && open ? 'is-active' : ''} title="节点">
          <Sparkles className="h-4 w-4" />
        </button>
        <button type="button" onClick={onToggleOpen} className="mt-auto" title={open ? '收起工作流侧栏' : '展开工作流侧栏'}>
          <ChevronLeft className={`h-4 w-4 transition-transform ${open ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {open ? (
        <div className="workflow-left-dock__panel">
          {activeTab === 'assets' ? (
            <>
              <header className="workflow-left-dock__header">
                <div>
                  <span>Asset Canvas</span>
                  <h3>资产拖拽</h3>
                </div>
                <button type="button" onClick={assets.refresh} title="刷新资产">
                  <RefreshCw className={`h-3.5 w-3.5 ${assets.loading ? 'animate-spin' : ''}`} />
                </button>
              </header>
              <label className="workflow-left-dock__search">
                <Search className="h-3.5 w-3.5" />
                <input
                  value={filter.search}
                  onChange={(event) => setFilter((prev) => ({ ...prev, search: event.target.value }))}
                  placeholder="搜索资产"
                />
              </label>
              <div className="workflow-left-dock__hint">拖到空白处创建素材组；拖到节点上追加参考素材。</div>
              <button type="button" onClick={onAddAssetGroup} className="workflow-left-dock__primary">
                <PackagePlus className="h-3.5 w-3.5" /> 新建空素材组
              </button>
              <div className="workflow-left-dock__list">
                {!organizationSlug ? <p className="workflow-left-dock__empty">缺少组织上下文，无法加载资产。</p> : null}
                {assets.loading ? <p className="workflow-left-dock__empty"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载资产...</p> : null}
                {assets.error ? <p className="workflow-left-dock__empty">{assets.error}</p> : null}
                {!assets.loading && visibleItems.length === 0 ? <p className="workflow-left-dock__empty">暂无可拖拽资产。</p> : null}
                {visibleItems.map((asset) => <WorkflowAssetRow key={asset.id} asset={asset} />)}
              </div>
            </>
          ) : activeTab === 'ai' ? (
            <>
              <header className="workflow-left-dock__header">
                <div>
                  <span>Global AI</span>
                  <h3>全局微调</h3>
                </div>
              </header>
              <textarea
                value={globalAiInstruction}
                onChange={(event) => onGlobalAiInstructionChange(event.target.value)}
                rows={8}
                className="workflow-left-dock__textarea"
                placeholder="例如：整体改成小红书风格，缩短视频到 15 秒，参考素材保持古风。"
              />
              <button type="button" onClick={onApplyGlobalAi} disabled={globalAiLoading || !globalAiInstruction.trim()} className="workflow-left-dock__primary">
                {globalAiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                应用到当前工作流
              </button>
              <p className="workflow-left-dock__hint">默认只修改节点配置和布局，不自动运行。</p>
            </>
          ) : (
            <>
              <header className="workflow-left-dock__header">
                <div>
                  <span>Node Kit</span>
                  <h3>常用节点</h3>
                </div>
              </header>
              <button type="button" onClick={onAddAssetGroup} className="workflow-left-dock__primary">
                <PackagePlus className="h-3.5 w-3.5" /> 素材组
              </button>
              <p className="workflow-left-dock__hint">更多节点仍可从顶部工具栏添加。</p>
            </>
          )}
        </div>
      ) : null}
    </aside>
  );
}
