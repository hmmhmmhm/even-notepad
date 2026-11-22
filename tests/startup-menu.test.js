import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startupLayout, startupLogo } from '../src/startup-menu.ts';

test('startup menu reuses session row style, with title, logo and one event target', () => {
  const { textObject, imageObject } = startupLayout(1);
  assert.equal(textObject.filter(x => x.isEventCapture).length, 1);
  assert.equal(textObject.find(x => x.isEventCapture).content, ' ');
  assert.equal(textObject.find(x => x.content === 'Editor').isEventCapture, 0);
  assert.equal(textObject.find(x => x.content === 'Even Notepad').isEventCapture, 0);
  assert.equal(textObject.find(x => x.content === 'Editor').borderWidth, 0);
  assert.equal(textObject.find(x => x.content === 'Terminal').borderWidth, 1);
  assert.equal(textObject.find(x => x.content === 'X (Twitter)').borderWidth, 0);
  assert.equal(startupLayout(3).textObject.find(x => x.content === 'News').borderWidth, 1);
  assert.equal(imageObject.length, 1);
  assert.equal(startupLogo().length, imageObject[0].width * imageObject[0].height);
});
