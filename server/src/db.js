import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isSea } from './sea.js';
import { defaultState } from './seed.js';

// --- Storage backend selection -------------------------------------------
// A connection string here means we're in an environment with no persistent
// local disk (Vercel's serverless functions run on a read-only filesystem
// outside /tmp, and each invocation may land on a different instance), so
// the whole app state is kept as a single JSON blob in one Postgres row
// instead of a local file. Different Vercel Postgres/Neon integration flows
// inject slightly different env var names, so a few are checked.
// Local dev, the .exe, and the Fly.io/Docker deploy never set any of these,
// so they're completely unaffected and keep using the fast, simple file.
const CONNECTION_STRING = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;
const USE_POSTGRES = !!CONNECTION_STRING;

// `@neondatabase/serverless` is intentionally never statically imported: it
// isn't installed in server/node_modules (only in the root package.json,
// for the Vercel function build), so a top-level `import` would crash this
// module on load in every OTHER environment. A dynamic import, reached only
// from inside the USE_POSTGRES branch, means it's never even attempted
// elsewhere.
let sqlPromise = null;
function getSql() {
  if (!sqlPromise) {
    sqlPromise = import('@neondatabase/serverless').then(({ neon }) => neon(CONNECTION_STRING));
  }
  return sqlPromise;
}

async function ensureTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS app_state (id text PRIMARY KEY, data jsonb NOT NULL)`;
}

async function loadFromPostgres() {
  const sql = await getSql();
  await ensureTable(sql);
  const rows = await sql`SELECT data FROM app_state WHERE id = 'main'`;
  if (rows.length === 0) {
    const fresh = defaultState();
    await sql`INSERT INTO app_state (id, data) VALUES ('main', ${JSON.stringify(fresh)}::jsonb)`;
    return fresh;
  }
  return rows[0].data;
}

async function persistToPostgres(nextState) {
  const sql = await getSql();
  await ensureTable(sql);
  await sql`UPDATE app_state SET data = ${JSON.stringify(nextState)}::jsonb WHERE id = 'main'`;
}

// --- Local file backend (dev / .exe / Docker+Fly.io) ----------------------
// Works both as real ESM (dev/npm) and after esbuild bundles this to CJS for
// packaging — CJS has a real `__filename` global; ESM doesn't, so it falls
// through to `import.meta.url` there instead.
const __dirname = typeof __filename !== 'undefined' ? path.dirname(__filename) : path.dirname(fileURLToPath(import.meta.url));
// Where data lives, in priority order:
//  1. DATA_DIR env var — set this to a mounted persistent volume when deployed
//     (e.g. Fly.io: DATA_DIR=/data with a volume mounted at /data).
//  2. Packaged as a single .exe (Node's Single Executable Application
//     feature): `process.execPath` IS the compiled binary, so data sits on
//     real disk right next to it.
//  3. Dev/npm: alongside this source file, exactly as before.
const BASE_DIR = isSea() ? path.dirname(process.execPath) : __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(BASE_DIR, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const LOG_DIR = path.join(DATA_DIR, 'logs');

if (!USE_POSTGRES) {
  for (const dir of [DATA_DIR, LOG_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

// Sync fs calls are fine here: this path only ever runs on a single,
// long-lived process with a real local disk (dev/.exe/Docker), never on
// serverless — so there's no concurrent-instance drift to worry about, and
// no persistent module-level cache below (see getState) that could go
// stale across requests the way it would on Vercel.
let fileState = null;

function loadFromFile() {
  if (fileState) return fileState;
  if (fs.existsSync(DATA_FILE)) {
    try {
      fileState = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      return fileState;
    } catch (e) {
      console.error('[db] db.json was unreadable, reinitializing from seed:', e.message);
    }
  }
  fileState = defaultState();
  persistToFile(fileState);
  return fileState;
}

function persistToFile(nextState) {
  fileState = nextState;
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(nextState, null, 2), 'utf-8');
  fs.renameSync(tmp, DATA_FILE); // atomic on the same volume — avoids a torn/partial db.json
}

// --- Public API -------------------------------------------------------
// Always async, regardless of backend, so every call site is written the
// same way (`await getState()` / `await saveState(state)`) whether this
// ends up hitting Postgres or the local file.

/**
 * Fetches the current app state. On Postgres, this deliberately never
 * caches across calls — a warm serverless instance could otherwise serve
 * stale data written by a *different* concurrent instance. On the file
 * backend, caching is safe (one process, one disk) and avoids needless
 * re-reads.
 */
export async function getState() {
  if (USE_POSTGRES) return loadFromPostgres();
  return loadFromFile();
}

/** Persists `state` — pass the exact object you got from getState() (and mutated). */
export async function saveState(state) {
  if (USE_POSTGRES) return persistToPostgres(state);
  return persistToFile(state);
}

/** Wipes all cycles/items/signals/briefs/logs and reseeds a fresh current-week cycle. */
export async function resetState() {
  const fresh = defaultState();
  if (USE_POSTGRES) {
    await persistToPostgres(fresh);
  } else {
    fs.rmSync(LOG_DIR, { recursive: true, force: true });
    fs.mkdirSync(LOG_DIR, { recursive: true });
    persistToFile(fresh);
  }
  return fresh;
}

/** Best-effort extra copy of a run log as a plain file — skipped entirely on Postgres/serverless, where there's no persistent local disk to write it to. */
export function writeLogFile(name, content) {
  if (USE_POSTGRES) return;
  fs.writeFileSync(path.join(LOG_DIR, name), content, 'utf-8');
}

export function logDir() {
  return LOG_DIR;
}
