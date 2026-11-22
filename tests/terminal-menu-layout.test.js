import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replyMenuLayout, terminalMenuLayout } from '../src/terminal-menu-layout.ts';
import { parseReplies } from '../src/terminal-replies.ts';
const label = x => x || ' ';
test('shows only the selected session with a rounded border and one event capture', () => {
  const layout = terminalMenuLayout({menuId:2,items:['New session','First','Second'],selected:1,start:0}, label);
  assert.equal(layout.length,8);
  assert.equal(layout.filter(row => row.isEventCapture).length,1);
  assert.equal(layout[0].containerName,'pm-2');
  assert.equal(layout[0].content,' ');
  assert.equal(layout[1].content,'New session');
  assert.equal(layout[1].isEventCapture,0);
  assert.equal(layout[2].content,'First');
  assert.equal(layout[2].borderWidth,1);
  assert.equal(layout[2].borderRadius,5);
  assert.equal(layout[0].borderWidth,0);
  assert.equal(layout[3].borderWidth,0);
});
test('keeps the selected row visible when the window moves', () => {
  const items=Array.from({length:12},(_,i)=>'Session '+i);
  const layout=terminalMenuLayout({menuId:9,items,selected:9,start:4},label);
  assert.equal(layout[6].content,'Session 9');
  assert.equal(layout[6].borderWidth,1);
  assert.equal(layout.filter(row => row.borderWidth === 1).length,1);
});

test('shows all four lines of the selected reply and keeps controls in the same menu', () => {
  const korean = '먼저 설치가 실패한 원인을 확인해 주세요. 재현되는 조건을 정리한 뒤 변경이 필요한 부분만 수정하고, 검증 결과를 알려 주세요.';
  const english = 'Please check what caused the install to fail, make the smallest fix that preserves existing behavior, and tell me how you verified it.';
  const menu = { menuId: 'r3', items: ['Back', 'Stop response', korean, english, 'More different replies'] };
  for (const selected of [0, 1, 2, 3, 4, 3, 2]) {
    const page = replyMenuLayout({ ...menu, selected }, 'Finding replies…');
    const selectedRow = page.find(row => row.borderWidth === 1);
    assert.equal(selectedRow.content.replaceAll('\n', ' '), menu.items[selected]);
    assert.ok(page.length <= 8);
    assert.equal(page.filter(row => row.isEventCapture).length, 1);
    const rows = page.slice(1, -1);
    assert.ok(rows.every((row, i) => row.yPosition >= (i ? rows[i - 1].yPosition + rows[i - 1].height : 0) && row.yPosition + row.height <= page.at(-1).yPosition));
    if (selected === 2 || selected === 3) assert.equal(selectedRow.content.split('\n').length, 4);
  }
});

test('accepts longer bilingual replies and rejects oversize and duplicate replies', () => {
  const longer = [
    'Please continue with the remaining checks.\nPause before making any irreversible changes.',
    '실패 원인을 먼저 확인한 뒤, 가장 작은 변경으로 수정해 주세요. 확인한 내용을 요약해 주세요.',
    'Run the same scenario one more time and compare the result with the original.',
  ];
  assert.deepEqual(parseReplies(JSON.stringify(longer), []), longer);
  assert.throws(() => parseReplies(JSON.stringify(longer), [longer[0].replace('\n', ' ')]));
  assert.throws(() => parseReplies(JSON.stringify([longer[0], '한'.repeat(100), longer[2]]), []));
  assert.throws(() => parseReplies(JSON.stringify([longer[0], 'Bad\u0000text', longer[2]]), []));
});
