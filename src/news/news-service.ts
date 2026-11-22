import type { EvenStorage } from './live-cache';
import type { DataState, NewsItem } from './live-state';
import { resolveNews } from './news.ts';
import { resolveLocale } from './i18n/locale-registry.ts';

export { resolveLocale };

// A cache from one phone language must never be shown in another language.
export function loadNews(storage: EvenStorage, language: string, options: { fetch?: typeof fetch; onCached?: (state: DataState<readonly NewsItem[]>) => void; force?: boolean } = {}) {
  const locale = resolveLocale(language);
  const scoped = {
    getLocalStorage: (key: string) => storage.getLocalStorage(`${key}:${locale}`),
    setLocalStorage: (key: string, value: string) => storage.setLocalStorage(`${key}:${locale}`, value),
  };
  return resolveNews(scoped, options.fetch || fetch, Date.now(), options.onCached, options.force || false, locale);
}
