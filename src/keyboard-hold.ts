const editWindow = 120;
const releaseWatchdog = 10000;
const printableCode = /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Space|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash|IntlBackslash|IntlRo|IntlYen|Numpad(?:Add|Subtract|Multiply|Divide|Decimal|Equal))$/;

export function watchKeyboardHold(input: HTMLElement, onRelease: (force: boolean) => void) {
  let candidate: { code: string; time: number } | undefined;
  let ready: string | undefined;
  let active: string | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;

  function clearActive() {
    clearTimeout(watchdog);
    active = undefined;
  }

  function forget(force: boolean) {
    candidate = undefined;
    ready = undefined;
    const wasActive = Boolean(active);
    clearActive();
    if (wasActive || force) onRelease(force);
  }

  function guard() {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => forget(true), releaseWatchdog);
  }

  input.addEventListener('keydown', event => {
    candidate = undefined;
    ready = undefined;
    if (!printableCode.test(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key?.length !== 1 || event.keyCode === 229) return;
    candidate = { code: event.code, time: performance.now() };
    if (event.repeat && active === event.code) guard();
  });

  function accept(event: Event) {
    ready = undefined;
    if (event.type !== 'compositionupdate' && (!('inputType' in event) || typeof event.inputType !== 'string' || !['insertText', 'insertCompositionText'].includes(event.inputType))) return;
    if (candidate && performance.now() - candidate.time <= editWindow) ready = candidate.code;
    candidate = undefined;
  }

  input.addEventListener('input', accept, true);
  input.addEventListener('compositionupdate', accept, true);
  window.addEventListener('keyup', event => {
    if (event.code === candidate?.code) candidate = undefined;
    if (event.code === ready) ready = undefined;
    if (active && event.code === active) {
      clearActive();
      onRelease(false);
    }
  }, true);

  input.addEventListener('blur', () => forget(true), true);
  input.addEventListener('compositionend', () => forget(true));
  window.addEventListener('blur', () => forget(true));
  window.addEventListener('pagehide', () => forget(true));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) forget(true);
  });

  // Only an actual typewriter edit can claim the key that accompanied it.
  return (action: string) => {
    const key = action === 'strike' ? ready : undefined;
    ready = undefined;
    clearActive();
    if (!key) return false;
    active = key;
    guard();
    return true;
  };
}
