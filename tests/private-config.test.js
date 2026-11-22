import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTerminalOrigins, parsePrivateConfig } from '../scripts/pack-private.mjs';

const manifest = { permissions: [{ name: 'network', whitelist: ['https://relay.example'] }] };
test('private build merges terminal origins without changing the public manifest', () => {
  const result = mergeTerminalOrigins(manifest, { terminalOrigins: ['https://computer.example', 'https://relay.example'] });
  assert.deepEqual(result.permissions[0].whitelist, ['https://relay.example', 'https://computer.example']);
  assert.deepEqual(manifest.permissions[0].whitelist, ['https://relay.example']);
});
test('private build rejects non-origin values and invalid configs', () => {
  for (const value of ['https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?q=1', '*', ' https://example.com']) {
    assert.throws(() => mergeTerminalOrigins(manifest, { terminalOrigins: [value] }));
  }
  assert.throws(() => mergeTerminalOrigins(manifest, {}));
  assert.throws(() => mergeTerminalOrigins({ permissions: [] }, { terminalOrigins: [] }));
});

test('malformed private config errors do not include its contents', () => {
  assert.throws(() => parsePrivateConfig('sensitive-test-marker'), error => error.message === 'Invalid private config JSON.');
});
