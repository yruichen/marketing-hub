import { useEffect, useRef } from 'react';
import type { AppSection } from '../shared/stores/uiStore';
import { NAV_SECTIONS, TEMPLATE_LIBRARY_ENTRY } from '../app/navigation';
import { useI18n } from '../shared/i18n';
import { ArrowUpRight, Languages, LogOut, Moon, UserCircle } from 'lucide-react';

type AppSidebarProps = {
  activeTab: AppSection;
  onNavigate: (tab: AppSection) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  username: string | null;
  isSuperuser?: boolean;
  collapsed?: boolean;
  onOpenProfile?: () => void;
  onOpenTemplateLibrary?: () => void;
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
  collapsed = false,
  onOpenProfile,
  onOpenTemplateLibrary,
  onLogout,
  className = '',
}: AppSidebarProps) {
  const TemplateLibraryIcon = TEMPLATE_LIBRARY_ENTRY.icon;
  const navRef = useRef<HTMLElement>(null);
  const { locale, setLocale, t } = useI18n();

  useEffect(() => {
    if (!navRef.current) return;
    const active = navRef.current.querySelector('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeTab]);

  return (
    <aside className={`h-full border-r border-[var(--border-subtle)] bg-[var(--surface-sidebar)] shadow-editorial-lg xl:shadow-none flex flex-col justify-between shrink-0 border-b-0 transition-[width,padding] duration-200 ${collapsed ? 'w-16 px-2 pt-3 pb-3' : 'w-[220px] px-3 xl:px-4 pt-4 xl:pt-5 pb-3'} ${className}`}>
      <div className={`flex min-h-0 flex-1 flex-col ${collapsed ? 'gap-3' : 'gap-5'}`}>
        <div className={`select-none border border-[var(--border-subtle)] bg-[var(--surface-panel)]/72 shadow-[var(--shadow-panel)] ${collapsed ? 'flex h-11 items-center justify-center rounded-lg p-0' : 'rounded-xl px-3 py-3'}`}>
          {collapsed ? (
            <img src="/brand-mark.svg" alt="Marketing Hub" className="h-8 w-8 rounded-md" />
          ) : (
            <div className="flex items-center gap-3 px-1 py-1">
              <img src="/brand-mark.svg" alt="Marketing Hub" className="h-12 w-12 shrink-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
              <div className="min-w-0 flex-1">
                <h1 className="serif-header text-lg font-bold tracking-tight text-[var(--editorial-text)] leading-tight">
                  Marketing-Hub
                </h1>
                <p className="text-[10px] font-medium text-[var(--editorial-text-gray)] leading-tight mt-0.5">
                  Creative marketing operating system
                </p>
              </div>
            </div>
          )}
        </div>

        {onOpenTemplateLibrary ? (
          <button
            type="button"
            onClick={onOpenTemplateLibrary}
            title={collapsed ? t(TEMPLATE_LIBRARY_ENTRY.labelKey) : t(TEMPLATE_LIBRARY_ENTRY.hintKey)}
            className={`app-sidebar-template-entry group relative w-full text-left text-[11px] transition-all cursor-pointer flex items-center border rounded-lg border-[var(--border-subtle)] bg-[var(--surface-panel)]/88 text-[var(--editorial-text)] shadow-[var(--shadow-panel)] hover:border-[#ff2442]/45 hover:bg-[var(--surface-hover)] ${
              collapsed ? 'h-10 justify-center px-0 py-0' : 'gap-2 px-2.5 py-2.5'
            }`}
          >
            <TemplateLibraryIcon className="h-3.5 w-3.5 shrink-0 text-[#ff2442]" aria-hidden="true" />
            {!collapsed && (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2 font-black">
                <span className="truncate">{t(TEMPLATE_LIBRARY_ENTRY.labelKey)}</span>
                <ArrowUpRight className="h-3 w-3 shrink-0 text-[var(--editorial-text-gray)] group-hover:text-[#ff2442]" aria-hidden="true" />
              </span>
            )}
          </button>
        ) : null}

        <nav ref={navRef} className={`app-sidebar-nav flex flex-col font-mono flex-1 min-h-0 overflow-y-auto ${collapsed ? 'gap-2 pr-0' : 'gap-4 pr-1'}`}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.titleKey}>
              {!collapsed && (
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[var(--editorial-text-gray)] mb-2 px-2">
                  {t(section.titleKey)}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {section.items.filter((item) => item.id !== 'admin' || isSuperuser).map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      title={collapsed ? `${t(item.labelKey)} - ${t(item.hintKey)}` : t(item.hintKey)}
                      data-active={isActive}
                      className={`group relative w-full text-left text-[11px] transition-all cursor-pointer flex items-center border rounded-lg ${
                        collapsed ? 'h-10 justify-center px-0 py-0' : 'gap-2 px-2.5 py-2.5'
                      } ${
                        isActive
                          ? 'border-[var(--border-default)] bg-[var(--surface-active)] text-[var(--editorial-text)] shadow-[var(--shadow-panel)]'
                          : 'border-transparent text-[var(--editorial-text-gray)] hover:text-[var(--editorial-text)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      {isActive && <span className={`absolute ${collapsed ? 'left-1 top-2 bottom-2' : 'left-1 top-2 bottom-2'} w-1 rounded-full bg-[var(--brand-accent-strong)]`} aria-hidden="true" />}
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {!collapsed && (
                        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                          <span className="font-black truncate">{t(item.labelKey)}</span>
                          <span className="hidden 2xl:inline text-[8px] font-normal text-[var(--editorial-text-gray)] leading-tight truncate max-w-[92px]">
                            {t(item.hintKey)}
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className={`pt-3 border-t border-dashed border-[var(--border-subtle)] font-mono ${collapsed ? 'space-y-2' : 'space-y-3'}`}>
        <div className={`flex items-center text-[10px] ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && <span className="font-bold text-[var(--editorial-text-gray)]">{t('shell.darkMode')}</span>}
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={t('shell.toggleDarkMode')}
            className={`${collapsed ? 'h-10 w-10 inline-flex items-center justify-center rounded-lg' : 'h-6 w-11 rounded-full'} border border-[var(--border-default)] bg-[var(--surface-panel)] relative transition-all active:scale-95 cursor-pointer`}
          >
            {collapsed ? (
              <Moon className="h-3.5 w-3.5" />
            ) : (
              <div
                className={`h-4 w-4 rounded-full bg-[var(--brand-accent)] absolute top-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.22)] transition-all ${
                  darkMode ? 'right-0.5' : 'left-0.5'
                }`}
              />
            )}
          </button>
        </div>
        <label className={`flex items-center text-[10px] text-[var(--editorial-text-gray)] ${collapsed ? 'justify-center' : 'justify-between gap-2'}`}>
          <span className="inline-flex items-center gap-1 font-bold">
            <Languages className="h-3.5 w-3.5" aria-hidden="true" />
            {!collapsed && t('shell.language')}
          </span>
          {!collapsed && (
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as 'zh-CN' | 'en-US')}
              className="rounded border border-[var(--border-subtle)] bg-[var(--surface-panel)] px-1.5 py-1 text-[9px] text-[var(--editorial-text)]"
              aria-label={t('shell.language')}
            >
              <option value="zh-CN">中文</option>
              <option value="en-US">English</option>
            </select>
          )}
        </label>
        <button
          type="button"
          onClick={onOpenProfile}
          title={username || '未登录'}
          className={`w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-panel)]/72 text-xs font-bold transition hover:bg-[var(--surface-hover)] ${collapsed ? 'h-10 p-0 inline-flex items-center justify-center' : 'p-2.5 text-left flex flex-col gap-1'}`}
        >
          {collapsed ? (
            <UserCircle className="h-4 w-4" />
          ) : (
            <>
              <span className="text-[var(--editorial-text)]">{username || '未登录'}</span>
              <span className="text-[8px] rounded-full bg-[var(--surface-muted)] text-[var(--editorial-text-gray)] px-2 py-0.5 inline-block w-fit">
                {isSuperuser ? t('shell.superAdmin') : t('shell.member')}
              </span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onLogout}
          title={t('shell.logout')}
          className={`w-full rounded-lg border border-transparent text-[10px] text-[var(--danger-accent)] font-bold transition-all hover:border-[var(--border-subtle)] hover:bg-[var(--surface-hover)] cursor-pointer ${collapsed ? 'h-10 p-0 inline-flex items-center justify-center' : 'px-2 py-1.5 text-left'}`}
        >
          {collapsed ? <LogOut className="h-3.5 w-3.5" /> : t('shell.logout')}
        </button>
      </div>
    </aside>
  );
}
