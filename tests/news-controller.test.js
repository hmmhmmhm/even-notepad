import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewsController } from '../src/news/news-controller.ts';

test('cached news appears while updating and an old response cannot overwrite a new one', async () => {
  const waiting = [];
  const controller = createNewsController(options => new Promise(resolve => waiting.push({ resolve, options })), () => {});
  const first = controller.refresh();
  waiting[0].options.onCached({ status: 'stale', value: [{ title: 'Cached' }] });
  assert.equal(controller.current().value[0].title, 'Cached');
  const second = controller.refresh({ force: true });
  waiting[1].resolve({ status: 'fresh', value: [{ title: 'Latest' }] });
  await second;
  waiting[0].resolve({ status: 'fresh', value: [{ title: 'Old' }] });
  await first;
  assert.equal(controller.current().value[0].title, 'Latest');
});

test('a response after leaving news does not repaint the old screen', async () => {
  let finish;
  const updates = [];
  const controller = createNewsController(() => new Promise(resolve => { finish = resolve; }), value => updates.push(value));
  const pending = controller.refresh();
  controller.close();
  finish({ status: 'fresh', value: [{ title: 'Later' }] });
  await pending;
  assert.equal(updates.length, 1);
});
