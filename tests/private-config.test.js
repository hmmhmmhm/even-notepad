import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeTerminalOrigins, parsePrivateConfig } from '../scripts/pack-private.mjs';

const root = new URL('../', import.meta.url);
const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const appJson = JSON.parse(readFileSync(new URL('app.json', root), 'utf8'));
const lockJson = JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8'));

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

test('Quiet Terminal app, npm package and distribution names are aligned', () => {
  assert.equal(packageJson.name, 'quiet-terminal');
  assert.equal(appJson.name, 'Quiet Terminal');
  assert.equal(appJson.version, packageJson.version);
  assert.equal(lockJson.name, packageJson.name);
  assert.equal(lockJson.version, packageJson.version);
  assert.equal(lockJson.packages[''].name, packageJson.name);
  assert.equal(lockJson.packages[''].version, packageJson.version);
  assert.match(packageJson.scripts.pack, /-o quiet-terminal\.ehpk$/);
  assert.match(readFileSync(new URL('../scripts/pack-private.mjs', import.meta.url), 'utf8'), /quiet-terminal\.private\.ehpk/);
  assert.equal(appJson.package_id, 'com.hmmhmmhm.hiddenwriter');
});
