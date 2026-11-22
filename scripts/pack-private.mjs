import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function mergeTerminalOrigins(manifest, config) {
  if (!config || !Array.isArray(config.terminalOrigins) || !config.terminalOrigins.every(value => typeof value === 'string')) {
    throw new Error('Private config must contain a terminalOrigins string array.');
  }
  const origins = config.terminalOrigins.map(value => {
    let url;
    try { url = new URL(value); } catch { throw new Error('Invalid private terminal origin.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || value.trim() !== value || url.origin !== value) {
      throw new Error('Invalid private terminal origin.');
    }
    return url.origin;
  });
  const result = structuredClone(manifest);
  const network = result.permissions?.find(permission => permission.name === 'network');
  if (!network || !Array.isArray(network.whitelist)) throw new Error('Missing network permission.');
  network.whitelist = [...new Set([...network.whitelist, ...origins])];
  return result;
}

export function parsePrivateConfig(text) {
  try { return JSON.parse(text); } catch { throw new Error('Invalid private config JSON.'); }
}

function main() {
  const configPath = join(root, 'app.private.json');
  if (!existsSync(configPath)) throw new Error('Create app.private.json with a terminalOrigins array.');
  let config;
  try { config = parsePrivateConfig(readFileSync(configPath, 'utf8')); }
  catch { throw new Error('Could not read private config. Check the file format.'); }
  const manifest = mergeTerminalOrigins(JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')), config);
  const stage = mkdtempSync(join(tmpdir(), 'quiet-terminal-private-'));
  try {
    for (const path of ['src', 'public', 'index.html', 'package.json']) cpSync(join(root, path), join(stage, path), { recursive: true });
    writeFileSync(join(stage, 'app.json'), JSON.stringify(manifest, null, 2) + '\n');
    symlinkSync(join(root, 'node_modules'), join(stage, 'node_modules'), 'dir');
    execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: stage, stdio: 'inherit' });
    const bundles = readdirSync(join(stage, 'dist', 'assets')).filter(name => name.endsWith('.js')).map(name => readFileSync(join(stage, 'dist', 'assets', name), 'utf8'));
    for (const origin of config.terminalOrigins) {
      if (!bundles.some(bundle => bundle.includes(origin))) throw new Error('Private origin missing from application bundle.');
    }
    execFileSync(join(root, 'node_modules/.bin/evenhub'), ['pack', 'app.json', 'dist', '--sdk-ver', manifest.min_sdk_version, '-o', join(root, 'quiet-terminal.private.ehpk')], { cwd: stage, stdio: 'inherit' });
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
