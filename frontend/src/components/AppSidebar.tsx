import type { AppSection } from '../shared/stores/uiStore';
import { NAV_SECTIONS } from '../app/navigation';

const DEMO_USERNAME = import.meta.env.VITE_DEMO_USERNAME || 'DEMO';

type AppSidebarProps = {
  activeTab: AppSection;
  onNavigate: (tab: AppSection) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  username: string | null;
  isSuperuser?: boolean;
  onOpenProfile?: () => void;
  onLogout: () => void;
  className?: string;
};

export function AppSidebar({
  activeTab,
  onNavigate,
  darkMode,
  onToggleDarkMode,
  username,
  isSuperuser = false,
  onOpenProfile,
  onLogout,
  className = '',
}: AppSidebarProps) {
  return (
    <aside className={`h-full w-[272px] border-r border-[var(--border-subtle)] bg-[var(--surface-sidebar)] shadow-editorial-lg xl:shadow-none flex flex-col justify-between shrink-0 px-3 xl:px-4 pt-4 xl:pt-5 pb-3 border-b-0 ${className}`}>
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="select-none rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-panel)]/72 px-3 py-3 shadow-[var(--shadow-panel)]">
          <div className="mb-2 h-1.5 w-10 rounded-full bg-[var(--brand-accent)]" />
          <h1 className="serif-header text-lg font-bold tracking-tight text-[var(--editorial-text)]">
            Marketing-Hub
          </h1>
          <p className="mt-1 text-[10px] text-[var(--editorial-text-gray)] font-semibold leading-snug">
            Creative marketing operating system
          </p>
        </div>

        <nav className="app-sidebar-nav flex flex-col gap-4 font-mono flex-1 min-h-0 overflow-y-auto pr-1">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--editorial-text-gray)] mb-2 px-2">
                {section.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.filter((item) => item.id !== 'admin' || isSuperuser).map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      title={item.hint}
                      className={`group relative w-full text-left px-2.5 py-2.5 text-[11px] transition-all cursor-pointer flex items-center gap-2 border rounded-lg ${
                        isActive
                          ? 'border-[var(--border-default)] bg-[var(--surface-active)] text-[var(--editorial-text)] shadow-[var(--shadow-panel)]'
                          : 'border-transparent text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      {isActive && <span className="absolute left-1 top-2 bottom-2 w-1 rounded-full bg-[var(--brand-accent-strong)]" aria-hidden="true" />}
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <span className="font-black truncate">{item.label}</span>
                        <span className="hidden 2xl:inline text-[8px] font-normal text-[var(--editorial-text-gray)] leading-tight truncate max-w-[92px]">
                          {item.hint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="pt-3 border-t border-dashed border-[var(--border-subtle)] space-y-3 font-mono">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-bold text-[var(--editorial-text-gray)]">深色模式</span>
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label="切换深色模式"
            className="h-6 w-11 rounded-full border border-[var(--border-default)] bg-[var(--surface-panel)] relative transition-all active:scale-95 cursor-pointer"
          >
            <div
              className={`h-4 w-4 rounded-full bg-[var(--brand-accent)] absolute top-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.22)] transition-all ${
                darkMode ? 'right-0.5' : 'left-0.5'
              }`}
            />
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenProfile}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-panel)]/72 p-2.5 text-left text-xs font-bold flex flex-col gap-1 transition hover:bg-[var(--surface-hover)]"
        >
          <span className="text-[var(--editorial-text)]">{username || DEMO_USERNAME}</span>
          <span className="text-[8px] rounded-full bg-[var(--surface-muted)] text-[var(--editorial-text-gray)] px-2 py-0.5 inline-block w-fit">
            {isSuperuser ? '超级管理员' : '测试用户'}
          </span>
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="w-full rounded-lg border border-transparent px-2 py-1.5 text-left text-[10px] text-[var(--danger-accent)] font-bold transition-all hover:border-[var(--border-subtle)] hover:bg-[var(--surface-hover)] cursor-pointer"
        >
          退出登录
        </button>
      </div>
    </aside>
  );
}
