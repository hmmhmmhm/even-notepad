type Strike = { number: number; length: number; frame?: { length: number; strike: number } };
type DebugSession = { output: HTMLElement; history: string[]; totals: { strike: number; erase: number; cancel: number }; strikes: Strike[]; lastEventTime?: number };
const inputTypes = new Set([
  'insertText', 'insertCompositionText', 'insertFromComposition', 'insertReplacementText',
  'insertLineBreak', 'insertParagraph', 'insertFromPaste', 'insertFromDrop',
  'deleteCompositionText', 'deleteByComposition', 'deleteContentBackward', 'deleteContentForward',
  'deleteWordBackward', 'deleteWordForward', 'deleteByCut', 'deleteByDrag', 'historyUndo', 'historyRedo',
]);

export function mountTypewriterDebug(input: HTMLElement, version: string, build: string) {
  const print = document.querySelector('.print');
  let active: DebugSession | undefined;

  function domLength() {
    return print?.lastElementChild?.textContent?.length ?? 0;
  }

  function render(session: DebugSession) {
    const { output, totals, strikes, history } = session;
    output.textContent = [
      'v' + version + ' · ' + build,
      'strike ' + totals.strike + ' · erase ' + totals.erase + ' · cancel ' + totals.cancel,
      'DOM last span length ' + domLength(),
      ...strikes.map(({ number, length, frame }) =>
        '#' + number + ' DOM ' + length + (frame ? ' · rAF DOM ' + frame.length + ' @#' + frame.strike : ' · rAF pending')),
      ...history,
    ].join('\n');
  }

  function report(line: string) {
    if (!active) return;
    active.history.push(line);
    if (active.history.length > 10) active.history.shift();
    render(active);
  }

  function toggle() {
    if (active) {
      active.output.remove();
      active = undefined;
      return;
    }
    const output = document.createElement('pre');
    output.className = 'typewriter-debug';
    output.setAttribute('aria-hidden', 'true');
    document.body.append(output);
    active = { output, history: [], totals: { strike: 0, erase: 0, cancel: 0 }, strikes: [] };
    report('Ready');
  }

  if (new URLSearchParams(location.search).has('typewriter-debug')) toggle();
  input.addEventListener('touchstart', event => {
    if (event.touches.length !== 2) return;
    if (!Array.from(event.touches).every(touch => touch.clientX < 144 && touch.clientY < 84)) return;
    if (event.cancelable) event.preventDefault();
    toggle();
  }, { passive: false });

  for (const type of ['keydown', 'beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend']) {
    input.addEventListener(type, event => {
      if (!active) return;
      const inputType = 'inputType' in event && typeof event.inputType === 'string' ? event.inputType : '';
      const elapsed = event.timeStamp - (active.lastEventTime ?? NaN);
      active.lastEventTime = event.timeStamp;
      const interval = Number.isFinite(elapsed) ? '+' + Math.max(0, Math.round(elapsed)) + 'ms' : '';
      report([type, inputTypes.has(inputType) ? inputType : inputType ? 'other' : '',
        'isComposing' in event && event.isComposing ? 'composing' : '', interval].filter(Boolean).join(' '));
    });
  }

  const recordEdit = (action: string, count: number) => {
    const session = active;
    if (!session) return;
    if (action === 'strike' || action === 'erase' || action === 'cancel') session.totals[action]++;
    if (action === 'strike') {
      const strike: Strike = { number: session.totals.strike, length: domLength() };
      session.strikes.push(strike);
      if (session.strikes.length > 3) session.strikes.shift();
      // A frame callback observes the DOM for that frame. Multiple strikes can share it.
      requestAnimationFrame(() => {
        if (active !== session || !session.strikes.includes(strike)) return;
        strike.frame = { length: domLength(), strike: session.totals.strike };
        render(session);
      });
    }
    report(action + ' ×' + count);
  };
  recordEdit.trace = (line: string) => { if (active) report(line); };
  return recordEdit;
}
