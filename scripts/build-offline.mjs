// Rebuilds the client and copies the single inlined index.html to
// MarketSignalTriage-Offline.html at the project root — the standalone,
// no-server, no-install build. Run this after any client code change if
// you want the offline file to stay in sync.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT = path.join(ROOT, 'client');

console.log('1/2 — Building the client (single-file inlined build)...');
execFileSync('npm', ['run', 'build'], { cwd: CLIENT, stdio: 'inherit', shell: true });

console.log('2/2 — Copying to MarketSignalTriage-Offline.html...');
fs.copyFileSync(path.join(CLIENT, 'dist', 'index.html'), path.join(ROOT, 'MarketSignalTriage-Offline.html'));

console.log('\nDone — MarketSignalTriage-Offline.html is up to date. Open it directly, no server needed.');
