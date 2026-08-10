import { useEffect, useMemo, useState } from 'react';
import { enUS } from './catalogs/en-US';
import { zhCN } from './catalogs/zh-CN';
import { I18nContext, type I18nContextValue, type Locale, type TranslationKey } from './context';

const catalogs: Record<Locale, Record<TranslationKey, string>> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

const STORAGE_KEY = 'mh_locale';

function resolveInitialLocale(): Locale {
  const stored = typeof window !== 'undefined' ? window.localStorage?.getItem(STORAGE_KEY) : null;
  if (stored === 'zh-CN' || stored === 'en-US') return stored;
  const browserLocale = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN';
  return browserLocale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(resolveInitialLocale);
  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (key) => catalogs[locale][key] ?? catalogs['zh-CN'][key],
  }), [locale]);

  useEffect(() => {
    window.localStorage?.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
