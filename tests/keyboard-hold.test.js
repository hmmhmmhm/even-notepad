import assert from 'node:assert/strict';
import test from 'node:test';
import { watchKeyboardHold } from '../src/keyboard-hold.ts';

function keyboard(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const input = new EventTarget();
  const page = new EventTarget();
  const document = Object.assign(new EventTarget(), { hidden: false });
  globalThis.window = page;
  globalThis.document = document;
  t.after(() => {
    delete globalThis.window;
    delete globalThis.document;
  });
  const releases = [];
  const claim = watchKeyboardHold(input, force => releases.push(force));
  function event(target, type, properties = {}) {
    target.dispatchEvent(Object.assign(new Event(type), properties));
  }
  const down = (code, options = {}) => event(input, 'keydown', { code, key: 'a', ...options });
  const up = code => event(page, 'keyup', { code });
  const write = inputType => {
    event(input, 'input', { inputType });
    return claim('strike');
  };
  return { input, page, document, releases, event, down, up, write, claim };
}

test('a matching physical-code text edit remains held until its own key is released', t => {
  const { releases, down, up, write } = keyboard(t);
  down('KeyA');
  assert.equal(write('insertText'), true);
  up('KeyB');
  t.mock.timers.tick(1000);
  assert.deepEqual(releases, []);
  up('KeyA');
  assert.deepEqual(releases, [false]);
  up('KeyA');
  t.mock.timers.runAll();
  assert.deepEqual(releases, [false]);
});

test('an unpaired edit never starts holding and a repeat renews the missing-keyup guard', t => {
  const { releases, down, write, event, input } = keyboard(t);
  assert.equal(write('insertText'), false);
  down('Unidentified');
  assert.equal(write('insertText'), false);
  down('KeyA', { metaKey: true });
  assert.equal(write('insertText'), false);
  down('KeyA');
  assert.equal(write('insertFromPaste'), false);
  down('KeyA');
  event(input, 'beforeinput', { inputType: 'insertText' });
  assert.deepEqual(releases, []);
  assert.equal(write('insertText'), true);
  t.mock.timers.tick(7000);
  down('KeyA', { repeat: true });
  assert.equal(write('insertText'), true);
  t.mock.timers.tick(9900);
  assert.deepEqual(releases, []);
  t.mock.timers.tick(100);
  assert.deepEqual(releases, [true]);
});

test('the newest strike wins and composition, focus or page loss can force release', t => {
  const { releases, down, up, write, event, input, page, document, claim } = keyboard(t);
  down('KeyA');
  assert.equal(write('insertText'), true);
  down('KeyB');
  assert.equal(write('insertText'), true);
  up('KeyA');
  assert.deepEqual(releases, []);
  event(input, 'compositionend');
  assert.deepEqual(releases, [true]);
  down('KeyA', { key: 'Process', isComposing: true });
  event(input, 'compositionupdate');
  assert.equal(claim('strike'), false);
  down('KeyA', { keyCode: 229 });
  assert.equal(write('insertText'), false);
  down('KeyA', { key: 'ㄱ', isComposing: true });
  event(input, 'compositionupdate');
  assert.equal(claim('strike'), true);
  document.hidden = true;
  event(document, 'visibilitychange');
  assert.deepEqual(releases, [true, true]);
  down('KeyA');
  assert.equal(write('insertText'), true);
  event(page, 'pagehide');
  assert.deepEqual(releases, [true, true, true]);
  down('KeyA');
  assert.equal(write('insertText'), true);
  event(input, 'blur');
  assert.deepEqual(releases, [true, true, true, true]);
  t.mock.timers.runAll();
  assert.equal(releases.length, 4);
});
