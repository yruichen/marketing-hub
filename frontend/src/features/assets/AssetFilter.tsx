import { FileText, Image as ImageIcon, Music, Video, X } from 'lucide-react';
import type { AssetFilterState, AssetTypeFilter } from './types';
import { ASSET_TYPE_LABELS } from './types';

interface AssetFilterProps {
  filter: AssetFilterState;
  onChange: (next: AssetFilterState) => void;
  typeCounts?: Partial<Record<AssetTypeFilter, number>>;
  total: number;
}

const TYPE_ICON: Record<AssetTypeFilter, typeof ImageIcon> = {
  all: FileText,
  image: ImageIcon,
  audio: Music,
  video: Video,
  document: FileText,
};

const TYPES: AssetTypeFilter[] = ['all', 'image', 'audio', 'video', 'document'];

/**
 * 资产库筛选条：类型 chips + 搜索框 + 总数。数量徽标从后端 type_counts 拿。
 */
export function AssetFilter({ filter, onChange, typeCounts, total }: AssetFilterProps) {
  return (
    <div className="assets-filter">
      <div className="assets-filter__label">
        <span>素材类型</span>
        <strong>{total}</strong>
      </div>
      <div className="assets-filter__chips">
        {TYPES.map((t) => {
          const Icon = TYPE_ICON[t];
          const active = filter.type === t;
          const count = t === 'all' ? total : typeCounts?.[t] ?? 0;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange({ ...filter, type: t })}
              className={`assets-filter__chip ${active ? 'is-active' : ''}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t === 'all' ? '全部素材' : ASSET_TYPE_LABELS[t]}</span>
              {count > 0 ? <span className="assets-filter__count">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="assets-filter__search">
        <input
          value={filter.search}
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          placeholder="搜索标题、标签或产出类型"
        />
        {filter.search ? (
          <button
            type="button"
            onClick={() => onChange({ ...filter, search: '' })}
            aria-label="清空搜索"
          >
            <X className="h-3 w-3" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
