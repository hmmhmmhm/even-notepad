import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWorkspaceTarget } from '../src/phone-workspace.ts';

test('background and writer accept gestures while controls and dialogs keep their own input', () => {
  const writer = { id: 'writer', closest: () => null };
  const background = { closest: () => null };
  const button = { closest: () => ({}) };
  assert.equal(isWorkspaceTarget(writer, writer), true);
  assert.equal(isWorkspaceTarget(background, writer), true);
  assert.equal(isWorkspaceTarget(button, writer), false);
  assert.equal(isWorkspaceTarget({ nodeType: 3, parentElement: button }, writer), false);
});
