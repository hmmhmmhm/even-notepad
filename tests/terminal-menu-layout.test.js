import { test } from 'node:test';
import assert from 'node:assert/strict';
import { terminalMenuLayout } from '../src/terminal-menu-layout.ts';
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
