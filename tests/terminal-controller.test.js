import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTerminalController } from '../src/terminal-controller.ts';

test('leaving during a submission ignores late rendering and retains an unsent draft', async () => {
  let finish, hooks, exits = 0;
  const views = [];
  const makeClient = callbacks => {
    hooks = callbacks;
    return { active: false, async connect() { return []; }, async send() { this.active = true; await new Promise(resolve => { finish = resolve; }); this.active = false; return false; } };
  };
  const terminal = createTerminalController({ render: view => views.push(view), exit: () => exits++, makeClient });
  await terminal.connect('http://localhost', 'token');
  await terminal.choose(); terminal.setDraft('keep me');
  const sending = terminal.send();
  terminal.leave();
  const count = views.length;
  hooks.onStatus('late'); finish(); await sending;
  assert.equal(exits, 1);
  assert.equal(views.length, count);
  await terminal.connect('http://localhost', 'token'); await terminal.choose();
  assert.equal(views.at(-1).draft, 'keep me');
});

test('a connection finishing after leaving does not reopen the terminal', async () => {
  let finish;
  const views = [];
  const terminal = createTerminalController({ render: view => views.push(view), exit() {}, makeClient: () => ({ connect: () => new Promise(resolve => { finish = resolve; }) }) });
  const connecting = terminal.connect('http://localhost', 'token');
  terminal.leave(); finish([]); await connecting;
  assert.equal(terminal.isOpen(), false);
  assert.equal(views.length, 0);
});

test('lists sessions, opens history, and changes sessions without stopping an active reply', async () => {
  const views = [], clients = [];
  let finish;
  const makeClient = hooks => {
    const client = { active: false, async connect() { return [{ id: 'a', title: 'First' }, { id: 'b', title: 'Second' }]; }, select(id) { this.id = id; }, async history(id) { return [{ role: 'assistant', text: 'History ' + id }]; }, watch(id, consume) { this.consume = consume; return () => {}; }, async send(url, token, text) { this.active = true; await new Promise(resolve => { finish = resolve; }); this.consume([{ type: 'result', text: 'Finished ' + text }], 'idle'); this.active = false; return true; } };
    clients.push(client); return client;
  };
  const controller = createTerminalController({ render: view => views.push(view), exit: () => {}, makeClient });
  await controller.connect('http://example', 'token');
  assert.match(views.at(-1).text, /First/);
  controller.move(1); await controller.choose();
  assert.match(views.at(-1).text, /History a/);
  controller.setDraft('hello'); const pending = controller.send();
  controller.menu(); controller.move(2); await controller.choose();
  assert.match(views.at(-1).text, /History b/);
  finish(); await pending;
  assert.doesNotMatch(views.at(-1).text, /Finished hello/);
  controller.menu(); controller.move(1); await controller.choose();
  assert.match(views.at(-1).text, /Finished hello/);
});

test('restores an unsent draft when the server rejects the request', async () => {
  const views = [];
  const makeClient = () => ({ active: false, async connect() { return []; }, async send() { return false; } });
  const controller = createTerminalController({ render: view => views.push(view), exit: () => {}, makeClient });
  await controller.connect('http://example', 'token'); await controller.choose();
  controller.setDraft('important draft'); await controller.send();
  assert.equal(views.at(-1).draft, 'important draft');
  controller.menu(); await controller.choose();
  assert.equal(views.at(-1).draft, 'important draft');
});

test('shows a permission request without sending a decision', async () => {
  let hooks, observe, decisions = 0; const views = [];
  const makeClient = callbacks => {
    hooks = callbacks;
    return { active: false, async connect() { return []; }, watch(id, consume) { observe = consume; return () => {}; }, async send() { hooks.onSession('s'); observe([{ type: 'permission_request', description: 'Run command', detail: 'example' }], 'awaiting'); return true; }, async respondPermission() { decisions++; } };
  };
  const t = createTerminalController({ render: view => views.push(view), exit: () => {}, makeClient });
  await t.connect('http://example', 'token'); await t.choose(); t.setDraft('hello'); await t.send();
  assert.equal(views.at(-1).mode, 'permission');
  assert.match(views.at(-1).status, /original terminal/);
  await t.choose(); t.stop(); assert.equal(decisions, 0);
  observe([{ type: 'result', text: 'Done' }]);
  assert.equal(views.at(-1).mode, 'chat');
  assert.match(views.at(-1).text, /Done/);
});

test('shows elapsed seconds while a session is running', async () => {
  let finish; const views = [];
  const makeClient = hooks => ({ active: false, async connect() { return []; }, async send() { this.active = true; hooks.onStatus('작업 중'); await new Promise(resolve => { finish = resolve; }); this.active = false; return true; } });
  const t = createTerminalController({ render: view => views.push(view), exit: () => {}, makeClient });
  await t.connect('http://example', 'token'); await t.choose(); t.setDraft('hello');
  const pending = t.send();
  assert.match(views.at(-1).status, /Submitting 0s/);
  finish(); await pending;
});

test('discards a selected conversation that finishes loading after a server change', async () => {
  let finishHistory, startHistory;
  const historyStarted = new Promise(resolve => { startHistory = resolve; });
  const watched = [], views = [];
  const makeClient = () => ({
    async connect(address) { return [{ id: 'same', title: address }]; },
    select() {},
    history() { startHistory(); return new Promise(resolve => { finishHistory = resolve; }); },
    watch(id) { watched.push(id); return () => {}; },
  });
  const t = createTerminalController({ render: view => views.push(view), exit: () => {}, makeClient });
  await t.connect('http://old', 'token');
  t.move(1); const selecting = t.choose();
  await historyStarted;
  await t.connect('http://new', 'token');
  finishHistory([{ role: 'assistant', text: 'Private old history' }]);
  await selecting;
  assert.equal(views.at(-1).mode, 'menu');
  assert.match(views.at(-1).text, /http:\/\/new/);
  assert.deepEqual(watched, []);
});

test('long press requests interruption only for the selected running session', async () => {
  let observe, interrupted;
  const views = [];
  const makeClient = () => ({
    async connect() { return [{ id: 's', status: 'busy' }]; },
    select() {},
    async history() { return []; },
    watch(id, consume) { observe = consume; return () => {}; },
    async interruptSession(id) { interrupted = id; },
  });
  const t = createTerminalController({ render: view => views.push(view), exit: () => {}, makeClient });
  await t.connect('http://example', 'token');
  t.move(1); await t.choose();
  observe([{ type: 'user_prompt', text: 'same' }, { type: 'user_prompt', text: 'same' }], 'busy');
  await t.stop();
  assert.equal(interrupted, 's');
  assert.match(views.at(-1).status, /Stop requested/);
  assert.equal(views.at(-1).text.match(/> same/g).length, 2);
  observe([], 'idle');
});

test('menu exposes all sessions and preserves selection while scrolling through long names', async () => {
  const views = [];
  const sessions = Array.from({ length: 9 }, (_, i) => ({ id: String(i), title: '긴 대화 제목 '.repeat(12) + i }));
  const makeClient = () => ({ async connect() { return sessions; }, select() {}, async history(id) { return [{ role: 'assistant', text: '선택 ' + id }]; }, watch() { return () => {}; } });
  const t = createTerminalController({ render: view => views.push(view), exit: () => {}, makeClient });
  await t.connect('http://example', 'token');
  assert.equal(views.at(-1).items.length, 11);
  t.move(8);
  assert.equal(views.at(-1).selected, 8);
  assert.equal(views.at(-1).start, 3);
  await t.choose();
  assert.match(views.at(-1).text, /선택 7/);
});

test('elapsed time remains visible between accepted submission and busy observation', async () => {
  let observe; const views = [];
  const makeClient = hooks => ({ active: false, async connect() { return []; }, watch(id, fn) { observe = fn; return () => {}; }, async send() { hooks.onSession('test-session'); return true; } });
  const t = createTerminalController({ render: v => views.push(v), exit: () => {}, makeClient });
  await t.connect('http://example', 'token'); await t.choose(); t.setDraft('hello');
  await t.send();
  assert.match(views.at(-1).status, /Working \d+s/);
  assert.equal(t.canSend(), false);
  observe([{type:'status', state:'idle'}], 'idle');
  assert.match(views.at(-1).status, /Working \d+s/);
  assert.equal(t.canSend(), false);
  observe([{type:'status', state:'busy'}], 'busy');
  assert.match(views.at(-1).status, /Working \d+s/);
  observe([{type:'result',text:'done'}], 'idle');
  assert.doesNotMatch(views.at(-1).status, /Working/);
});

test('native list item selection opens the corresponding session', async () => {
  const views = [];
  const makeClient = () => ({ async connect() { return [{id:'first', title:'First'}, {id:'second', title:'Second'}]; }, select(id) { this.id = id; }, async history(id) { return [{role:'assistant', text:id}]; }, watch() { return () => {}; } });
  const t = createTerminalController({render: view => views.push(view), exit: () => {}, makeClient});
  await t.connect('http://example', 'token');
  assert.equal(t.selectMenu(2), true);
  await t.choose();
  assert.match(views.at(-1).text, /> second/);
  assert.equal(t.selectMenu(200), false);
});

test('streams separate assistant messages in event order around tool calls without duplicating the cumulative result', async () => {
  let observe; const views = [];
  const makeClient = () => ({ async connect() { return [{ id: 's' }]; }, select() {}, async history() { return []; }, watch(id, fn) { observe = fn; return () => {}; } });
  const t = createTerminalController({ render: view => views.push({ ...view, messages: view.messages?.map(m => ({ ...m })) }), exit() {}, makeClient });
  await t.connect('http://example', 'token'); t.move(1); await t.choose();
  observe([{ type: 'status', state: 'text_start' }, { type: 'text_delta', text: 'Before' }], 'busy');
  assert.equal(views.at(-1).messages.at(-1).text, 'Before');
  observe([{ type: 'status', state: 'text_end' }, { type: 'tool_start', name: 'Search' }, { type: 'tool_end', summary: 'Found' }, { type: 'status', state: 'text_start' }, { type: 'text_delta', text: 'After' }], 'busy');
  assert.deepEqual(views.at(-1).messages.map(m => m.text), ['Before', '› Search', '› Found', 'After']);
  observe([{ type: 'result', text: 'BeforeAfter' }], 'idle');
  assert.deepEqual(views.at(-1).messages.map(m => m.text), ['Before', '› Search', '› Found', 'After']);
});

test('keeps partial text and shows an interruption result', async () => {
  let observe; const views = [];
  const makeClient = () => ({ async connect() { return [{ id: 's' }]; }, select() {}, async history() { return []; }, watch(id, fn) { observe = fn; return () => {}; } });
  const t = createTerminalController({ render: view => views.push(view), exit() {}, makeClient });
  await t.connect('http://example', 'token'); t.move(1); await t.choose();
  observe([{ type: 'user_prompt', text: 'hello' }, { type: 'text_delta', text: 'partial' }, { type: 'result', success: false, text: 'Interrupted by user' }], 'idle');
  assert.deepEqual(views.at(-1).messages.map(m => m.text), ['hello', 'partial', 'Interrupted by user']);
});

test('shows each tool call once while preserving its position through concurrent completions', async () => {
  let observe; const views = [];
  const makeClient = () => ({ async connect() { return [{ id: 's' }]; }, select() {}, async history() { return []; }, watch(id, fn) { observe = fn; return () => {}; } });
  const t = createTerminalController({ render: view => views.push({ ...view, messages: view.messages?.map(m => ({ ...m })) }), exit() {}, makeClient });
  await t.connect('http://example', 'token'); t.move(1); await t.choose();
  observe([{type:'tool_start',name:'Shell',toolId:'1'}, {type:'tool_start',name:'Shell',toolId:'2'}], 'busy');
  assert.deepEqual(views.at(-1).messages.map(m => m.text), ['› Shell', '› Shell']);
  observe([{type:'tool_end',name:'Shell',toolId:'2',summary:'Shell second'}, {type:'tool_end',name:'Shell',toolId:'1',summary:'Shell first'}], 'busy');
  assert.deepEqual(views.at(-1).messages.map(m => m.text), ['› Shell first', '› Shell second']);
});

test('shows a tool completion that was not observed starting', async () => {
  let observe; const views = [];
  const makeClient = () => ({ async connect() { return [{ id: 's' }]; }, select() {}, async history() { return []; }, watch(id, fn) { observe = fn; return () => {}; } });
  const t = createTerminalController({ render: view => views.push(view), exit() {}, makeClient });
  await t.connect('http://example', 'token'); t.move(1); await t.choose();
  observe([{type:'tool_end',name:'Shell',toolId:'1',summary:'Shell finished'}], 'busy');
  assert.equal(views.at(-1).messages.at(-1).text, '› Shell finished');
});

test('leaving the session menu cancels an in-flight session selection', async () => {
  let finishHistory, started, exited=0;
  const waiting=new Promise(resolve=>{started=resolve;});
  const makeClient=()=>({async connect(){return [{id:'s'}]},select(){},history(){started();return new Promise(resolve=>{finishHistory=resolve;})},watch(){throw Error('must not watch after leaving')}});
  const t=createTerminalController({render(){},exit(){exited++},makeClient});
  await t.connect('http://example','token');t.move(1);const choose=t.choose();await waiting;
  t.leave();finishHistory([{role:'assistant',text:'old'}]);await choose;
  assert.equal(exited,1);assert.equal(t.isOpen(),false);
});

test('a late IME commit stays with the conversation that owned the editor', async () => {
  const views = [];
  const makeClient = () => ({ async connect() { return [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]; }, select() {}, async history() { return []; }, watch() { return () => {}; } });
  const t = createTerminalController({ render: view => views.push(view), exit() {}, makeClient });
  await t.connect('http://example', 'token'); t.move(1); await t.choose();
  const saveA = t.captureDraft(); saveA('조합');
  t.menu(); t.move(2); await t.choose(); t.setDraft('other');
  saveA('조합 완료'); assert.equal(views.at(-1).draft, 'other');
  t.menu(); t.move(1); await t.choose(); assert.equal(views.at(-1).draft, '조합 완료');
});

test('a late commit cannot replace newer edits in the same conversation', async () => {
  const views = [];
  const makeClient = () => ({ async connect() { return [{id:'a'}]; }, select() {}, async history() { return []; }, watch() { return () => {}; } });
  const t = createTerminalController({render:view=>views.push(view),exit(){},makeClient});
  await t.connect('http://example','token'); t.move(1); await t.choose();
  const old = t.captureDraft(); old('old'); t.menu(); t.move(1); await t.choose();
  const newer = t.captureDraft(); newer('newer'); old('late');
  assert.equal(views.at(-1).draft,'newer');
});


test('the same editor accepts new drafts after a successful send', async () => {
  const views = [];
  const makeClient = hooks => ({active:false,async connect(){return []},async send(){return true}});
  const t = createTerminalController({render:view=>views.push(view),exit(){},makeClient});
  await t.connect('http://example','token'); await t.choose();
  const save=t.captureDraft(); save('first'); await t.send();
  assert.equal(views.at(-1).draft,'');
  save('second'); assert.equal(views.at(-1).draft,'second');
});

test('glasses replies accumulate and send once to the original session while keeping the draft', async () => {
  const views = [], sent = [], requests = [];
  const makeClient = () => ({
    active: false,
    async connect() { return [{ id: 'original' }, { id: 'helper' }]; },
    select(id) { this.id = id; },
    async history() { return [{ role: 'assistant', text: 'What next?' }]; },
    async send(url, token, text) { sent.push([this.id, text]); return true; },
    async suggestReplies(options) {
      requests.push(options.helperId);
      await options.onSession('helper');
      const n = requests.length;
      return JSON.stringify(['Continue ' + n, 'Summarize ' + n, 'Clarify ' + n]);
    },
  });
  let storage = JSON.stringify([['http://example', 'original', 'helper']]);
  const t = createTerminalController({
    render: view => views.push(view), exit() {}, makeClient,
    replyStorage: { read: async () => storage, write: async value => { storage = value; } },
  });
  await t.connect('http://example', 'token');
  assert.equal(views.at(-1).items.length, 3);
  t.move(1); await t.choose(); t.setDraft('Keep this draft');
  await t.openReplies();
  assert.deepEqual(views.at(-1).replies.items, ['Back', 'Continue 1', 'Summarize 1', 'Clarify 1', 'More different replies']);
  t.moveReplies(4); await t.chooseReply();
  assert.deepEqual(views.at(-1).replies.items, ['Back', 'Continue 1', 'Summarize 1', 'Clarify 1', 'Continue 2', 'Summarize 2', 'Clarify 2', 'More different replies']);
  assert.deepEqual(requests, ['helper', 'helper']);
  t.moveReplies(-100); t.moveReplies(1);
  await Promise.all([t.chooseReply(), t.chooseReply()]);
  assert.deepEqual(sent, [['original', 'Continue 1']]);
  assert.equal(views.at(-1).draft, 'Keep this draft');
  t.leave();
});

test('a new original turn discards a pending suggestion and exposes Stop only while running', async () => {
  let observe, resolveReplies;
  const views = [], interrupted = [];
  const makeClient = () => ({
    async connect() { return [{ id: 'original' }]; },
    select() {},
    async history() { return [{ role: 'assistant', text: 'What next?' }]; },
    watch(id, consume) { observe = consume; return () => {}; },
    async interruptSession(id) { interrupted.push(id); },
    async suggestReplies() { return await new Promise(resolve => { resolveReplies = resolve; }); },
  });
  const t = createTerminalController({
    render: view => views.push(view), exit() {}, makeClient,
    replyStorage: { read: async () => '', write: async () => {} },
  });
  await t.connect('http://example', 'token');
  t.move(1); await t.choose();
  const generation = t.openReplies();
  await Promise.resolve();
  observe([{ type: 'user_prompt', text: 'New turn' }], 'busy');
  resolveReplies('["Old 1", "Old 2", "Old 3"]');
  await generation;
  assert.deepEqual(views.at(-1).replies.items, ['Back', 'Stop response', 'More different replies']);
  t.moveReplies(1); await t.chooseReply();
  assert.deepEqual(interrupted, ['original']);
  observe([], 'idle');
  assert.equal(views.at(-1).replies.items.includes('Stop response'), false);
  t.leave();
});

test('More stops at 30 distinct replies and reuses a recent history snapshot', async () => {
  let view, reads = 0, batches = 0;
  const makeClient = () => ({
    async connect() { return [{ id: 'original' }]; },
    select() {},
    async history() { reads++; return [{ role: 'assistant', text: 'What next?' }]; },
    async suggestReplies({ beforeSubmit, onSession }) {
      await beforeSubmit();
      await onSession('helper');
      const first = batches++ * 3;
      return JSON.stringify([1, 2, 3].map(index => 'Option ' + (first + index)));
    },
  });
  const t = createTerminalController({ render: display => { view = display; }, exit() {}, makeClient,
    replyStorage: { read: async () => '', write: async () => {} } });
  await t.connect('http://example', 'token');
  t.move(1); await t.choose(); await t.openReplies();
  for (let i = 1; i < 10; i++) {
    t.moveReplies(50); await t.chooseReply();
  }
  assert.equal(view.replies.items.length, 31);
  assert.equal(view.replies.items.at(-1), 'Option 30');
  assert.equal(batches, 10);
  assert.equal(reads, 2);
  t.leave();
});

test('a helper creation with an unconfirmed receipt is not repeated after restarting', async () => {
  let storage = '', posts = 0, view;
  const makeClient = () => ({
    async connect() { return [{ id: 'original' }]; },
    select() {},
    async history() { return [{ role: 'assistant', text: 'What next?' }]; },
    async suggestReplies({ beforeSubmit }) {
      await beforeSubmit();
      posts++;
      throw new Error('Lost POST response');
    },
  });
  for (let open = 0; open < 2; open++) {
    const t = createTerminalController({ render: display => { view = display; }, exit() {}, makeClient,
      replyStorage: { read: async () => storage, write: async data => { storage = data; } } });
    await t.connect('http://example', 'token');
    t.move(1); await t.choose(); await t.openReplies();
    assert.equal(view.replies.status, 'Reply request unconfirmed');
    t.leave();
  }
  assert.equal(posts, 1);
});
