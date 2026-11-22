import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlassesScroll } from '../src/glasses-scroll.ts';

const lines = Array.from({ length: 26 }, (_, index) => String(index));

test('only the third fast input in the same direction accelerates, capped at two lines', () => {
  const scroll = createGlassesScroll();
  assert.equal(scroll.move(lines, 0, 1, 0), 1);
  assert.equal(scroll.move(lines, 1, 1, 120), 2);
  assert.equal(scroll.move(lines, 2, 1, 240), 4);
  assert.equal(scroll.move(lines, 4, 1, 360), 6);
  assert.equal(scroll.move(lines, 6, 1, 481), 7);
  assert.equal(scroll.move(lines, 7, 1, 700), 8);
  assert.equal(scroll.move(lines, 8, 1, 800), 9);
  assert.equal(scroll.move(lines, 9, 1, 900), 11);
});

test('reversing direction starts another three-input sequence', () => {
  const scroll = createGlassesScroll();
  assert.equal(scroll.move(lines, 5, 1, 0), 6);
  assert.equal(scroll.move(lines, 6, 1, 30), 7);
  assert.equal(scroll.move(lines, 7, 1, 60), 9);
  assert.equal(scroll.move(lines, 9, -1, 90), 8);
  assert.equal(scroll.move(lines, 8, -1, 120), 7);
  assert.equal(scroll.move(lines, 7, -1, 150), 5);
});

test('scrolling stops at both boundaries and does not bank unused movement', () => {
  const scroll = createGlassesScroll();
  assert.equal(scroll.move(lines, 17, 1, 0), 18);
  assert.equal(scroll.move(lines, 18, 1, 20), 19);
  assert.equal(scroll.move(lines, 19, 1, 40), 20);
  assert.equal(scroll.move(lines, 20, 1, 60), 20);
  assert.equal(scroll.move(lines, 20, -1, 80), 19);
  assert.equal(scroll.move(lines, 19, 1, 100), 20);

  assert.equal(scroll.move(lines, 3, -1, 120), 2);
  assert.equal(scroll.move(lines, 2, -1, 140), 1);
  assert.equal(scroll.move(lines, 1, -1, 160), 0);
  assert.equal(scroll.move(lines, 0, -1, 180), 0);
  assert.equal(scroll.move(lines, 0, 1, 200), 1);
});

test('an explicit interruption discards the previous input sequence immediately', () => {
  const scroll = createGlassesScroll();
  assert.equal(scroll.move(lines, 3, -1, 0), 2);
  assert.equal(scroll.move(lines, 2, -1, 10), 1);
  scroll.reset();
  assert.equal(scroll.move(lines, 10, -1, 20), 9);
  assert.equal(scroll.move(lines, 9, -1, 30), 8);
  assert.equal(scroll.move(lines, 8, -1, 40), 6);
});
