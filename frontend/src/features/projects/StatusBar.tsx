interface StatusBarProps {
  totalCount: number;
  filteredCount: number;
  selectedCount: number;
  folderCount: number;
  onClearFilters: () => void;
}

/**
 * 桌面底部状态栏：项目总数 / 当前筛选 / 已选 / 文件夹数。
 * macOS Finder 风格，单行受控展示。
 */
export function StatusBar({
  totalCount,
  filteredCount,
  selectedCount,
  folderCount,
  onClearFilters,
}: StatusBarProps) {
  return (
    <div className="desktop-statusbar">
      <span>
        {filteredCount} / {totalCount} 个项目
        {selectedCount > 0 ? ` · 已选 ${selectedCount}` : ''}
        {` · ${folderCount} 个文件夹`}
      </span>
      <div className="desktop-statusbar__actions">
        {filteredCount !== totalCount ? (
          <button type="button" onClick={onClearFilters} className="desktop-statusbar__action">
            清除筛选
          </button>
        ) : null}
      </div>
    </div>
  );
}
