export const X_RELAY = 'https://sandevistan-x-relay.hmmhmmhm.workers.dev';

export function validateXCredentials(value: unknown): { ok: false } | { ok: true; value: { accessToken: string; clientId: string; refreshToken: string } } {
  const input = object(value);
  const accessToken = String(input.accessToken || '').trim();
  const clientId = String(input.clientId || '').trim();
  const refreshToken = String(input.refreshToken || '').trim();
  const safe = (text: string) => text.length <= 4096 && !/[\u0000-\u001f\u007f]/u.test(text);
  if (!accessToken || !safe(accessToken) || !safe(clientId) || !safe(refreshToken) || Boolean(clientId) !== Boolean(refreshToken)) return { ok: false };
  return { ok: true, value: { accessToken, clientId, refreshToken } };
}

type JsonObject = Record<string, unknown>;
export type XCredentials = { accessToken: string; clientId?: string; refreshToken?: string };
type RenewCredentials = { accessToken: string; clientId: string; refreshToken: string };
function object(value: unknown): JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {}; }
function string(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function records(value: unknown): JsonObject[] { return Array.isArray(value) ? value.map(object) : []; }
function indexBy(values: JsonObject[], key: string): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (const value of values) { const id = string(value[key]); if (id !== undefined) result.set(id, value); }
  return result;
}
function lookup(values: Map<string, JsonObject>, id: unknown): JsonObject | undefined {
  return typeof id === 'string' ? values.get(id) : undefined;
}

export function normalizeXTimeline(value: unknown) {
  const json = object(value), includes = object(json.includes);
  const users = indexBy(records(includes.users), 'id');
  const referenced = indexBy(records(includes.tweets), 'id');
  const media = indexBy(records(includes.media), 'media_key');
  const posts = records(json.data).flatMap(post => {
    const id = string(post.id), content = string(post.text);
    if (id === undefined || content === undefined) return [];
    const refs = records(post.referenced_tweets);
    const quoted = lookup(referenced, refs.find(item => item.type === 'quoted')?.id);
    const repost = refs.find(item => item.type === 'retweeted');
    const original = lookup(referenced, repost?.id);
    const author = lookup(users, post.author_id);
    const quoteAuthor = lookup(users, quoted?.author_id);
    const originalAuthor = lookup(users, original?.author_id);
    const attachmentKeys = object(post.attachments).media_keys ?? object(original?.attachments).media_keys;
    const keys = Array.isArray(attachmentKeys) ? attachmentKeys.filter((key): key is string => typeof key === 'string') : [];
    const image = keys.map(key => media.get(key)).find(item => string(item?.url) || string(item?.preview_image_url));
    const metrics = object(post.public_metrics), quoteText = string(quoted?.text);
    return [{
      id, author: string(author?.name) ?? string(author?.username) ?? 'X', username: string(author?.username) ?? 'unknown',
      avatarUrl: string(author?.profile_image_url), imageUrl: string(image?.url) ?? string(image?.preview_image_url),
      createdAt: string(post.created_at), text: string(object(original?.note_tweet).text) ?? string(original?.text) ?? string(object(post.note_tweet).text) ?? (repost ? content.replace(/^RT @[^:]+:\s*/u, '') : content),
      metrics: { replies: number(metrics.reply_count), reposts: number(metrics.retweet_count), likes: number(metrics.like_count), quotes: number(metrics.quote_count) },
      quotedPost: quoteText ? { author: string(quoteAuthor?.name) ?? string(quoteAuthor?.username) ?? 'X', text: string(object(quoted?.note_tweet).text) ?? quoteText } : undefined,
      repostedFrom: originalAuthor ? { name: string(originalAuthor.name) ?? string(originalAuthor.username) ?? 'X' } : undefined,
    }];
  });
  return { posts, next: string(object(json.meta).next_token) ?? null };
}

export function createXClient({ fetcher = fetch, save = async () => {} }: { fetcher?: typeof fetch; save?: (value: RenewCredentials) => Promise<void> } = {}) {
  let userId: string | null = null, previousToken: string | null = null;
  let renewal: { old: string; promise: Promise<RenewCredentials> } | null = null;
  let rotated: { old: string; value: RenewCredentials } | null = null;
  async function request(path: string, options: RequestInit = {}) {
    try {
      return await fetcher(X_RELAY + path, { ...options, redirect: 'error', signal: options.signal || AbortSignal.timeout(15000) });
    } catch { throw new Error('Could not reach X relay.'); }
  }
  async function renew(auth: RenewCredentials) {
    if (rotated?.old === auth.refreshToken) { await save(rotated.value); return rotated.value; }
    if (renewal?.old === auth.refreshToken) return renewal.promise;
    const old = auth.refreshToken;
    const promise = (async () => {
      const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: auth.clientId, refresh_token: old });
      const response = await request('/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      if (!response.ok) throw new Error('X authorization expired. Update tokens on phone.');
      const data = object(await response.json());
      if (typeof data?.access_token !== 'string' || typeof data?.refresh_token !== 'string') throw new Error('X token renewal failed. Update tokens on phone.');
      const next = { ...auth, accessToken: data.access_token, refreshToken: data.refresh_token };
      rotated = { old, value: next };
      await save(next);
      return next;
    })();
    renewal = { old, promise };
    try { return await promise; } finally { if (renewal?.promise === promise) renewal = null; }
  }
  return {
    async timeline(credentials: XCredentials, page?: string | null, signal?: AbortSignal) {
      let auth = { ...credentials };
      if (previousToken !== auth.accessToken) { userId = null; previousToken = auth.accessToken; }
      let refreshed = false;
      async function authorized(path: string) {
        let response = await request(path, { headers: { Authorization: 'Bearer ' + auth.accessToken }, signal });
        if (response.status === 401 && !refreshed && auth.clientId && auth.refreshToken) {
          refreshed = true;
          auth = await renew({ accessToken: auth.accessToken, clientId: auth.clientId, refreshToken: auth.refreshToken });
          previousToken = auth.accessToken; userId = null;
          response = await request(path, { headers: { Authorization: 'Bearer ' + auth.accessToken }, signal });
        }
        if (!response.ok) {
          if (response.status === 401) throw new Error('X authorization expired. Update tokens on phone.');
          if (response.status === 403) throw new Error('X access denied. Check your account and permissions.');
          if (response.status === 429) throw new Error('X rate limit reached. Try later.');
          throw new Error('X request failed (' + response.status + ').');
        }
        return object(await response.json());
      }
      if (!userId) {
        const profile = await authorized('/2/users/me');
        const id = object(profile.data).id;
        if (!/^\d+$/.test(String(id || ''))) throw new Error('X profile unavailable.');
        userId = String(id);
      }
      const params = new URLSearchParams({ max_results: '10', expansions: 'author_id,attachments.media_keys,referenced_tweets.id,referenced_tweets.id.author_id', 'tweet.fields': 'created_at,author_id,attachments,public_metrics,referenced_tweets,note_tweet', 'user.fields': 'name,username,profile_image_url', 'media.fields': 'url,preview_image_url,type' });
      if (page) params.set('pagination_token', page);
      return normalizeXTimeline(await authorized('/2/users/' + userId + '/timelines/reverse_chronological?' + params));
    },
  };
}
