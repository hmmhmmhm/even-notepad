import type { Session } from './codex-client.ts';

type Scope = 'app' | 'all';
type Entry = [origin: string, id: string, title: string];
type Storage = { read(): Promise<unknown>; write(value: string): Promise<void> };

function isEntry(value: unknown): value is Entry {
  if (!Array.isArray(value) || value.length !== 3 || typeof value[0] !== 'string'
    || typeof value[1] !== 'string' || !value[1].trim() || typeof value[2] !== 'string') return false;
  try {
    const address = new URL(value[0]);
    return ['http:', 'https:'].includes(address.protocol) && address.origin === value[0];
  } catch { return false; }
}

function parse(raw: unknown): { scope: Scope; sessions: Entry[] } {
  if (raw === '') return { scope: 'app', sessions: [] };
  const value: unknown = typeof raw === 'string' ? JSON.parse(raw) : null;
  if (typeof value !== 'object' || value === null || !('scope' in value) || !('sessions' in value)
    || (value.scope !== 'app' && value.scope !== 'all') || !Array.isArray(value.sessions)
    || !value.sessions.every(isEntry)) throw Error('Could not read saved sessions.');
  return { scope: value.scope, sessions: value.sessions };
}

function key(origin: string, id: string) { return JSON.stringify([origin, id]); }

export function createTerminalSessionList(storage: Storage) {
  let scope: Scope = 'app';
  let entries = new Map<string, Entry>();
  let loaded = false, revision = 0, savedRevision = 0;
  let queue = Promise.resolve();
  function serial(action: () => Promise<void>) {
    const next = queue.then(action);
    queue = next.catch(() => {});
    return next;
  }
  async function load() {
    if (loaded) return;
    const saved = parse(await storage.read());
    scope = saved.scope;
    entries = new Map([...saved.sessions.map(entry => [key(entry[0], entry[1]), entry] satisfies [string, Entry]), ...entries]);
    loaded = true;
  }
  async function save(nextScope: Scope) {
    if (nextScope === scope && revision === savedRevision) return;
    const submittedRevision = revision;
    await storage.write(JSON.stringify({ scope: nextScope, sessions: [...entries.values()] }));
    savedRevision = submittedRevision;
    scope = nextScope;
  }
  function remember(origin: string, id: string, title: string) {
    const entryKey = key(origin, id);
    if (!id.trim() || entries.get(entryKey)?.[2] === title) return;
    entries.set(entryKey, [origin, id, title]);
    ++revision;
  }
  return {
    get scope() { return scope; },
    get unsaved() { return revision !== savedRevision; },
    sync() { return serial(async () => { await load(); await save(scope); }); },
    setScope(nextScope: Scope) { return serial(async () => { await load(); await save(nextScope); }); },
    owned(origin: string): Session[] {
      return [...entries.values()].reverse().filter(entry => entry[0] === origin)
        .map(([, id, title]) => ({ id, title }));
    },
    remember,
    updateTitles(origin: string, sessions: Session[]) {
      for (const { id, title } of sessions) {
        const name = title?.trim();
        if (name && name !== 'Codex session' && entries.has(key(origin, id))) remember(origin, id, name);
      }
    },
  };
}
