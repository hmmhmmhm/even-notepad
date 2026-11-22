import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createComputers } from '../src/computers.ts';

test('saved computers survive restart, update by address, and delete independently', async () => {
  let data = '';
  const storage = { async read() { return data; }, async write(value) { data = value; } };
  const a = createComputers(storage); await a.load();
  await a.save({ name: '집', url: 'http://100.1.2.3:3456', token: 'secret' });
  await a.save({ name: '회사', url: 'https://office.test', token: 'other' });
  const b = createComputers(storage); await b.load();
  assert.deepEqual(b.list().map(x => x.name), ['집', '회사']);
  await b.save({ name: '집 PC', url: 'http://100.1.2.3:3456/', token: 'new' });
  assert.equal(b.list().length, 2);
  await b.remove('https://office.test');
  const c = createComputers(storage); await c.load();
  assert.equal(c.list()[0].token, 'new'); assert.equal(c.list().length, 1);
});

test('failed storage does not pretend a computer was saved', async () => {
  const c = createComputers({ read: async () => '', write: async () => { throw Error('storage'); } });
  await c.load();
  await assert.rejects(c.save({ name: '집', url: 'http://localhost', token: 'a' }));
  assert.equal(c.list().length, 0);
});

test('simultaneous deletes do not restore removed computers or keys', async () => {
  let data = '';
  const c = createComputers({ read: async () => data, write: async value => { await new Promise(resolve => setTimeout(resolve, 2)); data = value; } });
  await c.load();
  await c.save({ name: '하나', url: 'https://one.test', token: 'a' });
  await c.save({ name: '둘', url: 'https://two.test', token: 'b' });
  await Promise.all([c.remove('https://one.test'), c.remove('https://two.test')]);
  assert.deepEqual(c.list(), []);
  assert.equal(data, '[]');
});

test('a failed native read never initializes an empty list', async () => {
  let wrote = false;
  const c = createComputers({ read: async () => null, write: async () => { wrote = true; } });
  await assert.rejects(c.load());
  await assert.rejects(c.save({ name: '집', url: 'http://localhost', token: 'a' }));
  assert.equal(wrote, false);
});
