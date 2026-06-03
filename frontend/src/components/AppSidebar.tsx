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
    <aside className="w-full xl:w-auto flex flex-col justify-between shrink-0 p-4 xl:p-6 z-10 xl:my-6 xl:ml-6 xl:mr-2 border-b xl:border-b-0 border-[var(--editorial-stroke)]/20">
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-1 select-none">
          <h1 className="serif-header text-xl font-bold tracking-tight text-[var(--editorial-text)]">
            Marketing-Hub
          </h1>
          <p className="text-[10px] text-[var(--editorial-text-gray)] font-semibold leading-snug">
            营销内容工作台 · 左侧选功能，主区域操作
          </p>
        </div>

        <nav className="flex flex-col gap-5 font-mono max-h-[calc(100vh-12rem)] overflow-y-auto pr-1">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-[9px] font-black uppercase tracking-wider text-[var(--editorial-text-gray)] mb-2 px-1">
                {section.title}
              </p>
              <div className="flex flex-col gap-1">
                {section.items.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      title={item.hint}
                      className={`w-full text-left px-2.5 py-2.5 text-xs transition-all cursor-pointer flex items-start gap-2 border rounded-sm ${
                        isActive
                          ? 'border-[var(--editorial-stroke)] bg-[var(--editorial-paper)] shadow-editorial-sm text-[var(--editorial-text)]'
                          : 'border-transparent text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)] hover:bg-[var(--editorial-paper)]/70'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-black">{item.label}</span>
                        <span className="text-[9px] font-normal text-[var(--editorial-text-gray)] leading-tight">
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

      <div className="pt-6 border-t border-dashed border-[var(--editorial-stroke)]/40 space-y-4 font-mono">
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
