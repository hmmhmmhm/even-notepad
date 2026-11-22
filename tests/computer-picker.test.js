import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computerPickerLayout, computerPickerLabels } from '../src/computer-picker.ts';

test('picker shows computers and a back row without exposing connection tokens', () => {
  const entries = [{ name: 'Office', url: 'http://a:3456', token: 'SECRET' }, { name: 'Home', url: 'http://b:3456', token: 'OTHER' }];
  assert.deepEqual(computerPickerLabels(entries), ['1. a:3456 · Office', '2. b:3456 · Home', 'Back']);
  const layout = computerPickerLayout({ id: 3, entries, selected: 1, status: '' }, value => value || ' ');
  assert.equal(layout.length, 8);
  assert.equal(layout.filter(item => item.isEventCapture).length, 1);
  assert.equal(layout.find(item => item.isEventCapture).containerName, 'pm-c3');
  assert.equal(layout.find(item => item.content.includes('Home')).borderWidth, 1);
  assert.doesNotMatch(JSON.stringify(layout), /SECRET|OTHER/);
});

test('the selected computer stays visible in a long list', () => {
  const entries = Array.from({ length: 9 }, (_, i) => ({ name: 'Computer ' + i, url: 'http://host' + i, token: 'x' }));
  const layout = computerPickerLayout({ id: 2, entries, selected: 8, status: '' }, value => value || ' ');
  assert.equal(layout.find(item => item.borderWidth === 1).content, '9. host8 · Computer 8');
});

test('picker never exposes credentials hidden in a malformed saved address', () => {
  const labels = computerPickerLabels([{ name: 'PC', url: 'http://user:secret@host', token: 'x', allowed: false }]);
  assert.equal(labels[0], '1. ! host · PC');
  assert.doesNotMatch(JSON.stringify(labels), /secret|user/);
});
