import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerminalSessionList } from '../src/terminal-session-list.ts';
import { createTerminalController } from '../src/terminal-controller.ts';

test('only records confirmed new sessions and reopens them by ID beyond the latest server list', async () => {
  const origin = 'http://computer';
  let saved = '';
  const storage = { async read() { return saved; }, async write(value) { saved = value; } };
  const views = [], histories = [];
  let recent = [{ id: 'external', title: 'Existing conversation' }];
  const makeClient = ({ onSession }) => ({
    async connect() { return recent; },
    select(id) { this.id = id; },
    async history(id) { histories.push(id); return [{ role: 'user', text: id }]; },
    async send(_, __, text) {
      if (text === 'fail') return false;
      if (!this.id) onSession(this.id = 'confirmed');
      return true;
    },
    watch() { return () => {}; },
  });
  const prepare = (sessionList) => createTerminalController({ render: view => views.push(view), exit() {}, makeClient, sessionList });
  const list = createTerminalSessionList(storage);
  const terminal = prepare(list);
  await terminal.connect(origin, 'token');
  assert.doesNotMatch(views.at(-1).text, /Existing/);
  await list.setScope('all');
  terminal.menu();
  terminal.move(1); await terminal.choose();
  terminal.setDraft('Continue existing'); await terminal.send();
  terminal.back(); await terminal.choose();
  terminal.setDraft('fail'); await terminal.send();
  assert.deepEqual(list.owned(origin), []);
  terminal.setDraft('An original prompt'); await terminal.send();
  await list.setScope('app');
  terminal.leave();

  recent = [{ id: 'another', title: 'Latest on server' }];
  const reopened = prepare(createTerminalSessionList(storage));
  await reopened.connect(origin + '/', 'token');
  assert.match(views.at(-1).text, /An original prompt/);
  assert.doesNotMatch(views.at(-1).text, /Latest on server/);
  reopened.move(1); await reopened.choose();
  assert.deepEqual(histories, ['external', 'confirmed']);
  await reopened.connect('http://other', 'token');
  assert.doesNotMatch(views.at(-1).text, /An original prompt/);
  reopened.leave();
});

test('retries pending confirmed IDs after failed reads and writes without dropping stored IDs', async () => {
  const origin = 'http://computer';
  let saved = JSON.stringify({ scope: 'app', sessions: [[origin, 'old', 'Old title']] });
  let readFails = true, writeFails = true;
  const storage = {
    async read() { if (readFails) throw Error('Unreachable'); return saved; },
    async write(value) { if (writeFails) throw Error('Unreachable'); saved = value; },
  };
  const list = createTerminalSessionList(storage);
  list.remember(origin, 'fresh', 'Fresh title');
  await assert.rejects(list.sync());
  assert.deepEqual(list.owned(origin).map(session => session.id), ['fresh']);
  readFails = false;
  await assert.rejects(list.setScope('all'));
  assert.equal(list.scope, 'app');
  assert.deepEqual(list.owned(origin).map(session => session.id), ['fresh', 'old']);
  writeFails = false;
  await list.setScope('all');
  const reopened = createTerminalSessionList(storage);
  await reopened.sync();
  assert.equal(reopened.scope, 'all');
  assert.deepEqual(reopened.owned(origin).map(session => session.id), ['fresh', 'old']);
});

test('includes older app sessions and existing server sessions across bounded menu pages', async () => {
  const origin = 'http://computer';
  let saved = JSON.stringify({
    scope: 'all',
    sessions: Array.from({ length: 34 }, (_, index) => [origin, 's-' + index, 'Local ' + index]),
  });
  const sessionList = createTerminalSessionList({ async read() { return saved; }, async write(value) { saved = value; } });
  const views = [], loaded = [];
  const terminal = createTerminalController({
    sessionList,
    exit() {},
    render: view => views.push(view),
    makeClient: () => ({
      async connect() { return [{ id: 'external', title: 'External' }, { id: 's-33', title: 'From server' }]; },
      select() {},
      async history(id) { loaded.push(id); return []; },
      watch() { return () => {}; },
    }),
  });
  await terminal.connect(origin, 'token');
  const displayed = [];
  for (let page = 0; page < 3; page++) {
    const { items } = views.at(-1);
    assert.ok(items.length <= 20);
    displayed.push(...items.filter(title => title.startsWith('  ')).map(title => title.trim()));
    const more = items.indexOf('More sessions');
    if (more !== -1) { terminal.selectMenu(more); await terminal.choose(); }
  }
  assert.equal(displayed.length, 35);
  assert.equal(new Set(displayed).size, 35);
  assert.ok(displayed.includes('External'));
  assert.ok(displayed.includes('From server'));
  const position = views.at(-1).items.findIndex(title => title.trim() === 'Local 0');
  assert.ok(terminal.selectMenu(position));
  await terminal.choose();
  assert.deepEqual(loaded, ['s-0']);
  const reopened = createTerminalSessionList({ async read() { return saved; }, async write() {} });
  await reopened.sync();
  assert.equal(reopened.owned(origin).find(session => session.id === 's-33').title, 'From server');
  terminal.leave();
});

test('assigns a late first-prompt receipt to its original server after switching computers', async () => {
  let saved = '', confirm;
  const sessionList = createTerminalSessionList({
    async read() { return saved; },
    async write(value) { saved = value; },
  });
  const views = [];
  const terminal = createTerminalController({
    sessionList,
    exit() {},
    render: view => views.push(view),
    makeClient: ({ onSession }) => ({
      async connect() { return []; },
      send() { return new Promise(resolve => { confirm = () => { onSession('late'); resolve(true); }; }); },
    }),
  });
  await terminal.connect('http://first', 'token');
  await terminal.choose();
  terminal.setDraft('First computer prompt');
  const pending = terminal.send();
  await terminal.connect('http://second', 'token');
  confirm();
  await pending;
  await sessionList.sync();
  assert.deepEqual(sessionList.owned('http://first'), [{ id: 'late', title: 'First computer prompt' }]);
  assert.deepEqual(sessionList.owned('http://second'), []);
  assert.doesNotMatch(views.at(-1).text, /First computer prompt/);
  terminal.leave();
});
