import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isSea } from './sea.js';

import cyclesRouter from './routes/cycles.js';
import itemsRouter from './routes/items.js';
import contextRouter from './routes/context.js';
import weightsRouter from './routes/weights.js';
import ownerMapRouter from './routes/ownerMap.js';
import analysisRouter from './routes/analysis.js';
import signalsRouter from './routes/signals.js';
import briefRouter from './routes/brief.js';
import digestRouter from './routes/digest.js';
import metricsRouter from './routes/metrics.js';
import auditRouter from './routes/audit.js';
import adminRouter from './routes/admin.js';

// The Express app itself, with no `.listen()` call — that's added by
// whichever entry point actually runs it: src/index.js for local/.exe/Docker
// (a real long-lived process), or the root-level api/index.js for Vercel
// (a serverless function — Vercel's @vercel/node builder invokes the
// exported app directly per-request, it never listens on a port itself).
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api', cyclesRouter);
app.use('/api', itemsRouter);
app.use('/api', contextRouter);
app.use('/api', weightsRouter);
app.use('/api', ownerMapRouter);
app.use('/api', analysisRouter);
app.use('/api', signalsRouter);
app.use('/api', briefRouter);
app.use('/api', digestRouter);
app.use('/api', metricsRouter);
app.use('/api', auditRouter);
app.use('/api', adminRouter);

// When a built client sits alongside this file (server/public), serve it
// directly so the whole app is one process/function on one origin. In
// normal `npm run dev` this folder doesn't exist (Vite's own dev server +
// proxy handles the client instead) — a harmless no-op there.
//
// On Vercel specifically: `__dirname` can't be trusted here, because
// @vercel/node bundles this file (and everything it imports) into one
// compiled function file, and `__dirname` then resolves relative to *that
// bundle's* location — not this source file's original repo path — so a
// `../public`-style relative walk silently points at the wrong directory.
// `process.cwd()` is Vercel's documented, bundler-independent function root
// (mirroring the repo layout for files listed in `includeFiles`), which is
// exactly why vercel.json ships `server/public` via `includeFiles` and this
// resolves it the same way, by the one path that's actually reliable there.
const __dirname = typeof __filename !== 'undefined' ? path.dirname(__filename) : path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = isSea()
  ? path.join(path.dirname(process.execPath), 'public')
  : process.env.VERCEL
    ? path.join(process.cwd(), 'server', 'public')
    : path.join(__dirname, '../public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

export default app;
