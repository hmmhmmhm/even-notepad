import { createCodexClient, type Session, type TerminalEvent } from './codex-client.ts';

import { parseReplies, readHelpers, replyLimit, replyPrompt, type HelperEntry, type PendingReply, type ReplyStorage } from './terminal-replies.ts';

type Mode = 'menu' | 'chat' | 'permission' | 'closed';
type Message = { role: string; text: string };
type Client = ReturnType<typeof createCodexClient>;
type SessionRecord = {
  id: string | null; messages: Message[]; draft: string; client: Client; replay: boolean; epoch: number; tools: Map<string, Message>;
  status?: string; title?: string; permission?: TerminalEvent | null; externalBusy?: boolean; started?: number; clock?: ReturnType<typeof setInterval> | null;
  unwatch?: (() => void) | null; stream?: Message | null; hadText?: boolean; finishSequence?: number; awaitingStart?: number; stopNotice?: string;
  stopping?: boolean; editor?: object; suggested?: string[]; replyRevision?: number; replyHistory?: Message[]; replyStatus?: string;
  replyRecovery?: { nonce: string; revision: number | undefined };
};
type ReplyMenu = { items: string[]; selected: number; menuId: string; status: string };
type View = ({ mode: 'menu'; text: string; draft: string; status: string; items: string[]; selected: number; start: number; menuId: number } | { mode: 'chat' | 'permission'; text: string; draft: string; status: string; messages?: Message[] }) & { replies?: ReplyMenu };
type ControllerOptions = { render: (view: View) => void; exit: () => void; clearDraft?: (draft: string) => void; makeClient?: typeof createCodexClient; replyStorage?: ReplyStorage };
function unrefTimer(timer: unknown) {
  if (typeof timer === 'object' && timer !== null && 'unref' in timer && typeof timer.unref === 'function') timer.unref();
}
export function createTerminalController({ render, exit, clearDraft = () => {}, makeClient = createCodexClient, replyStorage }: ControllerOptions) {
  let url = '', token = '', index = 0, menuId = 0, serial = 0, epoch = 0;
  let mode: Mode = 'menu';
  let sessions: Session[] = [], menuSessions: Session[] = [], menuItems: string[] = [];
  let current: SessionRecord | null = null;
  let lastAddress = '', lastToken = '';
  let connectionSerial = 0;
  let refreshTimer: ReturnType<typeof setInterval> | undefined, refreshing = false;
  let pendingDraft: SessionRecord | null = null;
  const records = new Map<string, SessionRecord>();
  let helperRegistry: ReturnType<typeof readHelpers> | undefined;
  let registryLoad: Promise<void> | undefined;
  let registryWrite = Promise.resolve();
  const requests = new Set<string>();
  let replyMenu: { id: number; selected: number; status: string; previousRows?: string } | undefined;
  let replyMenuId = 0;
  function origin(address = url) { return new URL(address).origin; }
  function visibleSessions(items: Session[], address = url) {
    const hidden = new Set(helperRegistry?.filter(entry => entry[0] === origin(address)).map(entry => entry[2]));
    return items.filter(item => !hidden.has(item.id)).slice(0, 18);
  }
  function saveHelper(server: string, original: string, entry?: HelperEntry) {
    const storage = replyStorage;
    if (!storage) throw new Error('Helper registry unavailable.');
    registryWrite = registryWrite.catch(() => {}).then(async () => {
      if (!helperRegistry) throw new Error('Helper registry unavailable.');
      const updated = helperRegistry.filter(previous => previous[0] !== server || previous[1] !== original);
      if (entry) updated.push(entry);
      await storage.write(JSON.stringify(updated));
      helperRegistry = updated;
    });
    return registryWrite;
  }
  function canStop(record: SessionRecord) { return !!(record.id && (record.externalBusy || record.permission)); }
  function replyRows(record: SessionRecord) {
    const choices = record.suggested || [];
    return [
      { kind: 'back', label: 'Back' },
      ...(canStop(record) ? [{ kind: 'stop', label: 'Stop response' }] : []),
      ...choices.map(label => ({ kind: 'send', label })),
      ...(record.id && choices.length < replyLimit ? [{ kind: 'more', label: 'More different replies' }] : []),
    ];
  }
  function replyView(record: SessionRecord): ReplyMenu | undefined {
    if (!replyMenu) return;
    const items = replyRows(record).map(row => row.label);
    const signature = JSON.stringify(items);
    if (replyMenu.previousRows && replyMenu.previousRows !== signature) replyMenu.id = ++replyMenuId;
    replyMenu.previousRows = signature;
    replyMenu.selected = Math.min(replyMenu.selected, items.length - 1);
    return { items, selected: replyMenu.selected, menuId: 'r' + replyMenu.id,
      status: record.stopNotice || replyMenu.status || record.replyStatus || '' };
  }
  function invalidateReplies(record: SessionRecord) {
    record.suggested = [];
    record.replyHistory = undefined;
    record.replyStatus = '';
    record.replyRevision = (record.replyRevision || 0) + 1;
    if (current === record && replyMenu) {
      replyMenu.id = ++replyMenuId;
      replyMenu.selected = 0;
      replyMenu.status = '';
    }
  }
  async function requestReplies() {
    const record = current;
    if (!record?.id || !replyMenu || !helperRegistry) return;
    const original = record.id, server = origin();
    const key = JSON.stringify([server, original]);
    if (requests.has(key)) { record.replyStatus = 'Finding replies…'; draw(); return; }
    const entry = helperRegistry.find(e => e[0] === server && e[1] === original);
    const pending = entry?.[3];
    if (!pending && (record.suggested?.length ?? 0) >= replyLimit) return;
    const unconfirmed = () => {
      const registered = helperRegistry?.find(e => e[0] === server && e[1] === original);
      return registered?.[2] === null || !!registered?.[3];
    };
    if (entry?.[2] === null) { record.replyStatus = 'Reply request unconfirmed'; draw(); return; }
    requests.add(key);
    replyMenu.status = '';
    record.replyStatus = pending ? 'Checking reply request…' : 'Finding replies…';
    const revision = record.replyRevision;
    const valid = () => revision === record.replyRevision && record.epoch === epoch && !!url;
    let helperId = entry?.[2] || undefined;
    let submission = pending;
    draw();
    try {
      const history = pending ? [] : (record.replyHistory ?? await record.client.history(original));
      if (!valid()) return;
      if (!pending) record.replyHistory = history;
      const previous = record.suggested || [];
      const result = await record.client.suggestReplies({
        originalId: original,
        helperId,
        pending,
        prompt: pending ? '' : replyPrompt(history, previous),
        async beforeSubmit(receipt?: PendingReply) {
          if (!valid()) throw new Error('Reply context changed.');
          submission = receipt;
          await saveHelper(server, original, receipt ? [server, original, helperId ?? null, receipt] : [server, original, helperId ?? null]);
          if (!valid()) {
            await saveHelper(server, original, entry);
            throw new Error('Reply context changed.');
          }
          if (receipt) record.replyRecovery = { nonce: receipt.nonce, revision };
        },
        async onSession(id) {
          helperId = id;
          await saveHelper(server, original, submission ? [server, original, id, submission] : [server, original, id]);
          if (url && origin() === server) sessions = visibleSessions(sessions);
        },
        async onSettled() {
          await saveHelper(server, original, helperId ? [server, original, helperId] : undefined);
        },
      });
      if (!valid()) return;
      if (pending && (record.replyRecovery?.nonce !== pending.nonce || record.replyRecovery.revision !== revision)) {
        record.replyStatus = 'Previous request checked. Choose More for new replies.';
        return;
      }
      const next = parseReplies(result, previous);
      record.suggested = [...previous, ...next];
      if (current === record && replyMenu) {
        replyMenu.selected = previous.length ? replyRows(record).findIndex(row => row.kind === 'send' && row.label === next[0]) : 0;
      }
      record.replyStatus = '';
    } catch {
      if (valid()) record.replyStatus = unconfirmed()
        ? 'Reply request unconfirmed' : 'Could not find replies. Try again.';
    } finally {
      requests.delete(key);
      if (current === record && replyMenu) draw();
    }
  }
  function buildRows() { return ['＋ New session', ...menuSessions.map(s => {
    const record = records.get(s.id);
    return (record ? record.permission ? '? ' : record.client.active || record.externalBusy ? '· ' : '  ' : s.status === 'awaiting' ? '? ' : s.status === 'busy' ? '· ' : '  ') + (s.title || 'Codex session');
  }), 'Back to computers']; }
  function rows() { return menuItems; }
  function getMode(): Mode { return mode; }
  function draw() {
    if (mode === 'closed') return;
    if (mode === 'menu') {
      const start = Math.max(0, index - 5);
      const items = rows();
      render({ mode, text: items.slice(start, start + 6).join('\n'), items, selected: index, start, menuId, draft: '', status: '' });
    }
    else if (mode === 'permission' && current?.permission) {
      const p = current.permission;
      const elapsed = current.started ? Math.floor((Date.now() - current.started) / 1000) + 's · ' : '';
      render({ mode, replies: replyView(current), text: '? Permission request\n' + (p.description || p.toolName || '') + '\n' + (p.detail || ''), draft: '', status: current.stopNotice || elapsed + 'Approve or deny in the original terminal' });
    }
    else if (current) {
      const text = current.messages.map(m => (m.role === 'tool' ? '' : '> ') + m.text).join('\n') || 'New session';
      const elapsed = current.started ? Math.floor((Date.now() - current.started) / 1000) + 's' : '';
      const currentId = current.id;
      const attention = sessions.some(s => s.id !== currentId && (records.get(s.id)?.permission || s.status === 'awaiting'));
      const status = current.stopNotice || (current.client.active ? 'Submitting ' + elapsed
        : current.externalBusy || current.awaitingStart ? 'Working ' + elapsed + (current.id && replyStorage ? ' · Hold for replies' : '')
        : current.status || (attention ? 'Another session needs permission' : 'Ready'));
      render({ mode, replies: replyView(current), text, messages: current.messages, draft: current.draft, status });
    }
  }
  function createRecord(id: string | null = null) {
    let client: Client;
    const record: SessionRecord = { id, messages: [], draft: '', get client() { return client; }, replay: !id, epoch, tools: new Map() };
    client = makeClient({
      onStatus(text) { record.status = text; if (current === record && mode === 'chat') draw(); },
      onSession(id) {
        if (record.epoch !== epoch) return;
        record.id = id; records.set(id, record);
        if (pendingDraft === record) pendingDraft = null;
        if (url) watch(record);
        if (!sessions.some(s => s.id === id)) {
          sessions.unshift({ id, title: record.title || 'Codex session' });
        }
      },
    });
    return record;
  }
  function startClock(record: SessionRecord) {
    if (!url || record.epoch !== epoch) return;
    if (!record.started) record.started = Date.now();
    if (!record.clock) {
      record.clock = setInterval(() => { if (current === record && (mode === 'chat' || mode === 'permission')) draw(); }, 1000);
      unrefTimer(record.clock);
    }
  }
  function stopClock(record: SessionRecord) { if (record.clock != null) clearInterval(record.clock); record.clock = null; record.started = 0; }
  function clearPermission(record: SessionRecord) {
    record.permission = null;
    if (current === record && mode === 'permission') mode = 'chat';
  }
  function consume(record: SessionRecord, event: TerminalEvent) {
    if (event.type === 'permission_request') {
      record.permission = event;
      startClock(record);
      if (current === record && mode === 'chat') mode = 'permission';
    } else if (event.type === 'permission_result') {
      clearPermission(record);
    } else if (event.type === 'tool_start') {
      record.stream = null;
      const message = { role: 'tool', text: '› ' + (event.name || 'Task started') };
      record.messages.push(message);
      if (event.toolId) record.tools.set(event.toolId, message);
    } else if (event.type === 'tool_end') {
      const text = '› ' + (event.summary || event.name || 'Task finished');
      const message = event.toolId && record.tools.get(event.toolId);
      if (message && event.toolId) { message.text = text; record.tools.delete(event.toolId); }
      else record.messages.push({ role: 'tool', text });
    } else if (event.type === 'user_prompt' && event.text) {
      invalidateReplies(record);
      record.stream = null;
      record.hadText = false;
      record.status = '';
      record.messages.push({ role: 'user', text: event.text });
    } else if (event.type === 'text_delta' && event.text) {
      if (!record.stream) {
        record.stream = { role: 'assistant', text: '' };
        record.messages.push(record.stream);
      }
      record.stream.text += event.text;
      record.hadText = true;
    } else if (event.type === 'result' || event.type === 'error') {
      record.replyHistory = undefined;
      record.finishSequence = (record.finishSequence || 0) + 1;
      record.awaitingStart = 0;
      record.stopNotice = '';
      if (event.type === 'result' && event.text && (!record.hadText || (event.success === false && !record.messages.some(m => m.role === 'assistant' && m.text === event.text)))) {
        record.messages.push({ role: 'assistant', text: event.text });
      }
      record.stream = null;
      record.hadText = false;
      record.tools.clear();
      record.externalBusy = false;
      stopClock(record);
      clearPermission(record);
    } else if (event.type === 'status' && (event.state === 'text_start' || event.state === 'text_end')) {
      record.stream = null;
    } else if (event.type === 'status' && event.state === 'idle') {
      if (record.client.active || (record.awaitingStart && Date.now() < record.awaitingStart)) return;
      record.stopNotice = '';
      record.externalBusy = false;
      stopClock(record);
      clearPermission(record);
    } else if (event.type === 'status' && event.state === 'busy') {
      record.awaitingStart = 0;
      record.externalBusy = true;
      startClock(record);
    }
  }
  function watch(record: SessionRecord) {
    if (!record.id || record.unwatch || !record.client.watch) return;
    record.unwatch = record.client.watch(record.id, (events, state) => {
      const menu = current === record ? replyMenu : undefined;
      const wasStoppable = canStop(record);
      const selected = menu && replyRows(record)[menu.selected];
      const revision = record.replyRevision;
      for (const event of events) consume(record, event);
      if (state === 'idle' && (!record.awaitingStart || Date.now() >= record.awaitingStart) && !record.client.active) {
        record.awaitingStart = 0;
        record.stopNotice = '';
        record.externalBusy = false; stopClock(record); clearPermission(record);
      } else if (state === 'busy' || state === 'awaiting') {
        record.awaitingStart = 0;
        record.externalBusy = true; startClock(record);
      }
      if (menu && selected && revision === record.replyRevision && wasStoppable !== canStop(record)) {
        menu.selected = Math.max(0, replyRows(record).findIndex(row => row.kind === selected.kind && row.label === selected.label));
      }
      if (current === record || mode === 'menu') draw();
    }, { replay: record.replay });
  }
  function leave() {
    ++serial; ++connectionSerial; mode = 'closed'; replyMenu = undefined; clearInterval(refreshTimer);
    for (const record of records.values()) { record.unwatch?.(); record.unwatch = null; stopClock(record); }
    if (pendingDraft && (!pendingDraft.id || !records.has(pendingDraft.id))) { pendingDraft.unwatch?.(); pendingDraft.unwatch = null; stopClock(pendingDraft); }
    url = ''; token = ''; exit();
  }
  function menu() { ++serial; replyMenu = undefined; menuSessions = sessions.slice(0, 18); menuItems = buildRows(); ++menuId; mode = 'menu'; index = 0; draw(); }
  return {
    leave,
    back() {
      if (replyMenu) { replyMenu = undefined; draw(); }
      else if (mode === 'chat' || mode === 'permission') menu();
      else if (mode === 'menu' && url) leave();
    },
    async connect(address: string, secret: string) {
      const connection = ++connectionSerial;
      const nextAddress = address.trim(), nextToken = secret.trim();
      ++serial;
      const probe = createRecord();
      let nextSessions;
      try {
        if (replyStorage && !helperRegistry) {
          await (registryLoad ??= replyStorage.read().then(raw => { helperRegistry = readHelpers(raw); }).catch(() => {}).finally(() => { registryLoad = undefined; }));
        }
        if (connection !== connectionSerial) return false;
        nextSessions = await probe.client.connect(nextAddress, nextToken);
      }
      catch (error) { if (connection !== connectionSerial) return false; throw error; }
      if (connection !== connectionSerial) return false;
      if (lastAddress && (nextAddress !== lastAddress || nextToken !== lastToken)) {
        ++epoch;
        for (const record of records.values()) { record.unwatch?.(); stopClock(record); }
        records.clear(); current = null; pendingDraft = null;
      }
      ++serial;
      url = lastAddress = nextAddress; token = lastToken = nextToken;
      replyMenu = undefined; sessions = visibleSessions(nextSessions); menuSessions = sessions.slice(0, 18); menuItems = buildRows(); ++menuId; mode = 'menu'; index = 0; draw();
      clearInterval(refreshTimer);
      const refreshAddress = url, refreshToken = token;
      refreshTimer = setInterval(async () => {
        if (refreshing || connection !== connectionSerial || !url || url !== refreshAddress || token !== refreshToken) return;
        refreshing = true;
        try {
          const fresh = visibleSessions(await probe.client.connect(refreshAddress, refreshToken), refreshAddress);
          if (connection !== connectionSerial || !url || url !== refreshAddress || token !== refreshToken) return;
          sessions = [...fresh, ...sessions.filter(s => records.has(s.id) && !fresh.some(f => f.id === s.id))];
          if (mode !== 'menu') draw();
        } catch { /* Keep the last known session list during a connection failure. */ }
        finally { refreshing = false; }
      }, 5000);
      unrefTimer(refreshTimer);
      return true;
    },
    isOpen() { return !!url; },
    currentDraft() { return current?.draft || ''; },
    menu,
    move(delta: number) { if (mode !== 'menu') return false; index = Math.max(0, Math.min(rows().length - 1, index + delta)); draw(); return true; },
    selectMenu(position: number) { if (mode !== 'menu' || !Number.isInteger(position) || position < 0 || position >= rows().length) return false; index = position; return true; },
    reportMenuError(message: string) { if (mode === 'menu') render({ mode, text: rows().join('\n'), items: rows(), selected: index, start: Math.max(0, index - 5), menuId, draft: '', status: message }); },
    async choose() {
      if (mode === 'permission') return;
      if (mode !== 'menu') return;
      if (index === rows().length - 1) { leave(); return; }
      const session = index ? menuSessions[index - 1] : null;
      const request = ++serial;
      let record = session ? records.get(session.id) : pendingDraft;
      if (!record) {
        record = createRecord(session?.id || null);
        if (session) {
          const address = url, secret = token;
          try {
            await record.client.connect(address, secret);
            record.client.select(session.id);
            record.messages = (await record.client.history(session.id)).map(m => ({ role: m.role, text: m.text }));
          } catch (error) {
            if (request === serial) throw error;
            return;
          }
          if (request !== serial || record.epoch !== epoch) return;
          record.externalBusy = session.status === 'busy' || session.status === 'awaiting';
          if (record.externalBusy) startClock(record);
          records.set(session.id, record);
        } else pendingDraft = record;
      }
      current = record; mode = record.permission ? 'permission' : 'chat'; watch(record); draw();
    },
    setDraft(text: string) { if (mode !== 'chat' || !current) return; current.draft = text; draw(); },
    captureDraft() {
      const record = current;
      const editor = {};
      if (record) record.editor = editor;
      return (text: string) => {
        if (!record || record.epoch !== epoch || record.editor !== editor) return;
        record.draft = text;
        if (current === record && mode === 'chat') draw();
      };
    },
    canSend() { return mode === 'chat' && !!current && !current.client.active && !current.awaitingStart; },
    async openReplies() {
      if (!current || !replyStorage || replyMenu || (mode !== 'chat' && mode !== 'permission')) return;
      replyMenu = { id: ++replyMenuId, selected: 0, status: !helperRegistry ? 'Reply storage unavailable' : !current.id ? 'Start a conversation first' : '' };
      draw();
      if (!current.suggested?.length || current.replyStatus === 'Reply request unconfirmed') await requestReplies();
    },
    closeReplies() { replyMenu = undefined; draw(); },
    moveReplies(delta: number) {
      if (!current || !replyMenu) return;
      replyMenu.selected = Math.max(0, Math.min(replyRows(current).length - 1, replyMenu.selected + delta));
      draw();
    },
    async chooseReply() {
      const record = current, menu = replyMenu;
      if (!record || !menu) return;
      const row = replyRows(record)[menu.selected];
      if (!row) return;
      if (row.kind === 'back') { this.closeReplies(); return; }
      if (row.kind === 'stop') { await this.stop(); return; }
      if (row.kind === 'more') { await requestReplies(); return; }
      if (mode !== 'chat' || !record.id || record.client.active || record.awaitingStart || record.externalBusy || record.permission) {
        menu.status = 'Session busy · Reply kept';
        draw();
        return;
      }
      replyMenu = undefined;
      draw();
      const finishSequence = record.finishSequence || 0;
      const revision = record.replyRevision;
      const accepted = await record.client.send(url, token, row.label, () => current === record
        && record.epoch === epoch && !!url && record.replyRevision === revision);
      if (accepted || record.status?.startsWith('Receipt unconfirmed') || record.status?.startsWith('Reply context changed')) invalidateReplies(record);
      if (!accepted && current === record && mode === 'chat' && !replyMenu && record.replyRevision === revision
          && /^(Session in use|Session busy|Check session status|Data too large)/.test(record.status || '')) {
        menu.status = (record.status || '').replace('Draft kept', 'Reply kept');
        replyMenu = menu;
      }
      if (accepted && record.epoch === epoch && url && !record.externalBusy && (record.finishSequence || 0) === finishSequence) {
        record.awaitingStart = Date.now() + 15000;
        startClock(record);
      }
      if (current === record) draw();
    },
    async stop() {
      if ((mode !== 'chat' && mode !== 'permission') || !current?.id || current.stopping || (!current.externalBusy && !current.permission)) return;
      const record = current, id = current.id;
      record.stopping = true;
      record.stopNotice = 'Requesting stop…';
      draw();
      try {
        await record.client.interruptSession(id);
        record.stopNotice = 'Stop requested.';
      } catch {
        record.stopNotice = 'Could not send stop request.';
      } finally {
        record.stopping = false;
        if (current === record) draw();
      }
    },
    async send() {
      const record = current;
      if (mode !== 'chat' || !record || record.client.active || record.awaitingStart || !record.draft.trim()) return;
      const draft = record.draft;
      const finishSequence = record.finishSequence || 0;
      replyMenu = undefined;
      invalidateReplies(record);
      record.title = draft.trim().slice(0, 40);
      startClock(record);
      let accepted = false;
      try { accepted = await record.client.send(url, token, draft.trim()); }
      finally { if (!record.externalBusy && !record.permission && !accepted) stopClock(record); }
      if (url && record.epoch === epoch && accepted && !record.externalBusy && (record.finishSequence || 0) === finishSequence) { record.awaitingStart = Date.now() + 15000; startClock(record); }
      else if (!record.externalBusy && !record.permission && !record.client.active) stopClock(record);
      if (accepted && record.draft === draft) {
        record.draft = '';
        if (current === record && getMode() !== 'menu') clearDraft(draft);
      }
      if (current === record && mode === 'chat') draw();
    },
  };
}
