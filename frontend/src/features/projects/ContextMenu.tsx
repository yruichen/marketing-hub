import { useEffect, useRef } from 'react';

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: typeof import('lucide-react').Pencil;
  danger?: boolean;
  divider?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * macOS 风格右键菜单：固定定位，点外部或按 Esc 关闭。
 * 不引入额外 portal：直接在 body 末尾渲染，z-index 提到最高。
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // 防止超出视口
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - items.length * 32 - 20),
  };

  return (
    <div ref={ref} className="desktop-context-menu" style={style} role="menu">
      {items.map((item, i) =>
        item.divider ? (
          <div key={`d-${i}`} className="desktop-context-menu__divider" />
        ) : (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`desktop-context-menu__item ${item.danger ? 'desktop-context-menu__item--danger' : ''}`}
          >
            {item.icon ? (() => {
              const Icon = item.icon;
              return <Icon className="h-3.5 w-3.5" />;
            })() : null}
            <span>{item.label}</span>
          </button>
        ),
      )}
    </div>
  );
}
