import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimXPosts } from '../src/x-memory.ts';

test('trims old posts without moving the currently selected post', () => {
  const posts = Array.from({ length: 210 }, (_, id) => ({ id }));
  const result = trimXPosts(posts, 198);
  assert.equal(result.posts.length, 200);
  assert.equal(result.removed, 10);
  assert.equal(result.posts[result.selected].id, 198);
});

test('does not discard the selected post when a request completes after scrolling back', () => {
  const result = trimXPosts(Array.from({ length: 210 }, (_, id) => ({ id })), 3);
  assert.equal(result.removed, 3);
  assert.equal(result.posts[result.selected].id, 3);
});
