import { createRequire } from 'module';

// A real `require` global already exists once esbuild bundles this to CJS
// (for the .exe build) — use it directly there. Only fall back to
// `createRequire(import.meta.url)` in genuine ESM (dev/npm/Docker), where
// `import.meta.url` is actually valid; in the bundled CJS output it becomes
// empty, and calling createRequire with that throws immediately at
// module-load time — so this must not run unless we're really in ESM.
const req = typeof require !== 'undefined' ? require : createRequire(import.meta.url);

/**
 * True only when running inside a Node "Single Executable Application"
 * binary (our .exe build). Uses a lazy require inside a try/catch instead
 * of a static `import 'node:sea'` — a static import would be resolved
 * eagerly at module-load time on *every* platform this code runs on
 * (local dev, Docker/Fly.io, Vercel serverless), and would crash the whole
 * app outright on any Node runtime where `node:sea` doesn't exist (it only
 * landed in Node 20.12+). This way, an unsupported runtime just quietly
 * reports "not packaged" instead of failing to start.
 */
export function isSea() {
  try {
    return req('node:sea').isSea();
  } catch {
    return false;
  }
}
