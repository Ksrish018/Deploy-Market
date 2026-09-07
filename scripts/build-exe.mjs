// Builds a single, double-clickable MarketSignalTriage.exe using Node's
// built-in Single Executable Application (SEA) feature — no external Node
// binary download or native compiler needed, since it reuses the Node
// already installed on this machine.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SERVER = path.join(ROOT, 'server');
const CLIENT = path.join(ROOT, 'client');

function run(cmd, args, cwd, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}  (in ${path.relative(ROOT, cwd) || '.'})`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit', shell: true, ...opts });
}

// npx/npm are .cmd shims on Windows, which need `shell: true` — but that
// re-tokenizes the command through cmd.exe, which mishandles a path with a
// space (this project's own folder name). Running postject's own CLI script
// straight through `node` (shell: false) sidesteps that entirely: argv is
// passed through as an array with no re-quoting.
function runNode(scriptPath, args, cwd) {
  console.log(`> node ${scriptPath} ${args.join(' ')}  (in ${path.relative(ROOT, cwd) || '.'})`);
  execFileSync(process.execPath, [scriptPath, ...args], { cwd, stdio: 'inherit' });
}

console.log('\n1/6 — Building the client...');
run('npm', ['run', 'build'], CLIENT);

console.log('\n2/6 — Copying the built client into server/public...');
fs.rmSync(path.join(SERVER, 'public'), { recursive: true, force: true });
fs.cpSync(path.join(CLIENT, 'dist'), path.join(SERVER, 'public'), { recursive: true });

console.log('\n3/6 — Bundling the server (ESM + deps) into one CommonJS file...');
fs.rmSync(path.join(SERVER, 'build'), { recursive: true, force: true });
// --external: db.js dynamically imports @neondatabase/serverless for the
// Vercel deploy, but that package is only installed at the project root
// (not in server/node_modules) — marking it external stops esbuild trying
// to bundle a dependency that's deliberately absent here, since this local
// build never takes that code path (no POSTGRES_URL/DATABASE_URL is ever set).
run('npx', ['esbuild', 'src/index.js', '--bundle', '--platform=node', '--format=cjs', '--external:@neondatabase/serverless', '--outfile=build/server.cjs'], SERVER);

console.log('\n4/6 — Generating the SEA preparation blob...');
run('node', ['--experimental-sea-config', 'sea-config.json'], SERVER);

console.log('\n5/6 — Copying the local Node.js binary and injecting the app...');
const exeOut = path.join(ROOT, 'MarketSignalTriage.exe');
fs.copyFileSync(process.execPath, exeOut);
const postjectCli = path.join(SERVER, 'node_modules', 'postject', 'dist', 'cli.js');
runNode(postjectCli, [exeOut, 'NODE_SEA_BLOB', path.join(SERVER, 'build', 'sea-prep.blob'),
  '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], ROOT);

console.log('\n6/6 — Placing the "public" assets folder next to the .exe...');
fs.rmSync(path.join(ROOT, 'public'), { recursive: true, force: true });
fs.cpSync(path.join(SERVER, 'public'), path.join(ROOT, 'public'), { recursive: true });

console.log('\nDone — MarketSignalTriage.exe is ready in the project root.');
console.log('Ship it together with the sibling "public" folder. Data will be');
console.log('written to a "data" folder created next to the .exe on first run.');
