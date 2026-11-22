import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocale } from '../src/news/i18n/locale-registry.ts';
import { BUILT_IN_RSS_FEEDS } from '../src/server/news-feeds.ts';

test('news uses the original locale resolution and three feeds for each locale', () => {
  for (const [language, expected] of [['ko-KR', 'ko'], ['en-US', 'en'], ['ja-JP', 'ja'], ['zh-TW', 'zh-Hant'], ['invalid', 'en']]) {
    const locale = resolveLocale(language);
    assert.equal(locale, expected);
    assert.equal(BUILT_IN_RSS_FEEDS.filter(feed => feed.locale === locale).length, 3);
  }
});
