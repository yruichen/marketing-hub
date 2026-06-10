import { Folder, BookOpen, Check } from 'lucide-react';
import type { MouseEvent, KeyboardEvent } from 'react';

interface DesktopIconProps {
  id: number;
  name: string;
  kind: 'project' | 'folder';
  isSelected: boolean;
  isChecked: boolean;
  isActive: boolean;
  onClick: (event: MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (event: MouseEvent) => void;
  onCheckToggle: () => void;
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
}

/**
 * 单个桌面图标：项目 = 手帐本（BookOpen），文件夹 = Folder。
 * 单击选中，双击"打开"（触发 active 选中），右键弹菜单，左上角多选框。
 */
export function DesktopIcon({
  name,
  kind,
  isSelected,
  isChecked,
  isActive,
  onClick,
  onDoubleClick,
  onContextMenu,
  onCheckToggle,
  draggable,
  onDragStart,
}: DesktopIconProps) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onDoubleClick();
    }
  };

  const Glyph = kind === 'folder' ? Folder : BookOpen;
  const glyphColor = kind === 'folder' ? 'var(--editorial-accent-yellow)' : 'var(--editorial-text)';

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={handleKeyDown}
      className={`desktop-icon ${isSelected ? 'desktop-icon--selected' : ''}`}
      aria-label={name}
    >
      <div
        role="checkbox"
        aria-checked={isChecked}
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          onCheckToggle();
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            onCheckToggle();
          }
        }}
        className={`desktop-icon__checkbox ${isChecked ? 'desktop-icon__checkbox--checked' : ''}`}
      >
        {isChecked ? <Check className="h-2.5 w-2.5" /> : null}
      </div>

      {isActive ? <span className="desktop-icon__check" aria-hidden>✓</span> : null}

      <div className="desktop-icon__glyph" style={{ color: glyphColor }}>
        <Glyph size={48} strokeWidth={kind === 'folder' ? 1.5 : 1.5} fill={kind === 'folder' ? 'currentColor' : 'none'} />
      </div>

      <span className={`desktop-icon__name ${isSelected ? 'desktop-icon__name--selected' : ''}`}>{name}</span>
    </div>
  );
}
