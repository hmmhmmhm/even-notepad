import { createCodexClient, type Session, type TerminalEvent } from './codex-client.ts';

type Mode = 'menu' | 'chat' | 'permission' | 'closed';
type Message = { role: string; text: string };
type Client = ReturnType<typeof createCodexClient>;
type SessionRecord = {
  id: string | null; messages: Message[]; draft: string; client: Client; replay: boolean; epoch: number; tools: Map<string, Message>;
  status?: string; title?: string; permission?: TerminalEvent | null; externalBusy?: boolean; started?: number; clock?: ReturnType<typeof setInterval> | null;
  unwatch?: (() => void) | null; stream?: Message | null; hadText?: boolean; finishSequence?: number; awaitingStart?: number; stopNotice?: string;
  stopping?: boolean; editor?: object;
};
type View = { mode: 'menu'; text: string; draft: string; status: string; items: string[]; selected: number; start: number; menuId: number } | { mode: 'chat' | 'permission'; text: string; draft: string; status: string; messages?: Message[] };
type ControllerOptions = { render: (view: View) => void; exit: () => void; clearDraft?: (draft: string) => void; makeClient?: typeof createCodexClient };
function unrefTimer(timer: unknown) {
  if (typeof timer === 'object' && timer !== null && 'unref' in timer && typeof timer.unref === 'function') timer.unref();
}
export function createTerminalController({ render, exit, clearDraft = () => {}, makeClient = createCodexClient }: ControllerOptions) {
  let url = '', token = '', index = 0, menuId = 0, serial = 0, epoch = 0;
  let mode: Mode = 'menu';
  let sessions: Session[] = [], menuSessions: Session[] = [], menuItems: string[] = [];
  let current: SessionRecord | null = null;
  let lastAddress = '', lastToken = '';
  let connectionSerial = 0;
  let refreshTimer: ReturnType<typeof setInterval> | undefined, refreshing = false;
  let pendingDraft: SessionRecord | null = null;
  const records = new Map<string, SessionRecord>();
  function buildRows() { return ['＋ New session', ...menuSessions.map(s => {
    const record = records.get(s.id);
    return (record ? record.permission ? '? ' : record.client.active || record.externalBusy ? '· ' : '  ' : s.status === 'awaiting' ? '? ' : s.status === 'busy' ? '· ' : '  ') + (s.title || 'Codex session');
  }), 'Back to notes']; }
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
      render({ mode, text: '? Permission request\n' + (p.description || p.toolName || '') + '\n' + (p.detail || ''), draft: '', status: current.stopNotice || elapsed + 'Approve or deny in the original terminal' });
    }
    else if (current) {
      const text = current.messages.map(m => (m.role === 'tool' ? '' : '> ') + m.text).join('\n') || 'New session';
      const elapsed = current.started ? Math.floor((Date.now() - current.started) / 1000) + 's' : '';
      const currentId = current.id;
      const attention = sessions.some(s => s.id !== currentId && (records.get(s.id)?.permission || s.status === 'awaiting'));
      const status = current.stopNotice || (current.client.active ? 'Submitting ' + elapsed
        : current.externalBusy || current.awaitingStart ? 'Working ' + elapsed + (current.externalBusy ? ' · Hold to stop' : '')
        : current.status || (attention ? 'Another session needs permission' : 'Ready'));
      render({ mode, text, messages: current.messages, draft: current.draft, status });
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
      for (const event of events) consume(record, event);
      if (state === 'idle' && (!record.awaitingStart || Date.now() >= record.awaitingStart) && !record.client.active) {
        record.awaitingStart = 0;
        record.stopNotice = '';
        record.externalBusy = false; stopClock(record); clearPermission(record);
      } else if (state === 'busy' || state === 'awaiting') {
        record.awaitingStart = 0;
        record.externalBusy = true; startClock(record);
      }
      if (current === record || mode === 'menu') draw();
    }, { replay: record.replay });
  }
  function leave() {
    ++serial; ++connectionSerial; mode = 'closed'; clearInterval(refreshTimer);
    for (const record of records.values()) { record.unwatch?.(); record.unwatch = null; stopClock(record); }
    if (pendingDraft && (!pendingDraft.id || !records.has(pendingDraft.id))) { pendingDraft.unwatch?.(); pendingDraft.unwatch = null; stopClock(pendingDraft); }
    url = ''; token = ''; exit();
  }
  return {
    leave,
    async connect(address: string, secret: string) {
      const connection = ++connectionSerial;
      const nextAddress = address.trim(), nextToken = secret.trim();
      ++serial;
      const probe = createRecord();
      let nextSessions;
      try { nextSessions = await probe.client.connect(nextAddress, nextToken); }
      catch (error) { if (connection !== connectionSerial) return false; throw error; }
      if (connection !== connectionSerial) return false;
      if (lastAddress && (nextAddress !== lastAddress || nextToken !== lastToken)) {
        ++epoch;
        for (const record of records.values()) { record.unwatch?.(); stopClock(record); }
        records.clear(); current = null; pendingDraft = null;
      }
      ++serial;
      url = lastAddress = nextAddress; token = lastToken = nextToken;
      sessions = nextSessions; menuSessions = sessions.slice(0, 18); menuItems = buildRows(); ++menuId; mode = 'menu'; index = 0; draw();
      clearInterval(refreshTimer);
      const refreshAddress = url, refreshToken = token;
      refreshTimer = setInterval(async () => {
        if (refreshing || connection !== connectionSerial || !url || url !== refreshAddress || token !== refreshToken) return;
        refreshing = true;
        try {
          const fresh = await probe.client.connect(refreshAddress, refreshToken);
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
    menu() { ++serial; menuSessions = sessions.slice(0, 18); menuItems = buildRows(); ++menuId; mode = 'menu'; index = 0; draw(); },
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
