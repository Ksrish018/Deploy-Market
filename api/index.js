// Vercel serverless entry point. Vercel's Node.js builder invokes whatever
// this file default-exports directly as the request handler — Express apps
// are callable as (req, res), so exporting the shared app as-is just works,
// with no .listen() call (there's no port to listen on in a function).
import app from '../server/src/app.js';

export default app;
