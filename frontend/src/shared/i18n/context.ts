import { createContext } from 'react';
import type { zhCN } from './catalogs/zh-CN';

export type Locale = 'zh-CN' | 'en-US';
export type TranslationKey = keyof typeof zhCN;
export type Translate = (key: TranslationKey) => string;

export type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
};

export const I18nContext = createContext<I18nContextValue | null>(null);
