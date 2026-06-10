import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * 折叠区段：点击标题展开/收起内容。
 * inspector 内部用它把元数据/品牌记忆/活动/资产分段。
 * 状态本地维护：用户关掉某段后下次选中不自动开（避免噪声）。
 */
export function CollapsibleSection({ title, badge, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`desktop-collapsible ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="desktop-collapsible__header"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="desktop-collapsible__title">{title}</span>
        {badge !== undefined && badge !== '' ? (
          <span className="desktop-collapsible__badge">{badge}</span>
        ) : null}
      </button>
      {open ? <div className="desktop-collapsible__body">{children}</div> : null}
    </section>
  );
}
