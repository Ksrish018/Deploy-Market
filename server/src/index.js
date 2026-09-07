// Local/.exe/Docker entry point: actually listens on a port. (Vercel's
// serverless deploy never runs this file — it imports app.js directly,
// see /api/index.js at the project root.)
import { exec } from 'child_process';
import app from './app.js';
import { isSea } from './sea.js';

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Market Signal Triage listening on ${url}`);
  // Only auto-open a browser tab inside the compiled .exe — never during
  // `npm run dev`, where Node's --watch would otherwise pop a new tab on
  // every file save.
  if (isSea()) {
    exec(`start "" "${url}"`);
  }
});
