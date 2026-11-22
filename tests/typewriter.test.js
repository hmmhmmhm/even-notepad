import assert from 'node:assert/strict';
import test from 'node:test';
import { decorativePage } from '../src/typewriter.ts';

const compact = { capacity: 14, initial: 8 };
const tall = { capacity: 29, initial: 15 };
const completed = 'levels, production cost variances, labor';

test('the compact and tall previews share the same report cursor and show different amounts of ink', () => {
  const initial = decorativePage([0], compact);
  assert.equal(initial.rows.length, 8);
  assert.equal(initial.rows.at(-1), 'levels, prod');
  const taller = decorativePage([0], tall);
  assert.equal(taller.rows.length, 15);
  assert.deepEqual(taller.rows.slice(-initial.rows.length), initial.rows);
  assert.deepEqual(decorativePage([2], compact).rows, [...initial.rows.slice(0, -1), 'levels, produc']);
});

test('Enter completes the current line before moving the carriage to the next row', () => {
  assert.deepEqual(decorativePage([1, 0], compact).rows.slice(-2), [completed, '']);
  assert.deepEqual(decorativePage([1, 4], compact).rows.slice(-2), [completed, 'cost']);
  assert.deepEqual(decorativePage([0, 0, 0], compact).rows.slice(-3), [
    completed,
    'costs and discretionary spending programs.',
    '',
  ]);
});

test('Enter immediately after a full line advances once, while typing wraps naturally', () => {
  const remaining = completed.length - 'levels, prod'.length;
  assert.deepEqual(decorativePage([remaining, 0], compact).rows.slice(-2), [completed, '']);
  assert.deepEqual(decorativePage([remaining + 1], compact).rows.slice(-2), [completed, 'c']);
});

test('the report wraps back to its opening and fills the available rows in both layouts', () => {
  const lengths = Array(27).fill(0);
  for (const metrics of [compact, tall]) {
    const { rows, line } = decorativePage(lengths, metrics);
    assert.equal(rows.length, metrics.capacity);
    assert.equal(line, 43);
    assert.ok(rows.every(row => row.length <= 44));
    assert.equal(rows.at(-1), '');
  }
  const seam = ['effect on net income as reported.', 'Such registrants may omit the information'];
  const unbrokenInput = decorativePage([1000], tall).rows;
  const lastReportRow = unbrokenInput.indexOf(seam[0]);
  assert.deepEqual(unbrokenInput.slice(lastReportRow, lastReportRow + 2), seam);
  assert.equal(unbrokenInput.at(-1), 'In addit');
});
