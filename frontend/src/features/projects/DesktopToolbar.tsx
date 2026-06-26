import {
  Archive,
  BarChart3,
  CheckSquare,
  CircleDollarSign,
  FileText,
  Folder,
  Grid2X2,
  Layers3,
  ListFilter,
  Plus,
  Search,
  Table2,
  Tag,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ProjectSortKey, ViewMode } from './types';
import { PLATFORM_CHOICES, STATUS_CHOICES, STATUS_LABELS } from './types';

interface DesktopToolbarProps {
  organizationName: string;
  search: string;
  onSearchChange: (next: string) => void;
  platformFilter: string;
  onPlatformFilterChange: (next: string) => void;
  statusFilter: string;
  onStatusFilterChange: (next: string) => void;
  folderOptions: string[];
  folderFilter: string;
  onFolderFilterChange: (next: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (next: ViewMode) => void;
  sortKey: ProjectSortKey;
  onSortKeyChange: (next: ProjectSortKey) => void;
  selectedCount: number;
  filteredCount: number;
  stats: {
    total: number;
    active: number;
    review: number;
    assets: number;
    campaigns: number;
    spend: string;
    archived: number;
  };
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBatchArchive: () => void;
  onBatchReview: () => void;
  onBatchExport: () => void;
  onCreateProjectClick: () => void;
  onCreateFolderClick: () => void;
  createProjectOpen: boolean;
  createFolderOpen: boolean;
}

const VIEW_MODES: Array<{ mode: ViewMode; Icon: LucideIcon; label: string }> = [
  { mode: 'list', Icon: Table2, label: '列表' },
  { mode: 'icon', Icon: Grid2X2, label: '网格' },
  { mode: 'board', Icon: Layers3, label: '看板' },
];

const SORT_OPTIONS: Array<{ value: ProjectSortKey; label: string }> = [
  { value: 'recent', label: '最近活跃' },
  { value: 'name', label: '项目名称' },
  { value: 'campaigns', label: '活动数' },
  { value: 'assets', label: '资产数' },
  { value: 'cost', label: '成本' },
];

interface LabeledSelectProps {
  Icon: LucideIcon;
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  isActive: boolean;
}

/**
 * 带图标+文字前缀的筛选下拉：一眼能看出筛什么。
 *   [📱 平台] [小红书 ▼]
 *   文字部分不可点击（只是标签），右侧是真正的 select。
 *   isActive 时整组高亮（值 ≠ 全部）。
 */
function LabeledSelect({ Icon, label, value, onChange, options, isActive }: LabeledSelectProps) {
  const currentLabel = options.find((o) => o.value === value)?.label || value;
  return (
    <div
      className={`desktop-toolbar__labeled-select ${isActive ? 'desktop-toolbar__labeled-select--active' : ''}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="desktop-toolbar__labeled-select__label">{label}</span>
      <span className="desktop-toolbar__labeled-select__value">{currentLabel}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="desktop-toolbar__labeled-select__native"
        aria-label={label}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * 顶部工具条：搜索 + 平台/状态/文件夹筛选（带图标文字）+ 视图切换 + 批量操作 + 创建按钮。
 * macOS Finder 风格，纯受控展示。
 */
export function DesktopToolbar({
  organizationName,
  search,
  onSearchChange,
  platformFilter,
  onPlatformFilterChange,
  statusFilter,
  onStatusFilterChange,
  folderOptions,
  folderFilter,
  onFolderFilterChange,
  viewMode,
  onViewModeChange,
  sortKey,
  onSortKeyChange,
  selectedCount,
  filteredCount,
  stats,
  onSelectAll,
  onClearSelection,
  onBatchArchive,
  onBatchReview,
  onBatchExport,
  onCreateProjectClick,
  onCreateFolderClick,
  createProjectOpen,
  createFolderOpen,
}: DesktopToolbarProps) {
  const platformOptions = [
    { value: '全部', label: '全部' },
    ...PLATFORM_CHOICES.map((p) => ({ value: p, label: p })),
  ];
  const statusOptions = [
    { value: '全部', label: '全部' },
    ...STATUS_CHOICES.map((s) => ({ value: s, label: STATUS_LABELS[s] || s })),
  ];
  const folderSelectOptions = folderOptions.map((f) => ({ value: f, label: f }));

  const metricItems = [
    { label: '项目', value: stats.total, Icon: Folder },
    { label: '待审', value: stats.review, Icon: CheckSquare },
    { label: '活动', value: stats.campaigns, Icon: BarChart3 },
    { label: '资产', value: stats.assets, Icon: FileText },
    { label: '成本', value: stats.spend, Icon: CircleDollarSign },
  ];

  return (
    <header className="desktop-toolbar">
      <div className="desktop-toolbar__hero">
        <div className="desktop-toolbar__title">
          <span>{organizationName}</span>
          <h2>项目概览</h2>
        </div>
        <div className="desktop-toolbar__metrics">
          {metricItems.map(({ label, value, Icon }) => (
            <div key={label} className="desktop-toolbar__metric">
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="desktop-toolbar__controls">
        <div className="desktop-toolbar__search">
          <Search className="h-3.5 w-3.5 text-[var(--editorial-text-gray)]" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="搜索项目、Brief、平台或状态"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="清空搜索"
              className="desktop-toolbar__icon-btn"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="desktop-toolbar__filter-group">
          <LabeledSelect
            Icon={Tag}
            label="平台"
            value={platformFilter}
            onChange={onPlatformFilterChange}
            options={platformOptions}
            isActive={platformFilter !== '全部'}
          />
          <LabeledSelect
            Icon={FileText}
            label="状态"
            value={statusFilter}
            onChange={onStatusFilterChange}
            options={statusOptions}
            isActive={statusFilter !== '全部'}
          />
          <LabeledSelect
            Icon={Folder}
            label="文件夹"
            value={folderFilter}
            onChange={onFolderFilterChange}
            options={folderSelectOptions}
            isActive={folderFilter !== '全部'}
          />
          <LabeledSelect
            Icon={ListFilter}
            label="排序"
            value={sortKey}
            onChange={(next) => onSortKeyChange(next as ProjectSortKey)}
            options={SORT_OPTIONS}
            isActive={sortKey !== 'recent'}
          />
        </div>

        <div className="desktop-toolbar__view-switch" aria-label="视图切换">
          {VIEW_MODES.map(({ mode, Icon, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onViewModeChange(mode)}
              className={`desktop-toolbar__btn desktop-toolbar__btn--icon ${viewMode === mode ? 'desktop-toolbar__btn--active' : ''}`}
              title={label}
              aria-label={label}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        <div className="desktop-toolbar__selection">
          {selectedCount === 0 ? (
            <>
              <span>{filteredCount} 个结果</span>
              <button type="button" onClick={onSelectAll} className="desktop-toolbar__btn" title="全选当前筛选结果">
                全选
              </button>
            </>
          ) : (
            <>
              <span>{selectedCount} 个已选</span>
              <button type="button" onClick={onBatchArchive} className="desktop-toolbar__btn">
                <Archive className="h-3.5 w-3.5" />
                归档
              </button>
              <button type="button" onClick={onBatchReview} className="desktop-toolbar__btn">
                待审
              </button>
              <button type="button" onClick={onBatchExport} className="desktop-toolbar__btn">
                导出
              </button>
              <button type="button" onClick={onClearSelection} className="desktop-toolbar__btn desktop-toolbar__btn--icon" title="取消选择">
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        <div className="desktop-toolbar__actions">
          <button
            type="button"
            onClick={onCreateFolderClick}
            className={`desktop-toolbar__btn ${createFolderOpen ? 'desktop-toolbar__btn--active' : ''}`}
            title="新建文件夹"
          >
            <Folder className="h-3.5 w-3.5" />
            文件夹
          </button>
          <button
            type="button"
            onClick={onCreateProjectClick}
            className={`desktop-toolbar__btn desktop-toolbar__btn--primary ${createProjectOpen ? 'desktop-toolbar__btn--active' : ''}`}
          >
            <Plus className="h-3.5 w-3.5" />
            新建项目
          </button>
        </div>
      </div>
    </header>
  );
}
