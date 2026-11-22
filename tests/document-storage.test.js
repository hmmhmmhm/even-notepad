import assert from 'node:assert/strict';
import test from 'node:test';
import { documentStorage } from '../src/document-storage.ts';
import { migrateLibrary, updateLibrary } from '../src/document-library.ts';

const key = 'even-notepad.documents.v2';
const legacyKey = 'even-notepad.documents.v1';
const legacy = '{"active":"기존.md","expanded":["Notes"],"files":[{"name":"기존.md","folder":"Notes","text":"원래 글"}]}';

function mockBrowser(entries) {
  const values = new Map(entries);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function mockEven(entries) {
  const values = new Map(entries);
  return {
    getLocalStorage: async key => values.get(key) ?? '',
    setLocalStorage: async (key, value) => { values.set(key, value); return true; },
  };
}

function mount(storage, locks) {
  const notices = [];
  return { ...documentStorage({ storage, locks, notify: message => notices.push(message) }), notices };
}

const edit = (library, text) => updateLibrary(library, { type: 'save', id: library.active, text });

test('web storage migration preserves the raw legacy snapshot and refuses another tab’s changes', () => {
  const browser = mockBrowser([[legacyKey, legacy]]);
  const first = mount(browser);
  const second = mount(browser);
  const library = first.loadBrowser('');
  const stale = second.loadBrowser('');
  assert.equal(first.save(edit(library, '새 글')), true);
  assert.equal(second.save(edit(stale, '오래된 창')), false);
  assert.equal(browser.getItem(legacyKey), legacy);
  assert.equal(mount(browser).loadBrowser('').files[0].text, '새 글');
});

test('native storage restores the full library on a fresh WebView origin', async () => {
  const firstBrowser = mockBrowser([[legacyKey, legacy]]);
  const native = mockEven();
  const first = mount(firstBrowser);
  const initial = first.loadCache('');
  const started = await first.loadEven(native, () => initial, () => false);
  const edited = edit(started, '앱 재시작 뒤 남은 내용');
  assert.equal(first.save(edited), true);
  await first.flush();
  assert.equal(firstBrowser.getItem(legacyKey), legacy);

  const freshBrowser = mockBrowser();
  const fresh = mount(freshBrowser);
  fresh.loadCache('');
  const recovered = await fresh.loadEven(native, () => assert.fail(), () => false);
  assert.deepEqual(recovered, edited);
  assert.equal(JSON.parse(freshBrowser.getItem(key)).data, await native.getLocalStorage(key));
});

test('restart replays a pending native journal only when its base still matches', async () => {
  const base = migrateLibrary(legacy);
  const changed = edit(base, '아직 브리지에 미전송');
  const baseData = JSON.stringify(base);
  const data = JSON.stringify(changed);
  const browser = mockBrowser([[key, JSON.stringify({ source: 'even', base: baseData, data })]]);
  const native = mockEven([[key, baseData]]);
  const fresh = mount(browser);
  assert.deepEqual(fresh.loadCache(''), changed);
  assert.deepEqual(await fresh.loadEven(native, () => assert.fail(), () => false), changed);
  await fresh.flush();
  assert.equal(await native.getLocalStorage(key), data);

  const incompatible = JSON.stringify(edit(base, '다른 앱 인스턴스의 최신 결과'));
  await native.setLocalStorage(key, incompatible);
  const staleBrowser = mockBrowser([[key, JSON.stringify({ source: 'even', base: baseData, data })]]);
  const stale = mount(staleBrowser);
  stale.loadCache('');
  assert.deepEqual(await stale.loadEven(native, () => assert.fail(), () => false), JSON.parse(incompatible));
  assert.deepEqual(stale.recoveryCopy(), changed);
  assert.equal(stale.writable(), false);
  assert.equal(await native.getLocalStorage(key), incompatible);
  assert.equal(JSON.parse(staleBrowser.getItem(key)).data, data);
});

test('a newer local edit survives while the first native write is in flight', async () => {
  const initial = migrateLibrary(legacy);
  let finishWrite;
  let startedWrite;
  const started = new Promise(resolve => { startedWrite = resolve; });
  const pending = new Promise(resolve => { finishWrite = resolve; });
  const native = mockEven([[key, JSON.stringify(initial)]]);
  const nativeWrite = native.setLocalStorage;
  native.setLocalStorage = async (key, value) => {
    startedWrite();
    await pending;
    return nativeWrite(key, value);
  };
  const browser = mockBrowser();
  const library = mount(browser);
  library.loadCache('');
  await library.loadEven(native, () => assert.fail(), () => false);
  assert.equal(library.save(edit(initial, '첫 글')), true);
  await started;
  assert.equal(library.save(edit(initial, '최신 글')), true);
  finishWrite();
  await library.flush();
  assert.equal(JSON.parse(await native.getLocalStorage(key)).files[0].text, '최신 글');
  const journal = JSON.parse(browser.getItem(key));
  assert.equal(journal.base, journal.data);
});

test('unknown native storage cannot be initialized from an older browser library', async () => {
  const browser = mockBrowser([[legacyKey, legacy]]);
  const library = mount(browser);
  const fallback = library.loadCache('');
  const native = {
    getLocalStorage: async () => { throw Error('offline'); },
    setLocalStorage: async () => assert.fail('must not overwrite native storage'),
  };
  assert.equal(await library.loadEven(native, () => fallback, () => false), null);
  assert.equal(library.save(edit(fallback, 'draft')), false);
  assert.equal(browser.getItem(legacyKey), legacy);
  assert.equal(browser.getItem(key), null);
});

test('restart can recognize a completed in-flight write and replay a newer draft', async () => {
  const base = migrateLibrary(legacy);
  const attempted = JSON.stringify(edit(base, '저장 결과를 받기 전에 종료'));
  const latest = edit(base, '그 다음 입력까지 보존');
  const browser = mockBrowser([[key, JSON.stringify({
    source: 'even', base: JSON.stringify(base), inFlight: attempted, data: JSON.stringify(latest),
  })]]);
  const native = mockEven([[key, attempted]]);
  const recovery = mount(browser);
  recovery.loadCache('');
  assert.deepEqual(await recovery.loadEven(native, () => assert.fail(), () => false), latest);
  await recovery.flush();
  assert.equal(await native.getLocalStorage(key), JSON.stringify(latest));
});

test('a confirmed empty native store recovers a settled WebView mirror after restart', async () => {
  const saved = edit(migrateLibrary(legacy), '브라우저 미러에 있던 글');
  const data = JSON.stringify(saved);
  const browser = mockBrowser([[key, JSON.stringify({ source: 'even', base: data, data })]]);
  const native = mockEven();
  const fresh = mount(browser);
  assert.deepEqual(fresh.loadCache(''), saved);
  assert.deepEqual(await fresh.loadEven(native, () => assert.fail(), () => false), saved);
  await fresh.flush();
  assert.equal(await native.getLocalStorage(key), data);
});

test('native storage populated after a blank read cannot be overwritten by recovery', async () => {
  const saved = edit(migrateLibrary(legacy), '브라우저 미러에 있던 글');
  const data = JSON.stringify(saved);
  const browser = mockBrowser([[key, JSON.stringify({ source: 'even', base: data, data })]]);
  const newerNative = JSON.stringify(edit(saved, '다른 세션이 새로 저장한 글'));
  const native = mockEven();
  const read = native.getLocalStorage;
  native.getLocalStorage = async name => {
    if (name === legacyKey) await native.setLocalStorage(key, newerNative);
    return read(name);
  };
  const fresh = mount(browser);
  fresh.loadCache('');
  assert.deepEqual(await fresh.loadEven(native, () => assert.fail(), () => false), saved);
  await fresh.flush();
  assert.equal(fresh.writable(), false);
  assert.equal(await native.getLocalStorage(key), newerNative);
  assert.equal(JSON.parse(browser.getItem(key)).data, data);
});

test('first launch creates an empty active document after the host confirms absence', async () => {
  const browser = mockBrowser();
  const native = mockEven();
  const first = mount(browser);
  const initial = first.loadCache('');
  assert.equal(browser.getItem(key), null);
  const created = await first.loadEven(native, () => initial, () => false);
  await first.flush();
  assert.equal(created.files.find(file => file.id === created.active).text, '');
  assert.equal(await native.getLocalStorage(key), JSON.stringify(created));
});

test('a cached Even library stays read-only until a late host can confirm its state', async () => {
  const saved = migrateLibrary(legacy);
  const data = JSON.stringify(saved);
  const browser = mockBrowser([[key, JSON.stringify({ source: 'even', base: data, data })]]);
  const library = mount(browser);
  assert.deepEqual(library.loadBrowser(''), saved);
  assert.equal(library.writable(), false);
  assert.equal(library.save(edit(saved, 'must not overwrite')), false);
  const native = mockEven([[key, data]]);
  assert.deepEqual(await library.loadEven(native, () => assert.fail(), () => false), saved);
  assert.equal(library.writable(), true);
});

test('a corrupt WebView journal leaves readable SDK documents available without replacing either store', async () => {
  const original = migrateLibrary(legacy);
  const data = JSON.stringify(original);
  const corrupt = '{"source":"even","data":"unreadable"}';
  const browser = mockBrowser([[key, corrupt]]);
  const native = mockEven([[key, data]]);
  native.setLocalStorage = async () => assert.fail('read-only recovery must not write to the SDK');
  const fresh = mount(browser);
  fresh.loadCache('');

  assert.deepEqual(await fresh.loadEven(native, () => assert.fail(), () => false), original);
  assert.equal(fresh.writable(), false);
  assert.equal(fresh.save(edit(original, 'would replace both stores')), false);
  assert.equal(browser.getItem(key), corrupt);
  assert.equal(await native.getLocalStorage(key), data);
  assert.match(fresh.notices.at(-1), /available to view and copy/);
});

test('independent WebViews that both completed a racing SDK write keep both copies on restart', { timeout: 2000 }, async () => {
  const original = migrateLibrary(legacy);
  const base = JSON.stringify(original);
  const leftBrowser = mockBrowser();
  const rightBrowser = mockBrowser();
  const native = mockEven([[key, base]]);
  const left = mount(leftBrowser, null);
  const right = mount(rightBrowser, null);
  for (const client of [left, right]) {
    client.loadCache('');
    await client.loadEven(native, () => assert.fail(), () => false);
  }

  const get = native.getLocalStorage;
  const set = native.setLocalStorage;
  let readers = 0;
  let releaseReaders;
  const readyToWrite = new Promise(resolve => { releaseReaders = resolve; });
  const leftCopy = edit(original, '왼쪽에서 저장한 내용');
  const rightCopy = edit(original, '오른쪽에서 저장한 내용');
  let releaseRight;
  const leftWritten = new Promise(resolve => { releaseRight = resolve; });
  native.getLocalStorage = async name => {
    const observed = await get(name);
    if (++readers === 2) releaseReaders();
    await readyToWrite;
    return observed;
  };
  native.setLocalStorage = async (name, value) => {
    if (value === JSON.stringify(rightCopy)) await leftWritten;
    await set(name, value);
    if (value === JSON.stringify(leftCopy)) releaseRight();
    return true;
  };

  assert.equal(left.save(leftCopy), true);
  assert.equal(right.save(rightCopy), true);
  await Promise.all([left.flush(), right.flush()]);
  native.getLocalStorage = get;
  native.setLocalStorage = async () => assert.fail('conflicting read-only copies must not be overwritten');

  const leftSettled = leftBrowser.getItem(key);
  const rightSettled = rightBrowser.getItem(key);
  assert.equal(JSON.parse(leftSettled).base, JSON.stringify(leftCopy));
  assert.equal(JSON.parse(rightSettled).base, JSON.stringify(rightCopy));
  assert.equal(await native.getLocalStorage(key), JSON.stringify(rightCopy));

  for (let restart = 0; restart < 2; restart++) {
    const reopened = mount(leftBrowser, null);
    assert.deepEqual(reopened.loadCache(''), leftCopy);
    assert.deepEqual(await reopened.loadEven(native, () => assert.fail(), () => false), rightCopy);
    assert.deepEqual(reopened.recoveryCopy(), leftCopy);
    assert.equal(reopened.writable(), false);
    assert.equal(reopened.save(edit(leftCopy, 'must not persist')), false);
    assert.equal(leftBrowser.getItem(key), leftSettled);
    assert.equal(await native.getLocalStorage(key), JSON.stringify(rightCopy));
  }
});


test('a journal with unusual metadata still exposes its valid document copy', () => {
  const original = edit(migrateLibrary(legacy), 'preserved draft');
  const data = JSON.stringify(original);
  const browser = mockBrowser([[key, JSON.stringify({ source: 'even', base: data, inFlight: null, data })]]);
  const recovered = mount(browser).loadCache('');
  assert.deepEqual(recovered, original);
});
