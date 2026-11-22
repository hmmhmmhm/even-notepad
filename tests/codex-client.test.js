import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCodexClient } from '../src/codex-client.ts';

const respond = data => ({ ok: true, json: async () => data });

test('reports a confirmed session writer lock without resending the draft', async () => {
  const statuses = [];
  let posts = 0;
  const client = createCodexClient({ onStatus: s => statuses.push(s), fetcher: async url => {
    if (url.endsWith('/api/prompt')) {
      posts++;
      return { ok: false, status: 500, json: async () => ({ error: 'thread abc already has an active writer' }) };
    }
    return respond({ state: 'idle', messages: [] });
  } });
  await client.connect('http://localhost', 'token');
  client.select('abc');
  assert.equal(await client.send('http://localhost', 'token', 'draft'), false);
  assert.equal(posts, 1);
  assert.match(statuses.at(-1), /Session in use.*Draft kept/);
});

test('submits to the selected idle session without assigning its events to the prompt', async () => {
  const calls = [], statuses = [];
  const client = createCodexClient({ onStatus: status => statuses.push(status), fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/api/prompt')) return respond({ sessionId: 's' });
    return respond({ state: 'idle', messages: [{ id: 2, type: 'result', text: 'external' }] });
  } });
  await client.connect('http://localhost', 'token');
  client.select('s');
  assert.equal(await client.send('http://localhost', 'token', 'mine'), true);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { provider: 'codex', sessionId: 's', text: 'mine' });
  assert.equal(statuses.at(-1), 'Request received');
  assert.equal(calls.length, 3);
});

test('rejects malformed URLs and reports HTTP errors', async () => {
  const statuses = [];
  const client = createCodexClient({ onUpdate: () => {}, onStatus: s => statuses.push(s), fetcher: async () => ({ ok: false, status: 401 }) });
  await assert.rejects(client.send('https://host.test/path', 'token', 'hello'));
  await client.send('https://host.test', 'token', 'hello');
  assert.match(statuses.at(-1), /401/);
});

test('trims pasted whitespace from the server address and token', async () => {
  let authorization;
  const client = createCodexClient({ onUpdate: () => {}, onStatus: () => {}, wait: async () => {}, fetcher: async (url, options) => {
    authorization = options.headers.Authorization;
    if (url.endsWith('/api/prompt')) return { ok: true, json: async () => ({ sessionId: 's' }) };
    return { ok: true, json: async () => ({ messages: [{ id: 1, type: 'result', text: 'ok', success: true }] }) };
  } });
  await client.send(' http://127.0.0.1:3456 ', '  token  ', 'hello');
  assert.equal(authorization, 'Bearer token');
});

test('observes the active external turn without replaying a completed response', async () => {
  let resolveBatch;
  const batch = new Promise(resolve => { resolveBatch = resolve; });
  const client = createCodexClient({ onUpdate: () => {}, onStatus: () => {}, wait: () => new Promise(() => {}), fetcher: async url => {
    if (url.includes('/api/sessions?')) return { ok: true, json: async () => ({ sessions: [] }) };
    return { ok: true, json: async () => ({ state: 'busy', messages: [{ id: 1, type: 'result', text: 'old' }, { id: 2, type: 'user_prompt', text: 'new' }, { id: 3, type: 'text_delta', text: 'live' }] }) };
  } });
  await client.connect('http://localhost:3456', 'token');
  const stop = client.watch('s', events => resolveBatch(events));
  const events = await batch; stop();
  assert.deepEqual(events.map(e => e.type), ['user_prompt', 'text_delta']);
});

test('does not expose an unbound permission decision API', () => {
  const client = createCodexClient({ onUpdate: () => {}, onStatus: () => {} });
  assert.equal(client.respondPermission, undefined);
});

test('interrupt sends the selected session to the official server endpoint', async () => {
  let sent;
  const client = createCodexClient({ onStatus: () => {}, fetcher: async (url, options) => {
    if (url.endsWith('/api/interrupt')) sent = JSON.parse(options.body);
    return respond(url.endsWith('/api/interrupt') ? { ok: true } : { sessions: [] });
  } });
  await client.connect('http://localhost', 'token');
  await client.interruptSession('selected');
  assert.deepEqual(sent, { sessionId: 'selected', provider: 'codex' });
});

test('busy, awaiting, and unrecognized session states keep a draft without submitting', async () => {
  for (const state of ['busy', 'awaiting', undefined]) {
    const calls = [], statuses = [];
    const client = createCodexClient({ onStatus: status => statuses.push(status), fetcher: async url => {
      calls.push(url);
      return respond({ state, messages: [] });
    } });
    await client.connect('http://localhost', 'token');
    client.select('s');
    assert.equal(await client.send('http://localhost', 'token', 'draft'), false);
    assert.match(statuses.at(-1), /Draft kept/);
    assert.equal(calls.some(url => url.endsWith('/api/prompt')), false);
    assert.equal(client.stop, undefined);
  }
});

test('a lost submission response preserves the draft without retrying the POST', async () => {
  let posts = 0;
  const statuses = [];
  const client = createCodexClient({ onStatus: status => statuses.push(status), fetcher: async () => {
    posts++;
    throw new Error('disconnected');
  } });
  assert.equal(await client.send('http://localhost', 'token', 'draft'), false);
  assert.equal(posts, 1);
  assert.match(statuses.at(-1), /Receipt unconfirmed/);
});

test('a first poll that returns late still reports events after submission preflight', async () => {
  let finishPoll, observe;
  const firstPoll = new Promise(resolve => { finishPoll = resolve; });
  const observed = new Promise(resolve => { observe = resolve; });
  let polls = 0;
  const client = createCodexClient({ onStatus() {}, wait: () => new Promise(() => {}), fetcher: async url => {
    if (url.includes('/api/sessions?')) return respond({ sessions: [] });
    if (url.endsWith('/api/prompt')) return respond({ sessionId: 's' });
    if (++polls === 1) return firstPoll;
    return respond({ state: 'idle', messages: [{ id: 1, type: 'result', text: 'history' }] });
  } });
  await client.connect('http://localhost', 'token');
  client.select('s');
  const stop = client.watch('s', observe);
  assert.equal(await client.send('http://localhost', 'token', 'mine'), true);
  finishPoll(respond({ state: 'idle', messages: [
    { id: 1, type: 'result', text: 'history' },
    { id: 2, type: 'result', text: 'new shared result' },
  ] }));
  assert.deepEqual((await observed).map(event => event.text), ['new shared result']);
  stop();
});

test('rejects a non-object server response instead of treating it as a session list', async () => {
  const client = createCodexClient({ onStatus: () => {}, fetcher: async () => respond(null) });
  await assert.rejects(client.connect('https://host.test', 'token'), /Invalid server response/);
});

test('keeps the draft when the prompt response has no valid session identifier', async () => {
  const statuses = [];
  let posts = 0;
  const client = createCodexClient({ onStatus: status => statuses.push(status), fetcher: async url => {
    if (url.endsWith('/api/prompt')) { posts++; return respond({ sessionId: 123 }); }
    return respond({ sessions: [] });
  } });
  await client.connect('https://host.test', 'token');
  assert.equal(await client.send('https://host.test', 'token', 'draft'), false);
  assert.equal(posts, 1);
  assert.match(statuses.at(-1), /Receipt unconfirmed.*Draft kept/);
});


test('preserves tool completion events with structured detail from the server', async () => {
  let deliver;
  const received = new Promise(resolve => { deliver = resolve; });
  const client = createCodexClient({ onStatus: () => {}, wait: () => new Promise(() => {}), fetcher: async url => {
    if (url.includes('/api/sessions?')) return respond({ sessions: [] });
    return respond({ state: 'busy', messages: [{ id: 1, type: 'tool_end', name: 'Shell', toolId: 'one', summary: null, detail: { input: { command: 'pwd' }, output: '/tmp' } }] });
  } });
  await client.connect('https://host.test', 'token');
  const stop = client.watch('s', events => deliver(events), { replay: true });
  const events = await received; stop();
  assert.equal(events[0].detail.output, '/tmp');
  assert.equal(events[0].summary, undefined);
  assert.equal(events[0].name, 'Shell');
});
