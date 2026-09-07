// Refreshes server/public with the latest client build — run this before
// committing/pushing any client change destined for the Vercel deploy.
// vercel.json ships server/public to the function via `includeFiles`
// rather than having Vercel rebuild the client itself, so the committed
// copy here *is* what actually gets deployed.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLIENT = path.join(ROOT, 'client');
const SERVER_PUBLIC = path.join(ROOT, 'server', 'public');

console.log('1/2 — Building the client...');
execFileSync('npm', ['run', 'build'], { cwd: CLIENT, stdio: 'inherit', shell: true });

console.log('2/2 — Refreshing server/public...');
fs.rmSync(SERVER_PUBLIC, { recursive: true, force: true });
fs.cpSync(path.join(CLIENT, 'dist'), SERVER_PUBLIC, { recursive: true });

console.log('\nDone — server/public is up to date. Commit it before pushing.');
