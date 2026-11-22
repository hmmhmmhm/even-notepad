import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backAfterInput } from '../src/terminal-back.ts';

test('finishes an active IME commit before leaving the conversation', async () => {
  const input = new EventTarget(); let pending = true, left = false;
  input.blur = () => { setTimeout(() => { pending = false; input.dispatchEvent(new Event('compositionend')); }, 5); };
  backAfterInput(input, () => pending, () => { left = true; }, 80);
  assert.equal(left, false);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(left, true);
});
test('does not get stuck if the IME omits its completion event', async () => {
  const input = new EventTarget(); let left = false; input.blur = () => {};
  backAfterInput(input, () => true, () => { left = true; }, 10);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(left, true);
});
