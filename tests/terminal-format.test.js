import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainMarkdown, terminalLines } from '../src/terminal-format.ts';

test('renders common markdown as readable text without syntax markers', () => {
  assert.equal(plainMarkdown('# Heading\n**bold** and *emphasis*\n[docs](https://example.com)\n```js\nconst x = 1;\n```'), 'Heading\nbold and emphasis\ndocs (https://example.com)\nconst x = 1;');
  assert.equal(plainMarkdown('| Name | Value |\n| --- | --- |\n| A | 3 |'), 'Name · Value\nA · 3');
  assert.equal(plainMarkdown('snake_case and a_b stay'), 'snake_case and a_b stay');
  assert.equal(plainMarkdown('A &amp; B &lt; C'), 'A & B < C');
  assert.equal(plainMarkdown('- outer\n  - inner'), '• outer\n  • inner');
});

test('successive messages have no inserted blank lines and tools are dim', () => {
  const lines = terminalLines([{role:'user',text:'Hello'}, {role:'tool',text:'› running'}, {role:'assistant',text:'**Done**'}]);
  assert.deepEqual(lines, [{text:'> Hello',dim:false},{text:'› running',dim:true},{text:'> Done',dim:false}]);
});

test('wraps wide text before it can spill into the next visible row', () => {
  const lines = terminalLines([{ role:'assistant', text:'W'.repeat(46) }], text => [...text].reduce((n, c) => n + (c === 'W' ? 20 : 10), 0));
  assert.ok(lines.length > 1);
  for (const line of lines) assert.ok([...line.text].reduce((n, c) => n + (c === 'W' ? 20 : 10), 0) <= 510);
  assert.equal(lines.map(line => line.text).join(''), '> ' + 'W'.repeat(46));
});


test('uses available width without double wrapping Korean', () => {
  const text = '삼성동은 맑고 쌀쌀하겠습니다. 이어지는 문장을 충분히 길게 적어 폭을 활용합니다.';
  const lines = terminalLines([{role:'assistant', text}], value => [...value].length * 20);
  assert.equal(lines.map(line => line.text).join(''), '> ' + text);
  assert.ok(lines.every(line => [...line.text].length <= 25));
  assert.ok(lines.slice(0, -1).every(line => [...line.text].length >= 20));
});
