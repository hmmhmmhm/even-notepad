import { waitForEvenAppBridge, StartUpPageCreateResult, OsEventTypeList, CreateStartUpPageContainer, ImageRawDataUpdate, TextContainerUpgrade } from '@evenrealities/even_hub_sdk';
import { makeTerminalLines, viewport, scrollPosition, scrollbar, graphemes } from './viewport.ts';
import { editorCursor, editorFooter } from './editor-hud.ts';
import './style.css';
import type { DocumentFile } from './document-library.ts';
import type { NewsItem } from './news/live-state.ts';
import { mountDocuments } from './document-sheet.ts';
import { watchWriterInput } from './writer-input.ts';
import { version, permissions } from '../app.json';
import { mountTypewriterDebug } from './typewriter-debug.ts';
import { mountTypewriter } from './typewriter.ts';
import { watchKeyboardHold } from './keyboard-hold.ts';
import { createGlassesScroll } from './glasses-scroll.ts';
import { createTerminalController } from './terminal-controller.ts';
import { createComputers } from './computers.ts';
import { terminalLines } from './terminal-format.ts';
import { watchPhoneMenuTouch } from './phone-menu-touch.ts';
import { replyMenuLayout, terminalMenuLayout } from './terminal-menu-layout.ts';
import { backAfterInput } from './terminal-back.ts';
import { startupLayout, startupLogo } from './startup-menu.ts';
import { isWorkspaceTarget } from './phone-workspace.ts';
import { computerPickerLayout } from './computer-picker.ts';
import { installComputerFixture } from './dev-computers-fixture.ts';
import { createXClient, validateXCredentials, type XCredentials } from './x-client.ts';
import { clearXImages, createXFrame, sendXFrame, xLayout } from './x-display.ts';
import { trimXPosts } from './x-memory.ts';
import { installXFixture } from './dev-x-fixture.ts';
import { loadNews, resolveLocale } from './news/news-service.ts';
import { createNewsController } from './news/news-controller.ts';
import { newsLayout, createNewsFrame, sendNewsFrame } from './news-display.ts';
import { configurePublicTerminalDialog } from './terminal-public-notice.ts';

declare global { interface Window { flutter_inappwebview?: { callHandler: (...args: unknown[]) => unknown } } }
function required<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error('Missing app element: ' + selector);
  return element;
}
import { pageContainer } from './sdk-page.ts';
const surface = required<HTMLElement>('#writer-surface');
let input = required<HTMLTextAreaElement>('#writer');
const hasEvenHost = () => typeof window.flutter_inappwebview?.callHandler === 'function';
const fixture = import.meta.env.DEV && new URLSearchParams(location.search).has('fixture');
const terminalEnabled = import.meta.env.MODE === 'private' || import.meta.env.DEV;
const fixtureComputers = fixture && new URLSearchParams(location.search).get('fixture') === 'computers' ? installComputerFixture() : null;
const fixtureX = fixture && new URLSearchParams(location.search).get('fixture') === 'x' ? installXFixture() : null;
const reportEdit = mountTypewriterDebug(surface, version, new URL(import.meta.url).pathname.split('/').at(-1) ?? '');
const { edit, release, resetPaper } = mountTypewriter(reportEdit);
const claimKeyHold = watchKeyboardHold(surface, release);
let bridge: Awaited<ReturnType<typeof waitForEvenAppBridge>> | undefined;
let ready = false;
let pending = false;
let rebuilding = false;
let writerText = input.value;
let lines = editorCursor(writerText, 0).lines;
let notePosition = 0;
let noteCursor = 0;
let noteCursorVisible = true;
let first = 0;
let retry: ReturnType<typeof setTimeout> | undefined;
const sent = new Map();
const glassesScroll = createGlassesScroll();
let glassesActive = true;
let codexView = false;
let xView = false;
let newsView = false, newsIndex = 0, newsPage = 0, newsPages = 1, newsRevision = 0;
const newsStorage = {
  getLocalStorage: (key: string) => bridge ? bridge.getLocalStorage(key) : Promise.resolve(fixture ? localStorage.getItem(key) || '' : ''),
  setLocalStorage: (key: string, value: string) => bridge ? bridge.setLocalStorage(key, value) : Promise.resolve(fixture ? (localStorage.setItem(key, value), true) : false),
};
const news = createNewsController<NewsItem>(options => loadNews(newsStorage, navigator.language, options), () => {
  if (newsView) { newsRevision++; void flush(); }
});
let xCredentials: XCredentials | null = null;
type XPost = Awaited<ReturnType<ReturnType<typeof createXClient>['timeline']>>['posts'][number];
let xPosts: XPost[] = [], xNext: string | null = null;
let xStatus = '', xLoading = false, xGeneration = 0, xFailed = false, xError = '', xClientVersion = -1;
let xClient: ReturnType<typeof createXClient> | undefined;
let xIndex = 0, xOffset = 0, xPage = 0, xPages = 1, xRevision = 0;
window.addEventListener('sandevistan-x-image-ready', () => { if (xView) renderX(); });
let home = true;
let homeSelected = 0;
let homeStatus = '';
let homeBusy = false;
type ComputerEntry = { name: string; url: string; token: string; allowed?: boolean };
type ComputerPicker = { id: number; entries: ComputerEntry[]; selected: number; status: string };
let computerPicker: ComputerPicker | null = null;
let nextPickerId = 0;
let terminalMode = '';
let codexDraft = '';
let terminalStatus = '';
let displayedLayout = 'home:0:';
type SessionMenu = { items: string[]; selected: number; start: number; menuId: number };
let sessionMenu: SessionMenu | null = null;
let replyMenu: { items: string[]; selected: number; menuId: string; status: string } | undefined;
const replyLayout = () => 'replies:' + replyMenu?.menuId + ':' + replyMenu?.selected;
let phoneMenu = false;
let styledLines: ReturnType<typeof terminalLines> = [];
const glassesStatus = required<HTMLElement>('#glasses-connection-status');
async function bridgeWrite<T>(operation: () => Promise<T>): Promise<T> {
  const watchdog = setTimeout(() => { glassesStatus.hidden = false; }, 10000);
  try { return await operation(); }
  finally { clearTimeout(watchdog); glassesStatus.hidden = true; }
}
const lineCount = () => 6;
const menuLayout = () => {
  if (!sessionMenu) throw new Error('Session menu unavailable');
  return (phoneMenu ? 'phone-menu:' : 'menu:') + JSON.stringify(phoneMenu ? [sessionMenu.menuId, sessionMenu.items, sessionMenu.selected, sessionMenu.start] : [sessionMenu.menuId, sessionMenu.items]);
};
const homeLayout = () => computerPicker ? `computers:${computerPicker.id}:${computerPicker.selected}:${computerPicker.status}` : `home:${homeSelected}:${homeStatus}`;
let logoBytes: Uint8Array | undefined;
async function sendHomeLogo() {
  const host = bridge;
  if (!host) throw new Error('Glasses bridge unavailable');
  if (!logoBytes) {
    const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 28;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('2D Canvas unavailable');
    const data = context.createImageData(32, 28), pixels = startupLogo();
    for (let i = 0; i < pixels.length; i++) { data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = pixels[i]; data.data[i * 4 + 3] = 255; }
    context.putImageData(data, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('Could not create startup logo');
    logoBytes = new Uint8Array(await blob.arrayBuffer());
  }
  const bytes = logoBytes;
  if (!bytes) throw new Error('Startup logo unavailable');
  const result = await bridgeWrite(() => host.updateImageRawData(new ImageRawDataUpdate({ containerID: 9, containerName: 'home-logo', imageData: bytes })));
  if (result !== 'success') throw Error('Startup logo update failed: ' + result);
}
async function sendHomeLogoSafely() {
  let timeout;
  try {
    await Promise.race([sendHomeLogo(), new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Startup logo timed out')), 4000); })]);
  } catch (error) { console.error('Startup logo failed', error); }
  finally { clearTimeout(timeout); }
}
const statusMeasure = document.createElement('canvas').getContext('2d');
if (statusMeasure) statusMeasure.font = '20px sans-serif';
const inputWidth = (text: string) => statusMeasure ? statusMeasure.measureText(text).width : graphemes(text).length * 11;
function inputLine() {
  let label = (terminalStatus || 'Ready').replace(/ · Hold for replies$/, '');
  if (label.includes('Draft kept')) label = label.startsWith('Session in use') ? 'In use · kept' : label.startsWith('Session busy') ? 'Busy · kept' : 'Draft kept';
  if (label === 'Requesting stop…') label = 'Stopping…';
  const status = graphemes(label);
  while (status.length && inputWidth(status.join('')) > 145) status.pop();
  let tail = '';
  for (const char of graphemes(codexDraft.replace(/\s+/g, ' ')).reverse()) {
    if (inputWidth('> ' + char + tail) > 300) break;
    tail = char + tail;
  }
  const space = inputWidth(' ') || 5;
  const statusText = status.join('');
  let padding = Math.max(1, Math.min(100, 12 + Math.floor((505 - inputWidth('> ' + tail) - inputWidth(statusText)) / space)));
  const encoder = new TextEncoder();
  while (encoder.encode('> ' + tail + ' '.repeat(padding) + statusText).length > 150) {
    if (padding > 1) padding--;
    else if (tail) tail = graphemes(tail).slice(1).join('');
    else break;
  }
  return '> ' + tail + ' '.repeat(padding) + statusText;
}
let momentumTimer: ReturnType<typeof setTimeout> | undefined;
let momentumDirection = 0, momentumLast = 0, momentumBurst = 0;
function resetMomentum() { clearTimeout(momentumTimer); momentumTimer = undefined; momentumDirection = 0; momentumBurst = 0; }
function scrollGlasses(direction: number) {
  if (xView) { moveX(direction); return; }
  if (newsView) { moveNews(direction); return; }
  const now = performance.now();
  clearTimeout(momentumTimer);
  momentumBurst = direction === momentumDirection && now - momentumLast <= 180 ? momentumBurst + 1 : 1;
  momentumDirection = direction; momentumLast = now;
  first = glassesScroll.move(lines, first, direction, now, lineCount());
  void flush();
  if ((!codexView || terminalMode === 'chat') && momentumBurst >= 3) {
    const wasCodex = codexView;
    let remaining = 2;
    const coast = () => {
      if (codexView !== wasCodex || (codexView && terminalMode !== 'chat') || !remaining--) return resetMomentum();
      const next = scrollPosition(lines, first, direction, lineCount());
      if (next === first) return resetMomentum();
      first = next; void flush();
      momentumTimer = setTimeout(coast, 125);
    };
    momentumTimer = setTimeout(coast, 90);
  }
}
function menuLabel(value: string) {
  const chars = graphemes(value.replace(/\s+/g, ' '));
  let width = 0, bytes = 0, result = '';
  for (const char of chars) {
    const size = /^[\x20-\x7e]$/.test(char) ? 1 : 2;
    const charBytes = new TextEncoder().encode(char).length;
    if (width + size > 40 || bytes + charBytes > 60 || inputWidth(result + char + '…') > 480) return result + '…';
    result += char; width += size; bytes += charBytes;
  }
  return result || ' ';
}

function currentState() {
  if (home) return [];
  if (codexView && replyMenu) return [{ containerID: 4, containerName: 'terminal-status', content: replyMenu.status || ' ' }];
  const view = viewport(lines, first, lineCount());
  if (codexView && terminalMode === 'menu') return [{ containerID: 4, containerName: 'terminal-status', content: terminalStatus || ' ' }];
  const caret = !codexView ? editorCursor(writerText, noteCursor) : null;
  const showCaret = !codexView && noteCursorVisible && document.activeElement === input && !input.readOnly && input.value === writerText;
  const noteRow = (index: number) => {
    if (!writerText) return index === 0 ? { text: showCaret ? '| Start typing…' : 'Start typing…', dim: true } : null;
    const text = lines[index];
    if (text === undefined) return null;
    return { text: showCaret && index === caret?.row ? text.slice(0, caret?.column) + '|' + text.slice(caret?.column) : text, dim: false };
  };
  const noteRows = !codexView ? Array.from({ length: 6 }, (_, i) => noteRow(view.position + i)) : null;
  if (!codexView || terminalMode === 'chat') return [
    ...Array.from({ length: 6 }, (_, i) => ({ containerID: 10 + i, containerName: 'terminal-line-' + i, content: (codexView ? styledLines[view.position + i]?.text : noteRows?.[i]?.text) || ' ', textColor: (codexView ? styledLines[view.position + i]?.dim : noteRows?.[i]?.dim) ? 2 : 4 })),
    { containerID: 3, containerName: 'count', content: codexView ? inputLine() : editorFooter(documents.current().name, writerText, inputWidth) },
  ];
  const state = [
    { containerID: 1, containerName: 'writer', content: view.text || ' ' },
    { containerID: 2, containerName: 'scroll', content: scrollbar(view.position, view.max) },
    { containerID: 3, containerName: 'count', content: codexView ? (terminalMode === 'menu' ? 'Tap to select' : terminalMode === 'permission' ? 'View request' : '> ' + graphemes(codexDraft).slice(-22).join('')) : `${graphemes(writerText).length} ch` },
  ];
  if (codexView) state.push({ containerID: 4, containerName: 'terminal-status', content: terminalStatus || 'Ready' });
  return state;
}
function editorFrame() {
  const state = currentState();
  return [
    { xPosition: 4, yPosition: 4, width: 568, height: 260, borderWidth: 1, borderColor: 4, borderRadius: 10, containerID: 5, containerName: 'terminal-frame', content: ' ', isEventCapture: 1 },
    ...Array.from({ length: 6 }, (_, i) => ({ xPosition: 20, yPosition: 20 + i * 30, width: 536, height: 30, ...state[i], isEventCapture: 0 })),
    { xPosition: 17, yPosition: 212, width: 538, height: 42, borderWidth: 1, borderColor: 3, borderRadius: 7, paddingLength: 4, textColor: 3, ...state[6], isEventCapture: 0 },
  ];
}
async function flush() {
  const host = bridge;
  if (!ready || !host || pending) return;
  pending = true;
  try {
    for (;;) {
      const wanted = home ? homeLayout() : xView ? 'x' : newsView ? 'news' : codexView ? replyMenu ? replyLayout() : terminalMode === 'menu' ? menuLayout() : terminalMode === 'chat' ? 'chat' : 'terminal' : 'note';
      if (displayedLayout !== wanted) {
        if (wanted === 'x') {
          rebuilding = true;
          try {
            if (!await bridgeWrite(() => host.rebuildPageContainer(pageContainer(xLayout)))) throw Error('X layout rejected');
          } finally { rebuilding = false; }
          displayedLayout = wanted; sent.clear(); continue;
        }
        if (wanted === 'news') {
          rebuilding = true;
          try { if (!await bridgeWrite(() => host.rebuildPageContainer(pageContainer(newsLayout)))) throw Error('News layout rejected'); }
          finally { rebuilding = false; }
          displayedLayout = wanted; sent.clear(); continue;
        }
        if (wanted.startsWith('computers:')) {
          if (!computerPicker) continue;
          const textObject = computerPickerLayout(computerPicker, menuLabel);
          rebuilding = true;
          let rebuilt;
          try { rebuilt = await bridgeWrite(() => host.rebuildPageContainer(pageContainer({ containerTotalNum: textObject.length, textObject }))); }
          finally { rebuilding = false; }
          if (!rebuilt) throw Error('Computer picker layout rejected');
          displayedLayout = wanted; sent.clear(); continue;
        }
        if (wanted.startsWith('home:')) {
          const layout = startupLayout(homeSelected, homeStatus, terminalEnabled);
          rebuilding = true;
          try {
            const rebuilt = await bridgeWrite(() => host.rebuildPageContainer(pageContainer({ containerTotalNum: layout.textObject.length + layout.imageObject.length, ...layout })));
            if (!rebuilt) throw Error('Startup layout rejected');
            displayedLayout = wanted; sent.clear();
            await sendHomeLogoSafely();
          } finally { rebuilding = false; }
          continue;
        }
        if (wanted.startsWith('replies:') && replyMenu) {
          const textObject = replyMenuLayout(replyMenu, replyMenu.status);
          rebuilding = true;
          let rebuilt;
          try { rebuilt = await bridgeWrite(() => host.rebuildPageContainer(pageContainer({ containerTotalNum: textObject.length, textObject }))); }
          finally { rebuilding = false; }
          if (!rebuilt) throw Error('Reply menu layout rejected');
          displayedLayout = wanted; sent.clear(); continue;
        }
        const isMenu = wanted.startsWith('menu:');
        const isPhoneMenu = wanted.startsWith('phone-menu:');
        const isChat = wanted === 'chat' || wanted === 'note';
        if ((isMenu || isPhoneMenu) && !sessionMenu) continue;
        const activeMenu = sessionMenu;
        const listObject = isMenu ? [{ xPosition: 16, yPosition: 10, width: 536, height: 224, borderRadius: 8, containerID: 20, containerName: 'session-list-' + activeMenu?.menuId, itemContainer: { itemCount: activeMenu?.items.length ?? 0, itemWidth: 520, isItemSelectBorderEn: 1, itemName: (activeMenu?.items ?? []).map(menuLabel) }, isEventCapture: 1 }] : [];
        const textObject = isPhoneMenu && activeMenu ? terminalMenuLayout(activeMenu, menuLabel, terminalStatus) : isMenu ? [{ xPosition: 16, yPosition: 240, width: 530, height: 34, textColor: 3, containerID: 4, containerName: 'terminal-status', content: terminalStatus || ' ', isEventCapture: 0 }] : isChat ? editorFrame() : [
          ...(wanted === 'terminal' ? [{ xPosition: 0, yPosition: 0, width: 576, height: 280, borderWidth: 1, borderColor: 4, borderRadius: 4, containerID: 5, containerName: 'terminal-frame', content: ' ', isEventCapture: 0 }] : []),
          { xPosition: wanted === 'terminal' ? 8 : 0, yPosition: wanted === 'terminal' ? 5 : 0, width: 510, height: wanted === 'terminal' ? 195 : 240, ...(wanted === 'terminal' ? { textColor: 4 } : {}), containerID: 1, containerName: 'writer', content: ' ', isEventCapture: 1 },
          { xPosition: 540, yPosition: 0, width: 30, height: 240, containerID: 2, containerName: 'scroll', content: ' ', isEventCapture: 0 },
          { xPosition: wanted === 'terminal' ? 8 : 490, yPosition: wanted === 'terminal' ? 211 : 255, width: wanted === 'terminal' ? 510 : 80, height: 30, ...(wanted === 'terminal' ? { textColor: 3 } : {}), containerID: 3, containerName: 'count', content: ' ', isEventCapture: 0 },
        ];
        if (wanted === 'terminal') textObject.push({ xPosition: 0, yPosition: 248, width: 576, height: 32, borderWidth: 1, borderColor: 4, paddingLength: 2, textColor: 3, containerID: 4, containerName: 'terminal-status', content: ' ', isEventCapture: 0 });
        rebuilding = true;
        let rebuilt;
        try { rebuilt = await bridgeWrite(() => host.rebuildPageContainer(pageContainer({ containerTotalNum: textObject.length + listObject.length, textObject, ...(isMenu ? { listObject } : {}) }))); }
        finally { rebuilding = false; }
        if (!rebuilt) throw new Error('Glasses layout rejected');
        displayedLayout = wanted; sent.clear(); continue;
      }
      if (wanted === 'x') {
        const revision = xRevision;
        if (sent.get('x') === revision) break;
        const message = xLoading ? 'Loading timeline…' : xFailed ? xError : 'No posts yet.';
        const frame = createXFrame(xPosts, xIndex, xPage, message, xOffset);
        xPages = frame.pages;
        xPage = Math.min(xPage, xPages - 1);
        await sendXFrame(frame.canvas, data => bridgeWrite(() => host.updateImageRawData(new ImageRawDataUpdate(data))), () => xView && revision === xRevision);
        sent.set('x', revision);
        continue;
      }
      if (wanted === 'news') {
        const revision = newsRevision;
        if (sent.get('news') === revision) break;
        const frame = createNewsFrame(news.current(), newsIndex, newsPage, resolveLocale(navigator.language));
        newsPages = Math.max(1, frame.pages);
        newsPage = Math.min(newsPage, newsPages - 1);
        await sendNewsFrame(frame.canvas, data => bridgeWrite(() => host.updateImageRawData(new ImageRawDataUpdate(data))), () => newsView && revision === newsRevision);
        sent.set('news', revision); continue;
      }
      const signature = (item: { content: string; textColor?: number }) => JSON.stringify([item.content, item.textColor ?? null]);
      const update = currentState().find(item => sent.get(item.containerID) !== signature(item));
      if (!update) break;
      if (!await bridgeWrite(() => host.textContainerUpgrade(new TextContainerUpgrade(update)))) throw new Error('Text update rejected');
      sent.set(update.containerID, signature(update));
    }
  } catch (error) {
    console.error('Glasses update failed', error);
    clearTimeout(retry);
    retry = setTimeout(() => { void flush(); }, 1000);
  } finally { pending = false; }
}
function scrollOnPhone(delta: number) {
  resetMomentum();
  glassesScroll.reset();
  if (home) { moveHome(delta); return; }
  if (xView) { moveX(delta); return; }
  if (newsView) { moveNews(delta); return; }
  if (codexView && terminalMode === 'menu') { phoneMenu = true; terminal.move(delta); return; }
  first = scrollPosition(lines, first, delta, lineCount());
  void flush();
}
document.addEventListener('visibilitychange', () => { glassesScroll.reset(); resetMomentum(); });
function syncNoteCursor(reveal = true) {
  if (codexView || xView || newsView || input.value !== writerText) { void flush(); return; }
  const position = input.selectionDirection === 'backward' ? input.selectionStart : input.selectionEnd;
  const changed = position !== noteCursor;
  noteCursor = position;
  noteCursorVisible = true;
  if (reveal && changed) {
    resetMomentum();
    const row = editorCursor(writerText, noteCursor).row;
    if (row < first) first = row;
    else if (row >= first + lineCount()) first = row - lineCount() + 1;
    first = scrollPosition(lines, first, 0, lineCount());
  }
  void flush();
}
let cursorFrame: number | null = null;
function scheduleNoteCursor() {
  if (cursorFrame) return;
  cursorFrame = requestAnimationFrame(() => { cursorFrame = null; if (!codexView) syncNoteCursor(); });
}
document.addEventListener('selectionchange', () => { if (!codexView && document.activeElement === input) scheduleNoteCursor(); });
setInterval(() => {
  if (!ready || codexView || xView || newsView || !glassesActive || document.hidden || document.activeElement !== input || input.readOnly || input.value !== writerText) return;
  const row = editorCursor(writerText, noteCursor).row;
  if (row < first || row >= first + lineCount()) return;
  noteCursorVisible = !noteCursorVisible;
  void flush();
}, 600);
// Native IME commits can arrive after blur. Each editor keeps its document identity.
let compositionPending: ReturnType<typeof watchWriterInput> = () => false;
let terminalCompositionPending = () => false;
let terminalLateEditor: HTMLTextAreaElement | null = null;
let noteInput: HTMLTextAreaElement | null = null;
let noteFileId: string | null = null;
let returningHome = false;
const editors = new Map();
function selectDocument(file: DocumentFile) {
  if (newsView) { newsView = false; news.close(); }
  if (xView) { xView = false; ++xGeneration; xLoading = false; }
  if (codexView) { codexView = false; terminalMode = ''; document.documentElement.classList.remove('session-menu-active', 'terminal-touch-active'); }
  glassesScroll.reset();
  resetMomentum();
  const next = input.cloneNode(false);
  if (!(next instanceof HTMLTextAreaElement)) throw new Error('Could not clone editor');
  next.value = file.text;
  input.replaceWith(next);
  input = next;
  noteInput = next;
  noteFileId = file.id;
  const session = {};
  editors.set(file.id, session);
  next.readOnly = home || !documents.canEdit();
  next.setSelectionRange(file.text.length, file.text.length);
  for (const event of ['select', 'keyup', 'input', 'compositionend', 'focus', 'blur']) {
    next.addEventListener(event, () => { if (input === next && !codexView) scheduleNoteCursor(); });
  }
  compositionPending = watchWriterInput(next, value => {
    if (editors.get(file.id) !== session) return;
    documents.save(file.id, value);
    if (input !== next) return;
    glassesScroll.reset();
    const atEnd = first >= viewport(lines, first).max;
    writerText = value;
    if (codexView) return;
    resetMomentum();
    lines = editorCursor(value, noteCursor).lines;
    if (next.value === value) {
      noteCursor = next.selectionDirection === 'backward' ? next.selectionStart : next.selectionEnd;
      const row = editorCursor(value, noteCursor).row;
      if (row < first) first = row;
      else if (row >= first + lineCount()) first = row - lineCount() + 1;
      first = scrollPosition(lines, first, 0);
    } else first = atEnd ? viewport(lines, 0).max : scrollPosition(lines, first, 0);
    noteCursorVisible = true;
    void flush();
  }, (action, count) => {
    if (input === next) edit(action, count, claimKeyHold(action));
  });
  writerText = next.value;
  noteCursor = next.selectionEnd;
  noteCursorVisible = true;
  lines = editorCursor(writerText, noteCursor).lines;
  first = viewport(lines, 0).max;
  notePosition = first;
  resetPaper(writerText.split('\n').map(line => graphemes(line).length));
  void flush();
}
function restoreDocument(file: DocumentFile) {
  if (!noteInput || noteFileId !== file.id || (!compositionPending() && noteInput.value !== file.text)) {
    selectDocument(file); return;
  }
  input.replaceWith(noteInput); input = noteInput;
  input.readOnly = home || !documents.canEdit();
  writerText = file.text;
  noteCursor = Math.min(input.selectionEnd, writerText.length);
  lines = editorCursor(writerText, noteCursor).lines;
  first = scrollPosition(lines, first, 0);
  void flush();
}
const documents = mountDocuments({
  writer: () => input, onSelect: selectDocument, onNameChange: () => { if (!codexView && !xView) void flush(); }, onRecovery: file => { if (!codexView && !xView) selectDocument(file); }, onStorageReady: () => { if (!codexView && !xView) input.readOnly = home || !documents.canEdit(); }, compositionPending: () => compositionPending(), fixture,
  expectBridge: !fixture && hasEvenHost(),
});
const codexDialog = required<HTMLDialogElement>('#codex-dialog');
const xDialog = required<HTMLDialogElement>('#x-dialog');
const guideDialog = required<HTMLDialogElement>('#connection-guide');
for (const button of document.querySelectorAll<HTMLButtonElement>('.open-connection-guide')) {
  button.addEventListener('click', () => {
    const terminal = button.dataset.guide === 'terminal';
    required<HTMLElement>('#guide-title').textContent = terminal ? 'Even Terminal setup' : 'X (Twitter) setup';
    required<HTMLElement>('#guide-terminal').hidden = !terminal;
    required<HTMLElement>('#guide-x').hidden = terminal;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    guideDialog.scrollTop = 0;
    if (!guideDialog.open) guideDialog.showModal();
  });
}
required<HTMLButtonElement>('#guide-close').addEventListener('click', () => guideDialog.close());
const visualViewport = window.visualViewport;
function fitXDialog() {
  if (!xDialog.open || !visualViewport) return;
  const height = visualViewport.height;
  const inset = Math.max(0, window.innerHeight - visualViewport.offsetTop - height);
  xDialog.style.setProperty('--x-visible-height', `${Math.max(100, height - 12)}px`);
  xDialog.style.setProperty('--x-keyboard-inset', `${inset}px`);
  const focused = document.activeElement;
  if (focused && xDialog.contains(focused) && focused.matches('input')) {
    requestAnimationFrame(() => {
      if (!xDialog.open || document.activeElement !== focused) return;
      const field = focused.getBoundingClientRect(), box = xDialog.getBoundingClientRect();
      if (field.bottom > box.bottom - 16) xDialog.scrollBy({ top: field.bottom - box.bottom + 16 });
      else if (field.top < box.top + 16) xDialog.scrollBy({ top: field.top - box.top - 16 });
    });
  }
}
visualViewport?.addEventListener('resize', fitXDialog);
visualViewport?.addEventListener('scroll', fitXDialog);
xDialog.addEventListener('focusin', fitXDialog);
const xStatusElement = required<HTMLElement>('#x-status');
const codexStatus = required<HTMLElement>('#codex-status');
let choosingSession = false;
let cancelPhoneTap: (() => void) & { isPending?: () => boolean } = () => {};
async function chooseSession({ requireRendered = true } = {}) {
  if (choosingSession) return;
  choosingSession = true;
  try {
    const selected = sessionMenu?.selected, selectedMenuId = sessionMenu?.menuId;
    if (requireRendered && (!ready || rebuilding || displayedLayout !== menuLayout())) return;
    if (terminalMode !== 'menu' || selectedMenuId !== sessionMenu?.menuId || selected !== sessionMenu?.selected) return;
    await terminal.choose();
    if (codexView && ['chat', 'permission'].includes(terminalMode)) { mountTerminalInput(terminal.currentDraft()); input.focus({ preventScroll: true }); }
  } catch { terminal.reportMenuError('Could not open session. Try again.'); }
  finally { choosingSession = false; }
}
const computerForm = required<HTMLElement>('#computer-form');
const computerList = required<HTMLElement>('#computer-list');
const terminalSetupGuide = required<HTMLButtonElement>('.open-connection-guide[data-guide="terminal"]');
function showTerminalPublicNotice() {
  configurePublicTerminalDialog({ computerList, addComputer: required<HTMLButtonElement>('#computer-add'), computerForm, setupGuide: terminalSetupGuide, status: codexStatus }, document);
}
if (!terminalEnabled) {
  showTerminalPublicNotice();
}
const allowedOrigins = permissions.find(p => p.name === 'network')?.whitelist || [];
let xStorageQueue = Promise.resolve();
let xSettingsVersion = 0;
async function readXCredentials() {
  if (fixtureX) return fixtureX;
  await xStorageQueue;
  let raw;
  if (bridge) raw = await bridge.getLocalStorage('even-notepad-x-v1');
  else if (fixture) raw = localStorage.getItem('even-notepad-x-v1') || '';
  else throw Error('App storage is not ready.');
  if (!raw) return null;
  const checked = validateXCredentials(JSON.parse(raw));
  if (!checked.ok) throw Error('Saved X connection is invalid.');
  return checked.value;
}
function saveXCredentials(value: XCredentials | null, expectedVersion?: number, replace = false) {
  const operation = xStorageQueue.then(async () => {
    if (expectedVersion !== undefined && expectedVersion !== xSettingsVersion) throw Error('X connection changed.');
    const raw = value ? JSON.stringify(value) : '';
    if (bridge) { if (!await bridge.setLocalStorage('even-notepad-x-v1', raw)) throw Error('Could not save X connection.'); }
    else if (fixture) localStorage.setItem('even-notepad-x-v1', raw);
    else throw Error('App storage is not ready.');
    if (replace) ++xSettingsVersion;
    xCredentials = value;
  });
  xStorageQueue = operation.catch(() => {});
  return operation;
}
function renderX() {
  ++xRevision;
  void flush();
}
function moveNews(direction: number) {
  const items = news.current().value || [];
  if (!items.length) return;
  const page = newsPage + direction;
  if (page >= 0 && page < newsPages) newsPage = page;
  else {
    const next = Math.max(0, Math.min(items.length - 1, newsIndex + direction));
    if (next === newsIndex) return;
    newsIndex = next; newsPage = direction < 0 ? Number.MAX_SAFE_INTEGER : 0;
  }
  newsRevision++; void flush();
}
function trimXMemory() {
  const trimmed = trimXPosts(xPosts, xIndex);
  xPosts = trimmed.posts; xIndex = trimmed.selected; xOffset += trimmed.removed;
}
function moveX(direction: number) {
  if (!xPosts.length) return;
  const page = xPage + direction;
  if (page >= 0 && page < xPages) { xPage = page; renderX(); return; }
  const index = Math.max(0, Math.min(xPosts.length - 1, xIndex + direction));
  if (index !== xIndex) {
    xIndex = index;
    trimXMemory();
    xPage = direction < 0 ? Number.MAX_SAFE_INTEGER : 0;
    renderX();
  }
  if (direction > 0) maybeLoadX();
}
async function loadXPage(reset = false) {
  if (!xView || xLoading || !xCredentials) return;
  const generation = xGeneration, settings = xSettingsVersion;
  if (!xClient || xClientVersion !== settings) { xClient = createXClient({ save: value => saveXCredentials(value, settings) }); xClientVersion = settings; }
  const page = reset ? undefined : xNext;
  xLoading = true; xFailed = false; xStatus = 'X · Loading…';
  if (reset) { xPosts = []; xNext = null; xIndex = 0; xOffset = 0; xPage = 0; xPages = 1; first = 0; }
  renderX();
  try {
    const result = await xClient.timeline(xCredentials, page);
    if (!xView || generation !== xGeneration || settings !== xSettingsVersion) return;
    const seen = new Set(xPosts.map(post => post.id));
    for (const post of result.posts) if (!seen.has(post.id)) { seen.add(post.id); xPosts.push(post); }
    trimXMemory();
    xNext = result.next && result.next !== page ? result.next : null;
    xStatus = xNext ? 'X · Scroll for more' : `X · ${xPosts.length} posts`;
  } catch (error) {
    if (!xView || generation !== xGeneration || settings !== xSettingsVersion) return;
    xFailed = true; xError = error instanceof Error ? error.message : 'X request failed.'; xStatus = 'X · Tap to retry';
  } finally {
    if (xView && generation === xGeneration) { xLoading = false; renderX(); }
  }
}
function maybeLoadX() {
  if (xView && xNext && !xLoading && !xFailed && xIndex >= xPosts.length - 2) void loadXPage();
}
async function openXSettings() {
  if (!xDialog.open) xDialog.showModal();
  fitXDialog();
  try { xCredentials = await readXCredentials(); xStatusElement.textContent = xCredentials ? 'Connection saved. Enter new values to replace it.' : 'No X connection saved.'; }
  catch { xStatusElement.textContent = 'Could not read X connection.'; }
}
const computers = createComputers({
  async read() {
    if (fixtureComputers) return fixtureComputers;
    if (bridge) return await bridge.getLocalStorage('terminal-computers-v1');
    if (fixture) return localStorage.getItem('terminal-computers-v1') || '';
    throw Error('App storage is not ready.');
  },
  async write(value) {
    if (bridge) { if (!await bridge.setLocalStorage('terminal-computers-v1', value)) throw Error('Could not save computers.'); return; }
    if (fixture) { localStorage.setItem('terminal-computers-v1', value); return; }
    throw Error('App storage is not ready.');
  },
});
let computerGeneration = 0;
let computerBusy = false;
async function renderComputers() {
  const generation = ++computerGeneration;
  computerList.replaceChildren();
  for (const entry of computers.list()) {
    const row = document.createElement('div'); row.className = 'computer-row';
    const info = document.createElement('div'); info.className = 'computer-info';
    const name = document.createElement('strong'); name.textContent = entry.name;
    const address = document.createElement('small'); address.textContent = entry.url;
    const status = document.createElement('small'); status.textContent = 'Checking connection…';
    info.append(name, address, status);
    const connectButton = document.createElement('button'); connectButton.type = 'button'; connectButton.textContent = 'Connect'; connectButton.setAttribute('aria-label', 'Connect to ' + entry.name);
    connectButton.onclick = () => connectComputer(entry, connectButton);
    const removeButton = document.createElement('button'); removeButton.type = 'button'; removeButton.textContent = 'Delete'; removeButton.setAttribute('aria-label', 'Delete ' + entry.name);
    removeButton.onclick = async () => {
      if (!window.confirm('Delete ' + entry.name + ' and its saved connection token?')) return;
      try { await computers.remove(entry.url); await renderComputers(); codexStatus.textContent = 'Computer removed.'; }
      catch { codexStatus.textContent = 'Could not remove computer.'; }
    };
    row.append(info, connectButton, removeButton); computerList.append(row);
    if (!allowedOrigins.includes(entry.url)) { status.textContent = 'Address not permitted by app'; connectButton.disabled = true; continue; }
    void (async () => {
      try {
        const response = await fetch(entry.url + '/api/sessions?provider=codex&limit=1', { headers: { Authorization: 'Bearer ' + entry.token }, signal: AbortSignal.timeout(15000) });
        if (generation !== computerGeneration) return;
        if (!response.ok) { status.textContent = response.status === 401 || response.status === 403 ? 'Check connection token' : 'Invalid server response'; return; }
        const result = await response.json();
        if (generation === computerGeneration) status.textContent = !result.error && Array.isArray(result.sessions) ? 'Available' : 'Invalid server response';
      } catch { if (generation === computerGeneration) status.textContent = 'Unable to verify connection'; }
    })();
  }
  if (!computerList.children.length) computerList.textContent = 'No saved computers.';
}
async function connectComputer(entry: ComputerEntry, button?: HTMLButtonElement, { fromPicker = false } = {}) {
  if (!terminalEnabled) {
    showTerminalPublicNotice();
    return;
  }
  if (computerBusy) return;
  const fromHome = home;
  computerBusy = true;
  if (button) button.disabled = true;
  try {
    codexStatus.textContent = 'Connecting…';
    if (!await terminal.connect(entry.url, entry.token)) return;
    if (xView) { xView = false; ++xGeneration; xLoading = false; }
    computerPicker = null;
    home = false;
    codexView = true; glassesScroll.reset(); terminal.menu();
    codexDialog.close(); mountTerminalInput(); input.focus({ preventScroll: true }); void flush();
  } catch (error) {
    codexView = false; home = fromHome; homeStatus = 'Connection failed. Check phone.';
    if (fromPicker && computerPicker) computerPicker.status = 'Connection failed. Try another computer.';
    lines = editorCursor(writerText, noteCursor).lines; first = viewport(lines, 0).max; void flush(); codexStatus.textContent = error instanceof Error ? error.message : 'Connection failed.';
    if (fromHome && !fromPicker && !codexDialog.open) { codexDialog.showModal(); void renderComputers(); }
  }
  finally { computerBusy = false; if (button) button.disabled = false; }
}
const replyStorageKey = fixture ? 'terminal-reply-helpers-fixture-v1' : 'terminal-reply-helpers-v1';
const terminal = createTerminalController({
  replyStorage: terminalEnabled ? {
    async read() {
      let cached: string | null = null;
      try { cached = localStorage.getItem(replyStorageKey); } catch { /* Try host storage. */ }
      if (cached !== null) return cached;
      if (bridge) return await bridge.getLocalStorage(replyStorageKey);
      if (fixture) return '';
      throw Error('App storage is not ready.');
    },
    async write(value) {
      let saved = false;
      try { localStorage.setItem(replyStorageKey, value); saved = true; } catch { /* Try host storage. */ }
      try { if (bridge && await bridge.setLocalStorage(replyStorageKey, value)) return; } catch { /* Keep the saved device copy. */ }
      if (!saved) throw Error('Could not save reply helpers.');
    },
  } : undefined,
  render(view) {
    const hadReplies = !!replyMenu;
    replyMenu = view.replies;
    if (hadReplies !== !!replyMenu) { resetMomentum(); cancelPhoneTap(); }
    const { mode, text, draft, status } = view;
    const messages = mode === 'menu' ? undefined : view.messages;
    const items = mode === 'menu' ? view.items : undefined;
    const selected = mode === 'menu' ? view.selected : undefined;
    const start = mode === 'menu' ? view.start : undefined;
    const menuId = mode === 'menu' ? view.menuId : undefined;
    const previousMode = terminalMode;
    if (previousMode !== mode || (mode === 'menu' && (sessionMenu?.menuId !== menuId || sessionMenu?.selected !== selected))) cancelPhoneTap();
    terminalMode = mode; codexDraft = draft; terminalStatus = status || '';
    if (previousMode !== mode) { resetMomentum(); if (mode === 'menu') phoneMenu = true; }
    document.documentElement.classList.toggle('session-menu-active', codexView && mode === 'menu');
    document.documentElement.classList.toggle('terminal-touch-active', codexView && (mode === 'chat' || mode === 'permission'));
    if (!codexView) return;
    if (mode === 'menu') {
      sessionMenu = { items: view.items, selected: view.selected, start: view.start, menuId: view.menuId };
    }
    const wasAtEnd = first >= viewport(lines, 0, 6).max;
    styledLines = mode === 'chat' ? terminalLines(messages || []) : [];
    lines = mode === 'chat' ? styledLines.map(line => line.text) : makeTerminalLines(text);
    first = mode === 'menu' || (mode === 'permission' && previousMode !== 'permission') ? 0 : (previousMode !== mode || wasAtEnd) ? viewport(lines, 0, lineCount()).max : scrollPosition(lines, first, 0, lineCount());
    void flush();
  },
  clearDraft(value) { if (codexView && input.value === value) input.value = ''; },
  exit() {
    codexView = false; terminalMode = ''; replyMenu = undefined;
    document.documentElement.classList.remove('session-menu-active', 'terminal-touch-active');
    resetMomentum(); glassesScroll.reset(); cancelPhoneTap();
    home = true; homeSelected = 1; homeStatus = '';
    showComputerPicker(savedComputerChoices());
    restoreDocument(documents.current());
  },
});
function mountTerminalInput(value = '') {
  const next = input.cloneNode(false);
  if (!(next instanceof HTMLTextAreaElement)) throw new Error('Could not clone editor');
  next.readOnly = false;
  next.value = value; input.replaceWith(next); input = next;
  const submit = () => {
    if (terminalMode !== 'chat' || !codexDraft.trim() || !terminal.canSend()) return;
    resetMomentum(); first = viewport(lines, 0, lineCount()).max; void flush();
    void terminal.send();
  };
  const enterMenu = () => { void chooseSession(); };
  next.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.repeat && !event.isComposing && (terminalMode === 'menu' || terminalMode === 'chat')) { event.preventDefault(); return; }
    if (terminalMode === 'menu' && !event.isComposing && ['ArrowUp', 'ArrowDown', 'Enter'].includes(event.key)) { event.preventDefault(); if (event.key === 'Enter') enterMenu(); else { phoneMenu = true; terminal.move(event.key === 'ArrowUp' ? -1 : 1); } return; }
    if (terminalMode === 'chat' && event.key === 'Enter' && !event.isComposing && !event.shiftKey) { event.preventDefault(); submit(); }
  });
  next.addEventListener('beforeinput', event => {
    if (terminalMode === 'menu' && (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') && !event.isComposing) { event.preventDefault(); enterMenu(); return; }
    if (terminalMode === 'chat' && (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') && !event.isComposing) { event.preventDefault(); submit(); }
  });
  const saveDraft = terminalMode === 'menu' ? () => {} : terminal.captureDraft();
  const writerPending = watchWriterInput(next, (value, compositionRelated) => {
    if ((codexView && terminalMode === 'chat' && input === next) || (terminalLateEditor === next && compositionRelated)) saveDraft(value);
  }, (action, count) => { if (input === next && codexView) edit(action, count, claimKeyHold(action)); });
  terminalCompositionPending = () => writerPending(true);
}
codexDialog.addEventListener('close', () => { computerForm.hidden = true; required<HTMLInputElement>('#codex-token').value = ''; if (!codexView && !home) input.focus({ preventScroll: true }); });
codexDialog.addEventListener('cancel', event => { if (computerBusy) event.preventDefault(); });
required<HTMLButtonElement>('#open-codex').onclick = async () => {
  required<HTMLDialogElement>('#documents').close();
  input.blur();
  codexDialog.showModal();
  if (!terminalEnabled) {
    showTerminalPublicNotice();
    return;
  }
  try { await computers.load(); await renderComputers(); }
  catch (error) { codexStatus.textContent = error instanceof Error ? error.message : 'Connection failed.'; }
};
function savedComputerChoices() {
  return computers.list().map(entry => ({ ...entry, allowed: allowedOrigins.includes(entry.url) }));
}
function showComputerPicker(entries: ComputerPicker['entries']) {
  computerPicker = { id: ++nextPickerId, entries, selected: 0, status: '' };
  homeStatus = ''; void flush();
}
function closeComputerPicker() {
  if (!computerPicker || homeBusy) return;
  computerPicker = null; homeStatus = ''; void flush();
}
function moveHome(delta: number) {
  if (!home || homeBusy) return;
  if (computerPicker) {
    const next = Math.max(0, Math.min(computerPicker.entries.length, computerPicker.selected + Math.sign(delta)));
    if (next !== computerPicker.selected) { computerPicker.selected = next; computerPicker.status = ''; void flush(); }
    return;
  }
  const selected = Math.max(0, Math.min(3, homeSelected + Math.sign(delta)));
  if (selected !== homeSelected) { homeSelected = selected; homeStatus = ''; void flush(); }
}
async function chooseHome() {
  if (!home || homeBusy || rebuilding || !ready || displayedLayout !== homeLayout()) return;
  if (computerPicker) {
    if (computerPicker.selected === computerPicker.entries.length) { closeComputerPicker(); return; }
    if (!allowedOrigins.includes(computerPicker.entries[computerPicker.selected].url)) {
      computerPicker.status = 'Address not permitted. Check phone.'; void flush(); return;
    }
    homeBusy = true; computerPicker.status = 'Connecting…'; void flush();
    try { await connectComputer(computerPicker.entries[computerPicker.selected], undefined, { fromPicker: true }); }
    finally { homeBusy = false; }
    return;
  }
  if (homeSelected === 0) {
    home = false; homeStatus = '';
    if (input !== noteInput) selectDocument(documents.current());
    lines = editorCursor(writerText, noteCursor).lines; first = scrollPosition(lines, notePosition, 0, lineCount());
    input.readOnly = !documents.canEdit(); input.focus({ preventScroll: true }); void flush(); return;
  }
  if (homeSelected === 1 && !terminalEnabled) {
    homeStatus = 'Terminal is not supported in the public build. See the personal build guide: github.com/hmmhmmhm/quiet-terminal';
    void flush(); return;
  }
  if (homeSelected === 2) {
    homeBusy = true; homeStatus = 'Loading X settings…'; void flush();
    try {
      xCredentials = await readXCredentials();
      if (!xCredentials) { homeStatus = 'Set up X on phone.'; void flush(); await openXSettings(); return; }
      home = false; xView = true; input.blur(); input.readOnly = true;
      ++xGeneration; xLoading = false; xFailed = false; xPosts = []; xNext = null; first = 0;
      xStatus = 'X · Loading…'; renderX(); void loadXPage(true);
    } catch { homeStatus = 'Check X settings on phone.'; void flush(); await openXSettings(); }
    finally { homeBusy = false; }
    return;
  }
  if (homeSelected === 3) {
    home = false; newsView = true; newsIndex = 0; newsPage = 0; newsPages = 1;
    input.blur(); input.readOnly = true; newsRevision++; void flush();
    void news.refresh(); return;
  }
  homeBusy = true;
  homeStatus = 'Connecting…'; void flush();
  try {
    await computers.load();
    const entries = savedComputerChoices();
    if (entries.length === 1 && entries[0].allowed) await connectComputer(entries[0]);
    else if (entries.length > 1) showComputerPicker(entries);
    else {
      homeStatus = 'Choose a computer on phone.'; void flush();
      codexDialog.showModal(); await renderComputers();
    }
  } catch {
    homeStatus = 'Check connection on phone.'; void flush();
    if (!codexDialog.open) codexDialog.showModal();
    codexStatus.textContent = 'Could not load saved computers.';
  } finally { homeBusy = false; }
}
required<HTMLButtonElement>('#codex-close').onclick = () => { if (!computerBusy) codexDialog.close(); };
required<HTMLButtonElement>('#computer-add').onclick = () => { computerForm.hidden = false; required<HTMLInputElement>('#computer-name').focus(); };
required<HTMLButtonElement>('#computer-cancel').onclick = () => { computerForm.hidden = true; required<HTMLInputElement>('#codex-token').value = ''; };
required<HTMLButtonElement>('#codex-connect').onclick = async () => {
  if (computerBusy) return;
  computerBusy = true;
  const button = required<HTMLButtonElement>('#codex-connect'); button.disabled = true;
  try {
    const entry = { name: required<HTMLInputElement>('#computer-name').value, url: required<HTMLInputElement>('#codex-url').value, token: required<HTMLInputElement>('#codex-token').value };
    let origin; try { origin = new URL(entry.url.trim()).origin; } catch { throw Error('Enter a valid server address.'); }
    await computers.save(entry);
    required<HTMLInputElement>('#codex-token').value = ''; computerForm.hidden = true;
    await renderComputers();
    if (!allowedOrigins.includes(origin)) { codexStatus.textContent = 'Saved. Add this address to the app network allowlist to connect.'; return; }
    computerBusy = false;
    await connectComputer({ ...entry, url: origin }, button);
  } catch (error) { codexStatus.textContent = error instanceof Error ? error.message : 'Connection failed.'; }
  finally { computerBusy = false; button.disabled = false; }
};
required<HTMLButtonElement>('#open-x').onclick = async () => {
  required<HTMLDialogElement>('#documents').close(); input.blur(); await openXSettings();
};
required<HTMLButtonElement>('#x-close').onclick = () => xDialog.close();
function resetXAfterSettings(message: string) {
  if (xView) { xView = false; ++xGeneration; xLoading = false; xPosts = []; xNext = null; home = true; homeSelected = 2; }
  if (home) { homeStatus = message; void flush(); }
}
xDialog.addEventListener('close', () => {
  for (const id of ['x-access-token', 'x-client-id', 'x-refresh-token']) required<HTMLInputElement>('#' + id).value = '';
  if (!home && !codexView && !xView) input.focus({ preventScroll: true });
});
required<HTMLFormElement>('#x-form').addEventListener('submit', async event => {
  event.preventDefault();
  const checked = validateXCredentials({ accessToken: required<HTMLInputElement>('#x-access-token').value, clientId: required<HTMLInputElement>('#x-client-id').value, refreshToken: required<HTMLInputElement>('#x-refresh-token').value });
  if (!checked.ok) { xStatusElement.textContent = 'Enter a user access token. For renewal, provide both Client ID and refresh token.'; return; }
  try {
    await saveXCredentials(checked.value, undefined, true);
    xStatusElement.textContent = 'X connection saved.';
    for (const id of ['x-access-token', 'x-client-id', 'x-refresh-token']) required<HTMLInputElement>('#' + id).value = '';
    resetXAfterSettings('X connection saved. Select X to open.');
  } catch { xStatusElement.textContent = 'Could not save X connection.'; }
});
required<HTMLButtonElement>('#x-remove').onclick = async () => {
  try { await saveXCredentials(null, undefined, true); xStatusElement.textContent = 'X connection removed.'; resetXAfterSettings('Set up X on phone.'); }
  catch { xStatusElement.textContent = 'Could not remove X connection.'; }
};
selectDocument(documents.current());
function workspaceDialogOpen() {
  return codexDialog.open || xDialog.open || required<HTMLDialogElement>('#documents').open;
}
function goBack() {
  if (workspaceDialogOpen() || returningHome) return;
  if (home) { closeComputerPicker(); return; }
  if (codexView && (replyMenu || terminalMode === 'menu')) { terminal.back(); return; }
  returningHome = true;
  const editor = input;
  const fromTerminal = codexView;
  const fromX = xView;
  const fromNews = newsView;
  const pendingInput = fromTerminal ? terminalCompositionPending : (fromX || fromNews) ? () => false : () => compositionPending();
  if (fromTerminal && pendingInput()) {
    terminalLateEditor = editor;
    setTimeout(() => { if (terminalLateEditor === editor) terminalLateEditor = null; }, 1500);
  }
  backAfterInput(editor, pendingInput, () => {
    if (input !== editor || home) { returningHome = false; return; }
    resetMomentum(); glassesScroll.reset(); cancelPhoneTap();
    if (fromTerminal) {
      const wasFocused = document.activeElement === editor;
      terminal.back();
      if (terminalMode === 'menu') {
        mountTerminalInput();
        if (wasFocused) input.focus({ preventScroll: true });
      }
      returningHome = false;
      return;
    }
    homeSelected = fromX ? 2 : fromNews ? 3 : 0;
    if (!fromX && !fromNews) notePosition = first;
    homeStatus = ''; home = true;
    if (fromX) { xView = false; ++xGeneration; xLoading = false; xPosts = []; xNext = null; clearXImages(); input.readOnly = true; void flush(); }
    else if (fromNews) { newsView = false; news.close(); input.readOnly = true; void flush(); }
    else { input.blur(); input.readOnly = true; void flush(); }
    returningHome = false;
  });
}
cancelPhoneTap = watchPhoneMenuTouch(window, {
  active: event => (home || !codexView || ['menu', 'chat', 'permission'].includes(terminalMode)) && !codexDialog.open && !xDialog.open && !required<HTMLDialogElement>('#documents').open && (!event || isWorkspaceTarget(event.target instanceof Node ? event.target : null, input)),
  context: () => home ? 'menu' : codexView ? terminalMode : 'chat',
  scope: () => home ? (computerPicker ? `computers:${computerPicker.id}` : 'home') : xView ? 'x' : newsView ? 'news' : codexView ? `terminal:${terminalMode}` : 'editor',
  trace: line => reportEdit.trace('touch ' + line),
  identity: () => home ? (computerPicker ? `computers:${computerPicker.id}:${computerPicker.selected}` : `home:${homeSelected}`) : xView ? 'x' : newsView ? 'news' : !codexView ? 'editor' : terminalMode === 'menu' ? `menu:${sessionMenu?.menuId}:${sessionMenu?.selected}` : terminalMode,
  move: delta => scrollOnPhone(delta),
  choose: () => { if (home) void chooseHome(); else void chooseSession(); },
  onTap: event => { if (event.target !== input && !home && !xView && !newsView) input.focus({ preventScroll: true }); },
  back: goBack,
});
window.addEventListener('wheel', event => {
  if (!codexDialog.open && !xDialog.open && !required<HTMLDialogElement>('#documents').open && isWorkspaceTarget(event.target instanceof Node ? event.target : null, input) && Math.abs(event.deltaY) > 0) {
    event.preventDefault(); scrollOnPhone(event.deltaY > 0 ? -1 : 1);
  }
}, { passive: false });
let connecting = false;
async function connect() {
  if (connecting || !hasEvenHost()) return;
  connecting = true;
  try {
    bridge = await waitForEvenAppBridge();
    const documentRecovery = documents.connect(bridge).catch(error => console.error('Document recovery failed', error));
    bridge.onEvenHubEvent(event => {
      const type = event.textEvent?.eventType ?? event.listEvent?.eventType ?? event.sysEvent?.eventType;
      reportEdit.trace('glasses event ' + (type ?? '?') + ' ' + terminalMode);
      if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT || type === OsEventTypeList.ABNORMAL_EXIT_EVENT || type === OsEventTypeList.SYSTEM_EXIT_EVENT) { glassesActive = false; glassesScroll.reset(); resetMomentum(); return; }
      if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) { glassesActive = true; glassesScroll.reset(); resetMomentum(); return; }
      const sourceName = event.textEvent?.containerName || event.listEvent?.containerName;
      if (home) {
        const captureName = computerPicker ? 'pm-c' + computerPicker.id : 'pm-home';
        if (!ready || rebuilding || homeBusy || codexDialog.open || xDialog.open || required<HTMLDialogElement>('#documents').open || displayedLayout !== homeLayout() || (sourceName && sourceName !== captureName)) return;
        if (type === OsEventTypeList.SCROLL_TOP_EVENT) moveHome(-1);
        else if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) moveHome(1);
        else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
          if (computerPicker) goBack();
          else void bridge?.shutDownPageContainer(1).catch(error => console.error('Could not open glasses exit confirmation', error));
        }
        else if ((type === undefined || type === OsEventTypeList.CLICK_EVENT) && !cancelPhoneTap.isPending?.()) void chooseHome();
        return;
      }
      if (codexView && terminalMode === 'menu' && event.listEvent && (phoneMenu || sourceName !== 'session-list-' + sessionMenu?.menuId || displayedLayout !== menuLayout())) return;
      if (codexView && terminalMode === 'menu' && event.textEvent && sourceName && (sourceName !== 'pm-' + sessionMenu?.menuId || !phoneMenu || !displayedLayout.startsWith('phone-menu:'))) return;
      if (codexView && replyMenu) {
        const ownSource = sourceName === 'pm-' + replyMenu.menuId;
        if (!ready || rebuilding || displayedLayout !== replyLayout() || (sourceName && !ownSource) || event.listEvent) return;
        if (ownSource) glassesActive = true;
        if (!glassesActive) return;
        if (type === OsEventTypeList.SCROLL_TOP_EVENT) terminal.moveReplies(-1);
        else if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) terminal.moveReplies(1);
        else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) goBack();
        else if (type === OsEventTypeList.CLICK_EVENT || (type === undefined && (ownSource || event.sysEvent))) void terminal.chooseReply();
        return;
      }
      if (sourceName && codexView && terminalMode === 'chat' && sourceName !== 'terminal-frame') return;
      if (sourceName?.startsWith('pm-r') && codexView) return;
      if (xView && (rebuilding || displayedLayout !== 'x' || xDialog.open || codexDialog.open || required<HTMLDialogElement>('#documents').open || (sourceName && sourceName !== 'x-frame'))) return;
      if (newsView && (rebuilding || displayedLayout !== 'news' || xDialog.open || codexDialog.open || required<HTMLDialogElement>('#documents').open || (sourceName && sourceName !== 'news-frame'))) return;
      if (!glassesActive && sourceName && ((terminalMode === 'menu' && (sourceName === 'session-list-' + sessionMenu?.menuId || sourceName === 'pm-' + sessionMenu?.menuId)) || (terminalMode === 'chat' && sourceName === 'terminal-frame') || (xView && sourceName === 'x-frame') || (newsView && sourceName === 'news-frame') || (!codexView && !xView && !newsView && sourceName === 'terminal-frame'))) glassesActive = true;
      const interactive = ready && glassesActive;
      if (interactive && type === OsEventTypeList.DOUBLE_CLICK_EVENT) {
        const terminalLayout = terminalMode === 'menu' ? menuLayout() : terminalMode === 'chat' ? 'chat' : 'terminal';
        if (!codexView || (!rebuilding && displayedLayout === terminalLayout)) goBack();
        return;
      }
      if (interactive && xView && (type === undefined || type === OsEventTypeList.CLICK_EVENT) && !xLoading) { void loadXPage(xPosts.length === 0 || !xFailed); return; }
      if (interactive && newsView && (type === undefined || type === OsEventTypeList.CLICK_EVENT) && news.current().status !== 'loading') { void news.refresh({ force: true }); return; }
      if (interactive && codexView && type === OsEventTypeList.LONG_PRESS_EVENT) {
        const dialogOpen = codexDialog.open || xDialog.open || required<HTMLDialogElement>('#documents').open;
        const expectedLayout = terminalMode === 'chat' ? 'chat' : terminalMode === 'permission' ? 'terminal' : '';
        if (!rebuilding && !dialogOpen && displayedLayout === expectedLayout && expectedLayout) {
          resetMomentum(); glassesScroll.reset(); void terminal.openReplies();
        }
        return;
      }
      if (interactive && codexView && (terminalMode === 'menu' || terminalMode === 'permission' && (type === undefined || type === OsEventTypeList.CLICK_EVENT))) {
        if (choosingSession) return;
        if (terminalMode === 'menu' && (type === undefined || type === OsEventTypeList.CLICK_EVENT) && cancelPhoneTap.isPending?.()) return;
        if (event.listEvent) {
          const position = event.listEvent.currentSelectItemIndex ?? 0;
          if (terminal.selectMenu(position) && (type === undefined || type === OsEventTypeList.CLICK_EVENT)) void chooseSession();
          return;
        }
        if (type === OsEventTypeList.SCROLL_TOP_EVENT) terminal.move(-1);
        else if (type === OsEventTypeList.SCROLL_BOTTOM_EVENT) terminal.move(1);
        else if ((terminalMode === 'permission' || (phoneMenu && displayedLayout === menuLayout())) && (event.textEvent || event.sysEvent) && (type === undefined || type === OsEventTypeList.CLICK_EVENT)) void chooseSession();
        return;
      }
      switch (type) {
        case OsEventTypeList.SCROLL_TOP_EVENT:
        case OsEventTypeList.SCROLL_BOTTOM_EVENT: {
          if (!ready || !glassesActive) return;
          const direction = type === OsEventTypeList.SCROLL_TOP_EVENT ? -1 : 1;
          scrollGlasses(direction);
          return;
        }
        default:
          glassesScroll.reset();
          resetMomentum();
      }
    });
    const initial = startupLayout(homeSelected, homeStatus, terminalEnabled);
    const result = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(pageContainer({ containerTotalNum: initial.textObject.length + initial.imageObject.length, ...initial })));
    if (result === StartUpPageCreateResult.success) {
      await sendHomeLogoSafely();
      ready = true; void flush();
    } else console.error('Glasses page creation failed', result);
    void documentRecovery;
  } catch (error) { console.error('Glasses connection failed', error); }
}
if (fixture) {
  const sample = new URLSearchParams(location.search).get('fixture');
  input.value = sample === 'pages' ? 'First line\nSecond line\nThird line\nFourth line\nFifth line\nSixth line\nSeventh line\nEighth line'
    : sample === 'empty' ? '' : 'Hello Quiet Terminal\nOnly on your glasses.';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const caret = new URLSearchParams(location.search).get('caret');
  if (caret !== null && Number.isInteger(Number(caret))) input.setSelectionRange(Number(caret), Number(caret));
}
window.addEventListener('flutterInAppWebViewPlatformReady', connect);
void connect();
