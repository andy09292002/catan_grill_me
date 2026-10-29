// Builds HexBoard.exe: the table server and the whole built app in one file, using Node's
// single executable applications. Double-click it to start a Board + phones table; no Node.js
// or npm needed on the PC. Run `npm run exe` (which builds the app first). Windows only.
// Output: build/exe/HexBoard.exe

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { build } from 'esbuild';

const out = resolve('build/exe');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. The server and everything it imports, as one CommonJS file (what a single executable runs).
await build({
  entryPoints: ['server/table.ts'],
  outfile: join(out, 'table.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  // ws tries these optional speed-ups and does without them.
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'warning',
});

// 2. Every file of the built app goes inside the exe, keyed by its path under dist.
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
};
walk(resolve('dist'));
const assets = Object.fromEntries(files.map((f) => [`dist/${relative(resolve('dist'), f).replaceAll('\\', '/')}`, f]));
const config = {
  main: join(out, 'table.cjs'),
  output: join(out, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  assets,
};
writeFileSync(join(out, 'sea-config.json'), JSON.stringify(config, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', join(out, 'sea-config.json')], { stdio: 'inherit' });

// 3. A copy of this Node.js with the blob injected.
const exe = join(out, 'HexBoard.exe');
copyFileSync(process.execPath, exe);
execFileSync(
  process.execPath,
  [resolve('node_modules/postject/dist/cli.js'), exe, 'NODE_SEA_BLOB', join(out, 'sea-prep.blob'), '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'],
  { stdio: 'inherit' },
);
console.log(`Built ${relative(process.cwd(), exe)} with ${files.length} app files inside.`);
