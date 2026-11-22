import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorLines, editorFooter, editorCursor, editorDisplay } from '../src/editor-hud.ts';

test('editor preserves literal text, empty lines and trailing newline while wrapping', () => {
  const text = '# Hello\n\n한글😀 and **text**\n';
  const lines = editorLines(text, value => [...value].length * 20);
  assert.equal(lines.join('\n'), text);
  assert.deepEqual(editorLines('a'.repeat(30), value => value.length * 20), ['a'.repeat(25), 'a'.repeat(5)]);
});

test('maps cursor through soft wraps, explicit newlines and grapheme clusters', () => {
  const measure = text => [...text].length * 85;
  const layout = editorCursor('abcde한😀\n끝', 5, measure);
  assert.equal(layout.row, 1);
  assert.equal(layout.column, 0);
  assert.equal(editorCursor('abcde한😀\n끝', 8, measure).column, 3);
  assert.equal(editorCursor('abcde한😀\n끝', 9, measure).row, 2);
  const insideEmoji = editorCursor('😀x', 1, measure);
  assert.equal(insideEmoji.column, 0);
});

test('cursor display leaves document text intact and marks an empty document placeholder as dim', () => {
  assert.deepEqual(editorDisplay('', 0, true, text => text.length * 10), [{ text: '| Start typing…', dim: true }]);
  assert.deepEqual(editorDisplay('abcd', 2, true, text => text.length * 10), [{ text: 'ab|cd', dim: false }]);
  assert.deepEqual(editorDisplay('abcd', 2, false, text => text.length * 10), [{ text: 'abcd', dim: false }]);
});

test('a cursor never pushes a wrapped Unicode line over the bridge byte or width budget', () => {
  const text = '가😀ab'.repeat(60) + '\n';
  const measure = value => [...value].length * 20;
  for (let offset = 0; offset <= text.length; offset++) {
    for (const { text: line } of editorDisplay(text, offset, true, measure)) {
      assert.ok(new TextEncoder().encode(line).length <= 150);
      assert.ok(measure(line) <= 510);
    }
  }
});

test('footer shows file name, grapheme count and word count and stays within width', () => {
  const measure = value => [...value].length * 10;
  assert.equal(editorFooter('note.md', '강 😀 two\nwords', measure), 'note.md   13 chars · 4 words');
  const result = editorFooter('A'.repeat(100) + '.md', 'hello world', measure);
  assert.ok(measure(result) <= 505);
  assert.match(result, /11 chars · 2 words$/);
  assert.ok(result.includes('…'));
});
