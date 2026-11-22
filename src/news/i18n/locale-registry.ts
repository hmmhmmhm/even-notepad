import tags from './locale-tags.ts';

export type SupportedLocale = typeof tags[number][0];
const supported = new Set<string>(tags.map(([code]) => code));
const normalize = (value: unknown) => String(value || '').trim().replaceAll('_', '-').toLowerCase();

export const isSupportedLocale = (value: unknown): value is SupportedLocale => typeof value === 'string' && supported.has(value);

// Preserve Sandevistan's exact-tag, then base-language, then English fallback order.
export function resolveLocale(language: unknown): SupportedLocale {
  const normalized = normalize(language);
  const base = normalized.split('-')[0];
  return tags.find(([, choices]) => choices.some(tag => normalize(tag) === normalized))?.[0]
    ?? tags.find(([, choices]) => choices.some(tag => normalize(tag).split('-')[0] === base))?.[0]
    ?? 'en';
}
