import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AssetRecord } from '../../types/workspace';
import { AssetCard } from './AssetCard';
import type { AssetGroup } from './types';

interface AssetGroupProps {
  group: AssetGroup;
  defaultOpen?: boolean;
  onPreview: (asset: AssetRecord) => void;
  onEdit?: (asset: AssetRecord) => void;
  onDelete?: (asset: AssetRecord) => void;
  onPublish?: (asset: AssetRecord) => void;
  selectMode?: boolean;
  selectedIds?: number[];
  onToggleSelect?: (assetId: number) => void;
  projectNames?: Record<number, string>;
}

/**
 * 单个分组：标题 + 折叠 + 卡片网格。
 * 状态本地维护（不污染 props），首次默认展开。
 */
export function AssetGroup({ group, defaultOpen = true, onPreview, onEdit, onDelete, onPublish, selectMode, selectedIds, onToggleSelect, projectNames }: AssetGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="asset-group">
      <header className="asset-group__header">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="asset-group__toggle"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="asset-group__title">{group.label}</span>
          <span className="asset-group__count">{group.items.length}</span>
        </button>
        <span className="asset-group__hint">
          {group.hint || `${group.items.length} 个`}
        </span>
      </header>

      {open ? (
        <div className="assets-library__grid asset-group__grid">
          {group.items.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              onPreview={onPreview}
              onEdit={onEdit}
              onDelete={onDelete}
              onPublish={onPublish}
              selectMode={selectMode}
              selected={selectedIds?.includes(asset.id) ?? false}
              onToggleSelect={onToggleSelect}
              projectName={asset.project_id ? projectNames?.[asset.project_id] : undefined}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
