import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startupLayout, startupLogo } from '../src/startup-menu.ts';

test('startup menu reuses session row style, with title, logo and one event target', () => {
  const { textObject, imageObject } = startupLayout(1);
  assert.equal(textObject.filter(x => x.isEventCapture).length, 1);
  assert.equal(textObject.find(x => x.isEventCapture).content, ' ');
  assert.equal(textObject.find(x => x.content === 'Editor').isEventCapture, 0);
  assert.equal(textObject.find(x => x.content === 'Quiet Terminal').isEventCapture, 0);
  assert.equal(textObject.find(x => x.content === 'Editor').borderWidth, 0);
  assert.equal(textObject.find(x => x.content === 'Terminal').borderWidth, 1);
  assert.equal(textObject.find(x => x.content === 'X (Twitter)').borderWidth, 0);
  assert.equal(startupLayout(3).textObject.find(x => x.content === 'News').borderWidth, 1);
  assert.equal(imageObject.length, 1);
  assert.equal(startupLogo().length, imageObject[0].width * imageObject[0].height);
});

test('startup icon is a compact monochrome terminal prompt and cursor', () => {
  const logo = startupLogo();
  const isFilled = (x, y) => logo[y * 32 + x] === 255;
  const blocks = [[3, 3, 4, 4], [7, 7, 4, 4], [11, 11, 4, 4], [7, 15, 4, 4], [3, 19, 4, 4], [19, 19, 10, 4]];
  assert.equal(logo.filter(value => value === 255).length, 120);
  for (const [x, y, width, height] of blocks) {
    for (let row = y; row < y + height; row++) {
      for (let column = x; column < x + width; column++) assert.equal(isFilled(column, row), true);
    }
  }
  assert.equal(isFilled(18, 12), false);
  assert.equal(isFilled(30, 20), false);
});

test('public startup menu labels Terminal as unsupported and shows the personal build guide when selected', () => {
  const layout = startupLayout(1, '', false);
  const objects = layout.textObject;
  const allIds = [...objects, ...layout.imageObject].map(x => x.containerID);
  assert.equal(new Set(allIds).size, allIds.length, 'all SDK containers have unique IDs');
  assert.equal(objects.find(x => x.isEventCapture === 1).containerID, 5);
  assert.notEqual(objects.find(x => x.content.startsWith('Guide:')).containerID, 5);
  assert.equal(objects.find(x => x.content === 'Terminal · Not supported').borderWidth, 1);
  assert.ok(objects.some(x => x.content === 'Not supported in the public build.'));
  assert.ok(objects.some(x => x.content === 'Guide: github.com/hmmhmmhm/quiet-terminal'));
  assert.equal(objects.some(x => x.content === 'X (Twitter)'), true);
  assert.equal(objects.some(x => x.content === 'News'), true);
  assert.equal(objects.length + layout.imageObject.length, 9);
});
