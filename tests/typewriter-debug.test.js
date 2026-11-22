import assert from 'node:assert/strict';
import test from 'node:test';
import { mountTypewriterDebug } from '../src/typewriter-debug.ts';

function diagnosticFixture(t) {
  const input = new EventTarget();
  Object.defineProperty(input, 'value', { get() { assert.fail('diagnostic read textarea value'); } });
  const lastSpan = { textContent: 'levels, prod' };
  const frames = [];
  let output;
  globalThis.location = { search: '' };
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  globalThis.document = {
    querySelector: selector => {
      assert.equal(selector, '.print');
      return { lastElementChild: lastSpan };
    },
    body: { append: element => { output = element; } },
    createElement: () => ({ setAttribute() {}, remove() { output = undefined; } }),
  };
  t.after(() => {
    delete globalThis.location;
    delete globalThis.document;
    delete globalThis.requestAnimationFrame;
  });

  const reportEdit = mountTypewriterDebug(input, '0.1.12', 'index-demo.js');
  const touchAt = (...touches) => {
    const touch = new Event('touchstart', { cancelable: true });
    touch.touches = touches;
    input.dispatchEvent(touch);
    return touch.defaultPrevented;
  };
  const toggle = () => assert.equal(touchAt({ clientX: 10, clientY: 20 }, { clientX: 80, clientY: 20 }), true);
  return { input, lastSpan, reportEdit, touchAt, toggle,
    display: () => output?.textContent,
    flushFrames: () => frames.splice(0).forEach(callback => callback()),
  };
}

test('the iPhone diagnostic gesture toggles a local trace that never reads input data', t => {
  const { input, reportEdit, touchAt, toggle, display, flushFrames } = diagnosticFixture(t);
  reportEdit('strike', 1);
  assert.equal(touchAt({ clientX: 10, clientY: 20 }), false);
  assert.equal(touchAt({ clientX: 10, clientY: 20 }, { clientX: 150, clientY: 20 }), false);
  assert.equal(display(), undefined);
  toggle();
  const ready = 'v0.1.12 · index-demo.js\nstrike 0 · erase 0 · cancel 0\nDOM last span length 12\nReady';
  assert.equal(display(), ready);

  const event = new Event('input');
  event.inputType = 'insertCompositionText';
  event.isComposing = true;
  Object.defineProperty(event, 'data', { get() { assert.fail('diagnostic read input data'); } });
  Object.defineProperty(event, 'timeStamp', { value: 100 });
  input.dispatchEvent(event);
  reportEdit('strike', 1);
  reportEdit('cancel', 2);
  assert.match(display(), /input insertCompositionText composing\nstrike ×1\ncancel ×2$/);

  const unexpected = new Event('input');
  unexpected.inputType = 'private text';
  Object.defineProperty(unexpected, 'timeStamp', { value: 140 });
  input.dispatchEvent(unexpected);
  const keydown = new Event('keydown');
  Object.defineProperty(keydown, 'key', { get() { assert.fail('diagnostic read key text'); } });
  Object.defineProperty(keydown, 'timeStamp', { value: 152 });
  input.dispatchEvent(keydown);
  assert.match(display(), /input other \+40ms\nkeydown \+12ms$/);
  assert.doesNotMatch(display(), /private text|levels, prod/);
  toggle();
  assert.equal(display(), undefined);
  toggle();
  flushFrames();
  assert.equal(display(), ready);
});

test('pins the latest three strike snapshots when native events scroll through the trace', t => {
  const { input, lastSpan, reportEdit, toggle, display, flushFrames } = diagnosticFixture(t);
  toggle();
  lastSpan.textContent = 'levels, produ';
  reportEdit('strike', 1);
  flushFrames();
  lastSpan.textContent = 'levels, produc';
  reportEdit('strike', 1);
  lastSpan.textContent = 'levels, product';
  reportEdit('strike', 1);
  for (let i = 0; i < 16; i++) input.dispatchEvent(new Event('input'));
  assert.match(display(), /#1 DOM 13 · rAF DOM 13 @#1\n#2 DOM 14 · rAF pending\n#3 DOM 15 · rAF pending/);
  flushFrames();
  assert.match(display(), /strike 3 · erase 0 · cancel 0\nDOM last span length 15/);
  assert.match(display(), /#2 DOM 14 · rAF DOM 15 @#3\n#3 DOM 15 · rAF DOM 15 @#3/);

  lastSpan.textContent = 'levels, produc';
  reportEdit('erase', 1);
  lastSpan.textContent = 'levels, prod';
  reportEdit('cancel', 2);
  assert.match(display(), /strike 3 · erase 1 · cancel 1\nDOM last span length 12/);
  assert.match(display(), /#1 DOM 13/);

  lastSpan.textContent = '';
  reportEdit('strike', 1);
  assert.match(display(), /#4 DOM 0 · rAF pending/);
  assert.doesNotMatch(display(), /#1 DOM/);
});

test('the optional gesture trace is visible only when diagnostics are enabled', t => {
  const {reportEdit,toggle,display}=diagnosticFixture(t);
  reportEdit.trace('touch start chat ok n=1'); assert.equal(display(),undefined);
  toggle(); reportEdit.trace('touch start chat ok n=1');
  assert.match(display(),/touch start chat ok n=1/);
  toggle(); assert.equal(display(),undefined);
});
