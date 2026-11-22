import { X_RELAY } from './x-client.ts';

export function installXFixture() {
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (resource, options) => {
    const url = new URL(typeof resource === 'string' ? resource : resource instanceof URL ? resource.href : resource.url, location.href);
    if (url.origin !== X_RELAY) return fetchOriginal(resource, options);
    if (url.pathname === '/2/users/me') return Promise.resolve(Response.json({ data: { id: '123' } }));
    if (url.pathname.endsWith('/timelines/reverse_chronological')) {
      const page = url.searchParams.has('pagination_token') ? 1 : 0;
      const data: Array<{ id: string; author_id: string; created_at: string; text: string; public_metrics: { reply_count: number; retweet_count: number; like_count: number; quote_count: number }; attachments?: { media_keys: string[] }; referenced_tweets?: { type: string; id: string }[] }> = Array.from({ length: 10 }, (_, i) => ({
        id: String(page * 10 + i), author_id: '1', created_at: '2026-11-21T08:00:00Z',
        text: page === 0 && i === 1 ? Array.from({ length: 20 }, (_, n) => `Reading line ${n + 1} of this long post.`).join(' ') + ' ' + 'End of post.' : `Fixture post ${page * 10 + i + 1}: Testing X timeline on glasses.`,
        public_metrics: { reply_count: 12, retweet_count: 34, like_count: 56, quote_count: 7 },
      }));
      if (!page) {
        data[0].attachments = { media_keys: ['photo'] };
        data[0].referenced_tweets = [{ type: 'quoted', id: 'quote' }];
      }
      return Promise.resolve(Response.json({ data, includes: {
        users: [{ id: '1', username: 'fixture', name: 'Fixture Author', profile_image_url: '/src/assets/stamp-head.webp' }],
        tweets: [{ id: 'quote', author_id: '1', text: 'Quoted text from the original post.' }],
        media: [{ media_key: 'photo', type: 'photo', url: '/src/assets/stamp-base.webp' }],
      }, meta: page ? {} : { next_token: 'page-two' } }));
    }
    return Promise.resolve(new Response('', { status: 404 }));
  };
  return { accessToken: 'fixture-token', clientId: '', refreshToken: '' };
}
