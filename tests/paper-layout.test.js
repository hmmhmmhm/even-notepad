import test from 'node:test';
import assert from 'node:assert/strict';
import { paperLayout } from '../src/paper-layout.ts';

test('uses tall A4-like paper only when visible space fits it', () => {
  assert.equal(paperLayout(390, 410), 'compact');
  assert.equal(paperLayout(390, 700), 'tall');
  assert.equal(paperLayout(390, 390 * 3 / 2 - 1), 'compact');
  assert.equal(paperLayout(390, 390 * 3 / 2), 'tall');
});
test('ignores invalid viewport sizes', () => {
  assert.equal(paperLayout(0, 800), 'compact');
  assert.equal(paperLayout(390, 0), 'compact');
});
