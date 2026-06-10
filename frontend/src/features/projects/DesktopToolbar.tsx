import { ArrowUpDown, FileText, Folder, Search, Tag, X } from 'lucide-react';
import type { ViewMode } from './types';
import { PLATFORM_CHOICES, STATUS_CHOICES, STATUS_LABELS } from './types';

interface DesktopToolbarProps {
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
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBatchArchive: () => void;
  onBatchReview: () => void;
  onBatchExport: () => void;
  onCreateProjectClick: () => void;
  onCreateFolderClick: () => void;
}

const VIEW_MODES: Array<{ mode: ViewMode; Icon: typeof FileText; label: string }> = [
  { mode: 'icon', Icon: ArrowUpDown, label: '图标' },
  { mode: 'list', Icon: FileText, label: '列表' },
  { mode: 'board', Icon: Folder, label: '看板' },
];

interface LabeledSelectProps {
  Icon: typeof Search;
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
  selectedCount,
  onSelectAll,
  onClearSelection,
  onBatchArchive,
  onBatchReview,
  onBatchExport,
  onCreateProjectClick,
  onCreateFolderClick,
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

  return (
    <div className="desktop-toolbar">
      <div className="desktop-toolbar__search">
        <Search className="h-3.5 w-3.5 text-[var(--editorial-text-gray)]" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索项目（名称 / 简介 / 平台）"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="清空搜索"
            className="text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)]"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="desktop-toolbar__divider" />

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

      <div className="desktop-toolbar__divider" />

      {VIEW_MODES.map(({ mode, Icon, label }) => (
        <button
          key={mode}
          type="button"
          onClick={() => onViewModeChange(mode)}
          className={`desktop-toolbar__btn ${viewMode === mode ? 'desktop-toolbar__btn--active' : ''}`}
          title={label}
          aria-label={label}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}

      <div className="desktop-toolbar__divider" />

      {selectedCount === 0 ? (
        <button type="button" onClick={onSelectAll} className="desktop-toolbar__btn" title="全选当前筛选结果">
          全选
        </button>
      ) : (
        <>
          <span className="text-[10px] font-black text-[var(--editorial-text)]">{selectedCount} 个已选</span>
          <button type="button" onClick={onBatchArchive} className="desktop-toolbar__btn">
            归档
          </button>
          <button type="button" onClick={onBatchReview} className="desktop-toolbar__btn">
            设为待审
          </button>
          <button type="button" onClick={onBatchExport} className="desktop-toolbar__btn">
            导出
          </button>
          <button type="button" onClick={onClearSelection} className="desktop-toolbar__btn" title="取消选择">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      <div className="flex-1" />

      <button type="button" onClick={onCreateFolderClick} className="desktop-toolbar__btn" title="新建文件夹">
        文件夹
      </button>
      <button type="button" onClick={onCreateProjectClick} className="desktop-toolbar__btn desktop-toolbar__btn--primary">
        新建项目
      </button>
    </div>
  );
}
