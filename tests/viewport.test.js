import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLines, makeTerminalLines, viewport, scrollPosition, scrollbar } from '../src/viewport.ts';

test('terminal wraps mixed-width text without losing Unicode', () => {
  const text = 'a'.repeat(48) + '안녕하세요' + '😀' + 'b'.repeat(40);
  const lines = makeTerminalLines(text);
  assert.equal(lines.join(''), text);
  assert.equal(lines[0], 'a'.repeat(48));
  assert.ok(lines.every(line => new TextEncoder().encode(line).length <= 150));
});

test('scrolling advances one line while preserving the remaining visible lines', () => {
  const lines = makeLines('one\ntwo\nthree\nfour\nfive\nsix\nseven\neight');
  assert.deepEqual(viewport(lines, 0).lines, ['one','two','three','four','five','six']);
  assert.deepEqual(viewport(lines, 1).lines, ['two','three','four','five','six','seven']);
  assert.equal(scrollPosition(lines, 0, -1), 0);
  assert.equal(scrollPosition(lines, 0, 100), 2);
});
test('long unicode lines wrap without splitting characters or losing content', () => {
  const text = '한😀'.repeat(80);
  const lines = makeLines(text);
  assert.equal(lines.join(''), text);
  assert.ok(lines.length > 1);
  assert.ok(viewport(lines, 0).text.length > 0);
});
test('blank lines and the end of a document remain navigable', () => {
  assert.deepEqual(makeLines('a\n\nb\n'), ['a','','b','']);
  assert.equal(viewport(makeLines(''), 0).text, '');
});
test('a very long combining sequence stays below the bridge byte budget', () => {
  const text = 'a' + '\u0301'.repeat(700);
  const lines = makeLines(text);
  assert.equal(lines.join(''), text);
  for (let first = 0; first < lines.length; first++) {
    assert.ok(new TextEncoder().encode(viewport(lines, first).text).length < 999);
  }
});

test('the glasses scroll indicator draws only the current slot', () => {
  const row = slot => Array.from({ length: 6 }, (_, index) => index === slot ? '│' : '\u00a0');
  assert.deepEqual(scrollbar(0, 10).split('\n'), row(0));
  assert.deepEqual(scrollbar(4, 10).split('\n'), row(2));
  assert.deepEqual(scrollbar(10, 10).split('\n'), row(5));
  assert.deepEqual(scrollbar(0, 0).split('\n'), row(0));
});
