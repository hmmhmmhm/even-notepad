import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createXClient, normalizeXTimeline, validateXCredentials } from '../src/x-client.ts';

test('only accepts user token with optional complete refresh credentials', () => {
  assert.equal(validateXCredentials({ accessToken: '' }).ok, false);
  assert.equal(validateXCredentials({ accessToken: 'token', clientId: 'client' }).ok, false);
  assert.equal(validateXCredentials({ accessToken: 'token' }).ok, true);
  assert.equal(validateXCredentials({ accessToken: 'token', clientId: 'client', refreshToken: 'refresh' }).ok, true);
});

test('parses authors, reposts, quotes and pagination without modifying source posts', () => {
  const page = normalizeXTimeline({ data: [{ id: '1', text: 'hello', author_id: '2', referenced_tweets: [{ type: 'quoted', id: '3' }] }], includes: { users: [{ id: '2', username: 'alice' }, { id: '4', username: 'bob' }], tweets: [{ id: '3', author_id: '4', text: 'quoted' }] }, meta: { next_token: 'next' } });
  assert.equal(page.next, 'next');
  assert.equal(page.posts[0].author, 'alice');
  assert.deepEqual(page.posts[0].quotedPost, { author: 'bob', text: 'quoted' });
  assert.deepEqual(page.posts[0].metrics, { replies: 0, reposts: 0, likes: 0, quotes: 0 });
});

test('reposts retain full long-form text, media preview, original author, avatar and counts', () => {
  const { posts: [post] } = normalizeXTimeline({
    data: [{ id: '1', text: 'RT @original: short', author_id: 'u', referenced_tweets: [{ type: 'retweeted', id: '2' }], public_metrics: { quote_count: 9 } }],
    includes: {
      users: [{ id: 'u', name: 'Reader', profile_image_url: 'avatar' }, { id: 'v', name: 'Original' }],
      tweets: [{ id: '2', author_id: 'v', text: 'short', note_tweet: { text: 'full post' }, attachments: { media_keys: ['m'] } }],
      media: [{ media_key: 'm', type: 'video', preview_image_url: 'preview' }],
    },
  });
  assert.equal(post.text, 'full post');
  assert.equal(post.avatarUrl, 'avatar');
  assert.equal(post.imageUrl, 'preview');
  assert.equal(post.repostedFrom.name, 'Original');
  assert.equal(post.metrics.quotes, 9);
});

test('uses fixed relay and retrieves user then timeline with bearer', async () => {
  const calls = [];
  const client = createXClient({ fetcher: async (url, options) => { calls.push({ url, options }); return Response.json(url.endsWith('/2/users/me') ? { data: { id: '12' } } : { data: [{ id: '3', text: 'hello' }] }); } });
  const result = await client.timeline({ accessToken: 'token' });
  assert.equal(result.posts[0].text, 'hello');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.url.startsWith('https://sandevistan-x-relay.hmmhmmhm.workers.dev/')));
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token');
});

test('refreshes a rejected access token once and saves rotated credentials before retrying', async () => {
  let saved, me = 0; const paths = [];
  const client = createXClient({ save: async value => { saved = value; }, fetcher: async (url) => {
    paths.push(url);
    if (url.endsWith('/oauth2/token')) return Response.json({ access_token: 'new', refresh_token: 'rotated', expires_in: 3600 });
    if (url.endsWith('/2/users/me')) return ++me === 1 ? new Response('', { status: 401 }) : Response.json({ data: { id: '1' } });
    return Response.json({ data: [] });
  } });
  await client.timeline({ accessToken: 'old', clientId: 'client', refreshToken: 'refresh' });
  assert.equal(saved.accessToken, 'new'); assert.equal(saved.refreshToken, 'rotated');
  assert.equal(paths.filter(path => path.endsWith('/oauth2/token')).length, 1);
});

test('concurrent requests share one refresh of a rotating token and block redirects', async () => {
  let renewals = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  const client = createXClient({ fetcher: async (url, options) => {
    assert.equal(options.redirect, 'error');
    if (url.endsWith('/oauth2/token')) { renewals++; await pending; return Response.json({ access_token: 'new', refresh_token: 'new-refresh' }); }
    if (options.headers.Authorization === 'Bearer old') return new Response('', { status: 401 });
    if (url.endsWith('/2/users/me')) return Response.json({ data: { id: '1' } });
    return Response.json({ data: [] });
  } });
  const credentials = { accessToken: 'old', clientId: 'client', refreshToken: 'refresh' };
  const a = client.timeline(credentials), b = client.timeline(credentials);
  await new Promise(resolve => setTimeout(resolve, 0)); release(); await Promise.all([a, b]);
  assert.equal(renewals, 1);
});

test('ignores malformed timeline entries and preserves valid posts', () => {
  const result = normalizeXTimeline({ data: [null, { id: 3, text: 'bad' }, { id: '1', text: 'valid', public_metrics: { like_count: 'invalid' } }], includes: { users: [null] } });
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0].text, 'valid');
  assert.equal(result.posts[0].metrics.likes, 0);
});

test('reuses rotated credentials if saving fails before a retry', async () => {
  let renewals = 0, saves = 0;
  const client = createXClient({
    save: async () => { if (++saves === 1) throw new Error('storage failure'); },
    fetcher: async (url, options) => {
      if (url.endsWith('/oauth2/token')) { renewals++; return Response.json({ access_token: 'new', refresh_token: 'rotated' }); }
      if (options.headers.Authorization === 'Bearer old') return new Response('', { status: 401 });
      if (url.endsWith('/2/users/me')) return Response.json({ data: { id: '1' } });
      return Response.json({ data: [] });
    },
  });
  const credentials = { accessToken: 'old', clientId: 'client', refreshToken: 'refresh' };
  await assert.rejects(client.timeline(credentials), /storage failure/);
  await client.timeline(credentials);
  assert.equal(renewals, 1);
  assert.equal(saves, 2);
});


test('does not attach unrelated expansions when an id is missing or invalid', () => {
  const result = normalizeXTimeline({ data: [{ id: '1', text: 'primary' }], includes: { tweets: [{ id: 2, text: 'unrelated', author_id: '3' }], users: [{ id: '3', name: 'Other' }] } });
  assert.equal(result.posts[0].text, 'primary');
  assert.equal(result.posts[0].quotedPost, undefined);
  assert.equal(result.posts[0].repostedFrom, undefined);
});
