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
  constructor(status: number, detail: string) {
    super('Server error (' + status + ')'); this.status = status;
    this.writerLocked = /already has an active writer/i.test(detail);
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
    try { response = await fetcher(base + path, { ...options, signal: options.signal || AbortSignal.timeout(10000), headers: { Authorization: 'Bearer ' + token, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } }); }
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
    async send(url: string, secret: string, text: string) {
      if (active) return false;
      const parsed = parseAddress(url);
      secret = secret.trim();
      if (!secret || !text.trim()) throw new Error('Enter a token and a message.');
      if (base && (base !== parsed.origin || token !== secret)) throw new Error('The session connection has changed.');
      base = parsed.origin; token = secret; active = true;
      let submitting = false;
      onStatus('Connecting to Codex…');
      try {
        if (sessionId) {
          const existing = await request('/api/messages?sessionId=' + encodeURIComponent(sessionId) + '&provider=codex&after=' + (watchCursor ?? 0));
          if (existing.error || existing.state !== 'idle') {
            onStatus(existing.state === 'busy' || existing.state === 'awaiting' ? 'Session busy · Draft kept' : 'Check session status · Draft kept');
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
        onStatus(error instanceof TerminalServerError && error.writerLocked ? 'Session in use · Draft kept' : submitting && (!(error instanceof TerminalServerError) || error.status >= 500)
          ? 'Receipt unconfirmed · Draft kept'
          : error instanceof Error ? error.message : 'Connection failed');
        return false;
      } finally { active = false; }
    },
  };
}
