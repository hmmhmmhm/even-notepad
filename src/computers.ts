type Computer = { name: string; url: string; token: string };
type Storage = { read(): Promise<unknown>; write(value: string): Promise<unknown> };
function isComputer(value: unknown): value is Computer {
  return typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string'
    && 'url' in value && typeof value.url === 'string' && 'token' in value && typeof value.token === 'string';
}
export function createComputers(storage: Storage) {
  let entries: Computer[] = [];
  let loaded = false;
  let queue: Promise<void> = Promise.resolve();
  function serial(action: () => Promise<void>) { const next = queue.then(action); queue = next.catch(() => {}); return next; }
  return {
    load() { return serial(async () => {
      const raw = await storage.read();
      if (typeof raw !== 'string') throw Error('Could not read app storage.');
      const value: unknown = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(value) || value.some(x => !isComputer(x))) throw Error('Could not read saved computers.');
      entries = value.filter(isComputer); loaded = true;
    }); },
    list() { return entries.map(x => ({ ...x })); },
    save({ name, url, token }: Computer) { return serial(async () => {
      if (!loaded) throw Error('Loading saved computers.');
      let parsed;
      try { parsed = new URL(url.trim()); } catch { throw Error('Enter a valid server address.'); }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') throw Error('Enter a valid server address.');
      name = name.trim(); token = token.trim(); url = parsed.origin;
      if (!name || !token) throw Error('Enter a computer name and connection token.');
      const index = entries.findIndex(x => x.url === url);
      const next = entries.slice();
      if (index < 0) next.push({ name, url, token }); else next[index] = { name, url, token };
      await storage.write(JSON.stringify(next)); entries = next;
    }); },
    remove(url: string) { return serial(async () => {
      if (!loaded) throw Error('Loading saved computers.');
      const next = entries.filter(x => x.url !== url);
      await storage.write(JSON.stringify(next)); entries = next;
    }); },
  };
}
