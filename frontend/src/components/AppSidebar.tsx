import type { AppSection } from '../shared/stores/uiStore';
import { NAV_SECTIONS } from '../app/navigation';

type AppSidebarProps = {
  activeTab: AppSection;
  onNavigate: (tab: AppSection) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  username: string | null;
  onLogout: () => void;
};

export function AppSidebar({
  activeTab,
  onNavigate,
  darkMode,
  onToggleDarkMode,
  username,
  onLogout,
}: AppSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 w-[260px] border-r border-[var(--editorial-stroke)] bg-[var(--editorial-bg)] shadow-editorial-lg xl:shadow-none xl:static xl:w-auto xl:h-full xl:min-h-0 xl:overflow-hidden flex flex-col justify-between shrink-0 px-3 xl:px-4 pt-4 xl:pt-5 pb-3 border-b-0">
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex flex-col gap-1 select-none">
          <h1 className="serif-header text-lg font-bold tracking-tight text-[var(--editorial-text)]">
            Marketing-Hub
          </h1>
          <p className="text-[10px] text-[var(--editorial-text-gray)] font-semibold leading-snug">
            营销内容工作台
          </p>
        </div>

        <nav className="flex flex-col gap-4 font-mono flex-1 min-h-0 overflow-y-auto pr-1">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-[9px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)] mb-2 px-1">
                {section.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      title={item.hint}
                      className={`w-full text-left px-2.5 py-2 text-[11px] transition-all cursor-pointer flex items-center gap-2 border rounded-sm ${
                        isActive
                          ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] shadow-editorial-sm text-[var(--editorial-text)]'
                          : 'border-transparent text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)] hover:bg-[var(--editorial-paper)]/70'
                      }`}
                    >
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

      <div className="pt-3 border-t border-dashed border-[var(--editorial-stroke)]/40 space-y-3 font-mono">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-bold text-[var(--editorial-text-gray)]">深色模式</span>
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label="切换深色模式"
            className="h-5 w-10 border border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] relative transition-all active:scale-95 cursor-pointer"
          >
            <div
              className={`h-3 w-3 bg-[var(--editorial-stroke)] absolute top-0.5 transition-all ${
                darkMode ? 'right-0.5' : 'left-0.5'
              }`}
            />
          </button>
        </div>
        <div className="text-xs font-bold flex flex-col gap-1">
          <span className="text-[var(--editorial-text)]">{username || 'ROOT'}</span>
          <span className="text-[8px] bg-[var(--editorial-unselected)] text-[var(--editorial-text-gray)] px-1 py-0.5 inline-block w-fit">
            管理员
          </span>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full text-left py-1.5 text-[10px] text-rose-500 font-bold transition-all hover:underline cursor-pointer"
        >
          退出登录
        </button>
      </div>
    </aside>
  );
}
