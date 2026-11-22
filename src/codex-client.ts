import type { PendingReply } from './terminal-replies.ts';

export type TerminalEvent = { id?: number; type: string; state?: string; text?: string; name?: string; summary?: string; toolId?: string; description?: string; toolName?: string; detail?: unknown; success?: boolean };
export type Session = { id: string; title?: string; status?: string };
type HistoryEntry = { role: string; text: string };
type ClientOptions = { fetcher?: typeof fetch; onStatus: (status: string) => void; onSession?: (id: string) => void; wait?: (ms: number) => Promise<unknown> };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function optionalText(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function parseTerminalEvent(value: unknown): TerminalEvent | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') return undefined;
  return {
    ...value, type: value.type, id: typeof value.id === 'number' ? value.id : undefined,
    state: optionalText(value.state), text: optionalText(value.text), name: optionalText(value.name),
    summary: optionalText(value.summary), toolId: optionalText(value.toolId), description: optionalText(value.description),
    toolName: optionalText(value.toolName), detail: value.detail, success: typeof value.success === 'boolean' ? value.success : undefined,
  };
}
function eventsOf(value: unknown): TerminalEvent[] {
  return Array.isArray(value) ? value.map(parseTerminalEvent).filter((event): event is TerminalEvent => event !== undefined) : [];
}

function isSession(value: unknown): value is Session {
  return isRecord(value) && typeof value.id === 'string' && (value.title === undefined || typeof value.title === 'string') && (value.status === undefined || typeof value.status === 'string');
}
function isHistory(value: unknown): value is HistoryEntry {
  return isRecord(value) && typeof value.role === 'string' && typeof value.text === 'string';
}
class TerminalServerError extends Error {
  readonly status: number;
  readonly writerLocked: boolean;
  readonly payloadTooLarge: boolean;
  constructor(status: number, detail: string) {
    super('Server error (' + status + ')'); this.status = status;
    this.writerLocked = /already has an active writer/i.test(detail);
    this.payloadTooLarge = /max payload size exceeded/i.test(detail);
  }
}
export function createCodexClient({ fetcher = fetch, onStatus, onSession = () => {}, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }: ClientOptions) {
  let sessionId: string | null = null;
  let active = false;
  let watchCursor: number | null = null;
  let base = '', token = '';
  function parseAddress(url: string) {
    let parsed;
    try { parsed = new URL(url.trim()); } catch { throw new Error('Enter a valid server address.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== '/' && parsed.pathname !== '')) throw new Error('Enter a valid server address.');
    return parsed;
  }
  async function request(path: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
    let response;
    try { response = await fetcher(base + path, { ...options, signal: options.signal || AbortSignal.timeout(path === '/api/prompt' && options.method === 'POST' ? 45000 : 10000), headers: { Authorization: 'Bearer ' + token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } }); }
    catch { throw new Error('Could not connect. Check the server address and connection.'); }
    if (!response.ok) {
      let detail = '';
      try { const body: unknown = await response.json(); if (isRecord(body) && typeof body.error === 'string') detail = body.error; } catch { /* The server may not return JSON. */ }
      throw new TerminalServerError(response.status, detail);
    }
    const body: unknown = await response.json();
    if (!isRecord(body)) throw new Error('Invalid server response.');
    return body;
  }
  return {
    get active() { return active; },
    async connect(url: string, secret: string) {
      const parsed = parseAddress(url);
      secret = secret.trim();
      if (!secret) throw new Error('Enter a token.');
      base = parsed.origin; token = secret;
      const data = await request('/api/sessions?provider=codex&limit=10');
      if (data.error) throw new Error('Could not load sessions. Check the server.');
      return Array.isArray(data.sessions) ? data.sessions.filter(isSession) : [];
    },
    select(id: string) { sessionId = id; watchCursor = null; },
    async history(id: string) {
      const data = await request('/api/sessions/' + encodeURIComponent(id) + '/history?provider=codex&limit=10');
      if (data.error) throw new Error('Could not load history. Check the server.');
      return Array.isArray(data.history) ? data.history.filter(isHistory) : [];
    },
    async suggestReplies({ originalId, helperId, prompt, pending, beforeSubmit, onSession, onSettled = async () => {} }: {
      originalId: string; helperId?: string; prompt: string; pending?: PendingReply;
      beforeSubmit: (pending: PendingReply) => Promise<void>;
      onSession: (id: string) => Promise<void>;
      onSettled?: () => Promise<void>;
    }) {
      const messages = (id: string, after: number) => request('/api/messages?sessionId=' + encodeURIComponent(id) + '&provider=codex&after=' + after);
      let id = helperId;
      if (id === originalId) throw new Error('Original session cannot be used as a reply helper.');
      let marker: string;
      let after = pending?.after ?? 0;
      if (pending) {
        if (!id) throw new Error('Reply helper is unknown.');
        marker = 'Quiet Terminal request ID: ' + pending.nonce;
      } else {
        if (id) {
          const existing = await messages(id, after);
          if (existing.error || existing.state !== 'idle') throw new Error('Helper is busy.');
          for (const event of eventsOf(existing.messages)) if (event.id !== undefined && Number.isSafeInteger(event.id)) after = Math.max(after, event.id);
        }
        const nonce = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
        marker = 'Quiet Terminal request ID: ' + nonce;
        await beforeSubmit({ nonce, after });
        try {
          const result = await request('/api/prompt', {
            method: 'POST',
            body: JSON.stringify({ text: prompt + '\n\n' + marker, provider: 'codex', ...(id ? { sessionId: id } : {}) }),
          });
          if (result.error || typeof result.sessionId !== 'string' || !result.sessionId || result.sessionId === originalId
            || (id && id !== result.sessionId)) throw new Error('Invalid helper session response.');
          id = result.sessionId;
          await onSession(id);
        } catch (error) {
          if (error instanceof TerminalServerError && [400, 401, 403, 404, 409, 422, 429].includes(error.status)) {
            await onSettled();
            throw error;
          }
          if (!id) throw error;
          // A known helper can be checked without submitting again.
        }
      }
      let ownTurn = false;
      let output = '';
      let failed = false;
      const deadline = Date.now() + (pending ? 10000 : 65000);
      while (Date.now() < deadline) {
        const poll = await messages(id, after).catch(() => null);
        if (!poll || poll.error) { await wait(650); continue; }
        for (const event of eventsOf(poll.messages)) {
          if (event.id === undefined || !Number.isSafeInteger(event.id) || event.id <= after) continue;
          after = event.id;
          if (event.type === 'user_prompt') {
            if (ownTurn) {
              await onSettled();
              throw new Error('Helper turn ended without a confirmed result.');
            }
            const suffix = '\n\n' + marker;
            ownTurn = pending ? event.text?.endsWith(suffix) === true : event.text === prompt + suffix;
            output = '';
          }
          if (!ownTurn) continue;
          if (['tool_start', 'tool_end', 'permission_request', 'question_request'].includes(event.type)) failed = true;
          if (event.type === 'text_delta' && !failed) output += event.text || '';
          if (output.length > 2000) failed = true;
          if (event.type === 'result' || event.type === 'error') {
            await onSettled();
            if (failed || event.type === 'error' || event.success !== true) throw new Error('Helper reply failed.');
            const text = event.text || output;
            if (text.length > 2000) throw new Error('Helper reply too long.');
            return text;
          }
        }
        if (ownTurn && poll.state === 'awaiting') throw new Error('Helper requires attention.');
        await wait(650);
      }
      throw new Error('Helper timed out.');
    },
    async interruptSession(id: string) {
      const result = await request('/api/interrupt', { method: 'POST', body: JSON.stringify({ sessionId: id, provider: 'codex' }) });
      if (!result.ok) throw new Error('Could not send stop request.');
    },
    watch(id: string, onEvents: (events: TerminalEvent[], state: unknown) => void, { replay = false } = {}) {
      let stopped = false;
      const loop = async () => {
        while (!stopped) {
          try {
            const data = await request('/api/messages?sessionId=' + encodeURIComponent(id) + '&provider=codex&after=' + (watchCursor ?? 0));
            if (stopped) break;
            if (data.error) throw new Error('Could not load session status.');
            const events = eventsOf(data.messages).filter(event => event.id === undefined || !Number.isFinite(event.id) || event.id > (watchCursor ?? 0));
            const initial = watchCursor === null;
            watchCursor ??= 0;
            for (const event of events) if (typeof event.id === 'number' && Number.isFinite(event.id)) watchCursor = Math.max(watchCursor, event.id);
            if (initial && !replay) {
              const lastEnd = events.findLastIndex(event => ['result', 'error'].includes(event.type) || (event.type === 'status' && event.state === 'idle'));
              const live = data.state === 'busy' || data.state === 'awaiting';
              onEvents(live ? events.slice(lastEnd + 1) : [], data.state);
            } else onEvents(events, data.state);
          } catch { /* Keep the current transcript during a temporary disconnect. */ }
          if (!stopped) await wait(250);
        }
      };
      void loop();
      return () => { stopped = true; };
    },
    async send(url: string, secret: string, text: string, replyContextIsCurrent?: () => boolean) {
      if (active) return false;
      const parsed = parseAddress(url);
      secret = secret.trim();
      if (!secret || !text.trim()) throw new Error('Enter a token and a message.');
      if (base && (base !== parsed.origin || token !== secret)) throw new Error('The session connection has changed.');
      base = parsed.origin; token = secret; active = true;
      let submitting = false;
      onStatus('Connecting to Codex…');
      try {
        const preflightCursor = watchCursor ?? 0;
        if (sessionId) {
          const existing = await request('/api/messages?sessionId=' + encodeURIComponent(sessionId) + '&provider=codex&after=' + preflightCursor);
          if (existing.error || existing.state !== 'idle') {
            onStatus(existing.state === 'busy' || existing.state === 'awaiting' ? 'Session busy · Draft kept' : 'Check session status · Draft kept');
            return false;
          }
          if (replyContextIsCurrent && (!replyContextIsCurrent() || eventsOf(existing.messages).some(event =>
            event.type === 'user_prompt' && (event.id === undefined || event.id > preflightCursor)))) {
            onStatus('Reply context changed · Open replies again');
            return false;
          }
          // Capture a baseline if the first observation is still in flight.
          if (watchCursor === null) {
            watchCursor = 0;
            for (const event of eventsOf(existing.messages)) if (typeof event.id === 'number' && Number.isFinite(event.id)) watchCursor = Math.max(watchCursor, event.id);
          }
        }
        submitting = true;
        const result = await request('/api/prompt', { method: 'POST', body: JSON.stringify({ text, provider: 'codex', ...(sessionId ? { sessionId } : {}) }) });
        if (result.error || typeof result.sessionId !== 'string' || !result.sessionId || (sessionId && sessionId !== result.sessionId)) throw new Error('Did not receive a valid session ID.');
        if (!sessionId) {
          sessionId = result.sessionId;
          onSession(sessionId);
        }
        onStatus(result.queued === true ? 'Queued' : 'Request received');
        return true;
      } catch (error) {
        onStatus(error instanceof TerminalServerError && error.writerLocked ? 'Session in use · Draft kept' : error instanceof TerminalServerError && error.payloadTooLarge ? 'Data too large · Draft kept' : submitting && (!(error instanceof TerminalServerError) || error.status >= 500)
          ? 'Receipt unconfirmed · Draft kept'
          : error instanceof Error ? error.message : 'Connection failed');
        return false;
      } finally { active = false; }
    },
  };
}
