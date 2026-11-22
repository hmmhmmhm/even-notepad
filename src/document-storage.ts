export type HostStorage = { getLocalStorage(key: string): Promise<unknown>; setLocalStorage(key: string, value: string): Promise<unknown> };
type Journal = { source: 'browser'; data: string } | { source: 'even'; data: string; base?: unknown; inFlight?: unknown };
type StorageOptions = { storage: Pick<Storage, 'getItem' | 'setItem'>; fixture?: boolean; notify: (message: string) => void; locks?: Pick<LockManager, 'request'> };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
function isJournal(value: unknown): value is Journal {
  return isRecord(value) && typeof value.data === 'string' && (value.source === 'browser' || value.source === 'even');
}
import { migrateLibrary, readLibrary, type Library } from './document-library.ts';

const conflict = 'Documents changed in another window. Copy your draft before reopening.';
const unavailable = 'Documents could not be saved. Copy your draft before closing.';
const recovering = 'Could not load Even App documents. Reopen the app to retry.';
const damagedCache = 'The device copy could not be read. Even App documents are available to view and copy.';
const divergentCopies = 'Even App and this device have different copies. View and copy either version below.';

export function documentStorage({ storage, fixture, notify, locks = globalThis.navigator?.locks }: StorageOptions) {
  const key = fixture ? 'even-notepad.fixture.v2' : 'even-notepad.documents.v2';
  const legacyKey = key.replace(/v2$/, 'v1');
  let local: string | null | undefined;
  let bridge: HostStorage | undefined;
  let remote: string | null | undefined;
  let target: string | undefined;
  let inFlight: string | undefined;
  let writing: Promise<void> | undefined;
  let locked = false;
  let requiresHost = false;
  let recoveryCopy: Library | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = 1000;

  function block(message: string) {
    locked = true;
    notify(message);
  }

  function cache(record: Journal) {
    if (storage.getItem(key) !== local) throw Error(conflict);
    const serialized = JSON.stringify(record);
    storage.setItem(key, serialized);
    local = serialized;
  }

  function journal() {
    if (target === undefined) throw Error(recovering);
    cache({ source: 'even', base: remote, data: target, inFlight });
  }

  async function getRemote() {
    if (!bridge) throw Error(recovering);
    const raw = await bridge.getLocalStorage(key);
    if (typeof raw !== 'string') throw Error(recovering);
    return raw === '' ? null : raw;
  }

  function readCache() {
    if (typeof local !== 'string') throw Error(recovering);
    const record: unknown = JSON.parse(local);
    if (!isJournal(record)) throw Error(recovering);
    return record;
  }

  function loadBrowser(initialText: string) {
    try {
      local = storage.getItem(key);
      const record = local === null ? null : readCache();
      if (record) {
        if (record.source === 'even') {
          requiresHost = true;
          notify(recovering);
        }
        return readLibrary(record.data);
      }
      return migrateLibrary(storage.getItem(legacyKey), initialText);
    } catch {
      block(recovering);
      return migrateLibrary(null, initialText);
    }
  }

  function flush() {
    if (locked || !bridge || !target || target === remote || writing) return writing;
    clearTimeout(retry);
    const sync = async () => {
      while (!locked && target !== remote) {
        const current = await getRemote();
        const next = target;
        if (!next || !bridge) return;
        if (current !== remote && current !== next && current !== inFlight) {
          block(conflict);
          return;
        }
        remote = current;
        if (current !== next) {
          inFlight = next;
          journal();
          if (!await bridge.setLocalStorage(key, next)) throw Error(unavailable);
        }
        remote = next;
        inFlight = undefined;
        // Advance the journal base without losing changes queued while the bridge was writing.
        journal();
      }
      if (!locked) {
        retryDelay = 1000;
        notify('');
      }
    };
    writing = (locks ? locks.request(key, sync) : sync()).catch(error => {
      if (error instanceof Error && error.message === conflict) block(conflict);
      else {
        notify(unavailable);
        retry = setTimeout(flush, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      }
    }).finally(() => {
      writing = undefined;
    });
    return writing;
  }

  function save(library: Library) {
    if (locked || (requiresHost && !bridge)) return false;
    const data = JSON.stringify(library);
    const previous = target;
    try {
      if (bridge) {
        target = data;
        journal();
      } else {
        cache({ source: 'browser', data });
      }
    } catch (error) {
      target = previous;
      if (error instanceof Error && error.message === conflict) block(conflict);
      else notify(unavailable);
      return false;
    }
    if (bridge) {
      void flush();
    } else notify('');
    return true;
  }

  async function loadEven(nextBridge: HostStorage, fallback: () => Library, browserChanged: () => boolean) {
    bridge = nextBridge;
    try {
      remote = await getRemote();
      const remoteLibrary = remote === null ? null : readLibrary(remote);
      if (locked) {
        const nativeLegacy = remoteLibrary ? '' : await bridge.getLocalStorage(legacyKey);
        const readable = remoteLibrary ?? (typeof nativeLegacy === 'string' && nativeLegacy ? migrateLibrary(nativeLegacy) : null);
        if (readable) notify(damagedCache);
        return readable;
      }

      const record = local === null ? null : readCache();
      if (storage.getItem(key) !== local) throw Error(conflict);
      if (remoteLibrary) {
        const pending = record?.source === 'even' && record.data !== record.base;
        const pendingMatches = pending && [record.base, record.data, record.inFlight].includes(remote);
        const draftChanged = browserChanged();
        if (draftChanged || (record && record.data !== remote && !pendingMatches)) {
          recoveryCopy = draftChanged || !record ? fallback() : readLibrary(record.data);
          block(divergentCopies);
          return remoteLibrary;
        }
        if (pending) {
          const recovered = readLibrary(record.data);
          if (!save(recovered)) throw Error(unavailable);
          return recovered;
        }
        if (typeof remote !== 'string') throw Error(recovering);
        cache({ source: 'even', base: remote, data: remote });
        notify('');
        return remoteLibrary;
      }

      // An unfinished first write already verified the native store was empty.
      if (record?.source === 'even' && record.base === null) {
        const recovered = readLibrary(record.data);
        if (!save(recovered)) throw Error(unavailable);
        return recovered;
      }
      const nativeLegacy = await bridge.getLocalStorage(legacyKey);
      if (typeof nativeLegacy !== 'string') throw Error(recovering);
      const browserLegacy = storage.getItem(legacyKey);
      if (nativeLegacy && (record || (browserLegacy !== null && browserLegacy !== nativeLegacy))) {
        recoveryCopy = fallback();
        block(divergentCopies);
        return migrateLibrary(nativeLegacy);
      }
      const recovered = record?.source === 'even' ? readLibrary(record.data)
        : nativeLegacy ? migrateLibrary(nativeLegacy) : fallback();
      if (!save(recovered)) throw Error(unavailable);
      return recovered;
    } catch (error) {
      block(error instanceof Error && error.message === conflict ? conflict : recovering);
      return null;
    }
  }

  // During native startup, read the journal without treating it as browser-owned storage.
  function loadCache(initialText: string) {
    try {
      local = storage.getItem(key);
      return local === null ? migrateLibrary(storage.getItem(legacyKey), initialText)
        : readLibrary(readCache().data);
    } catch {
      block(recovering);
      return migrateLibrary(null, initialText);
    }
  }

  return {
    loadBrowser, loadCache, loadEven, save, flush,
    recoveryCopy: () => recoveryCopy,
    writable: () => !locked && (!requiresHost || Boolean(bridge)),
  };
}
