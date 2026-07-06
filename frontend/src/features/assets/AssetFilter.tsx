import { Boxes, FileText, Image as ImageIcon, Layers3, Music, PenTool, Sparkles, Video, X } from 'lucide-react';
import type { AssetFilterState, AssetPreviewFilter, AssetSourceFilter, AssetTypeFilter } from './types';
import { ASSET_TYPE_LABELS } from './types';

interface AssetFilterProps {
  filter: AssetFilterState;
  onChange: (next: AssetFilterState) => void;
  typeCounts?: Partial<Record<AssetTypeFilter, number>>;
  sourceCounts?: Partial<Record<AssetSourceFilter | 'unknown', number>>;
  previewCounts?: {
    with_file: number;
    records_only: number;
  };
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
const SOURCES: AssetSourceFilter[] = ['all', 'workflow', 'generation', 'manual'];
const PREVIEWS: AssetPreviewFilter[] = ['all', 'with_file', 'records_only'];

const SOURCE_ICON: Record<AssetSourceFilter, typeof Boxes> = {
  all: Boxes,
  workflow: Layers3,
  generation: Sparkles,
  manual: PenTool,
};

const SOURCE_LABEL: Record<AssetSourceFilter, string> = {
  all: '全部来源',
  workflow: '工作流产物',
  generation: '直接生成',
  manual: '手工上传',
};

const PREVIEW_LABEL: Record<AssetPreviewFilter, string> = {
  all: '全部预览',
  with_file: '有文件预览',
  records_only: '仅记录',
};

/**
 * 资产库筛选条：类型 chips + 搜索框 + 总数。数量徽标从后端 type_counts 拿。
 */
export function AssetFilter({ filter, onChange, typeCounts, sourceCounts, previewCounts, total }: AssetFilterProps) {
  return (
    <div className="assets-filter">
      <div className="assets-filter__group">
        <div className="assets-filter__label">
          <span>素材类型</span>
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
      </div>

      <div className="assets-filter__group">
        <div className="assets-filter__label">
          <span>来源</span>
        </div>
        <div className="assets-filter__chips">
          {SOURCES.map((source) => {
            const Icon = SOURCE_ICON[source];
            const active = filter.source === source;
            const count = source === 'all' ? total : sourceCounts?.[source] ?? 0;
            return (
              <button
                key={source}
                type="button"
                onClick={() => onChange({ ...filter, source })}
                className={`assets-filter__chip ${active ? 'is-active' : ''}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{SOURCE_LABEL[source]}</span>
                {count > 0 ? <span className="assets-filter__count">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="assets-filter__group">
        <div className="assets-filter__label">
          <span>预览</span>
        </div>
        <div className="assets-filter__chips">
          {PREVIEWS.map((preview) => {
            const active = filter.preview === preview;
            const count = preview === 'all'
              ? total
              : preview === 'with_file'
              ? previewCounts?.with_file ?? 0
              : previewCounts?.records_only ?? 0;
            return (
              <button
                key={preview}
                type="button"
                onClick={() => onChange({ ...filter, preview })}
                className={`assets-filter__chip ${active ? 'is-active' : ''}`}
              >
                <span>{PREVIEW_LABEL[preview]}</span>
                {count > 0 ? <span className="assets-filter__count">{count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="assets-filter__search">
        <input
          value={filter.search}
          onChange={(e) => onChange({ ...filter, search: e.target.value })}
          placeholder="搜索标题、标签、节点或产出类型"
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
