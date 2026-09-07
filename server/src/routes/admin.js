import express from 'express';
import { resetState } from '../db.js';

const router = express.Router();

// Destructive, irreversible: wipes every cycle, item, signal, brief, task,
// weight-profile version, and audit-log entry, and reseeds a fresh
// current-week cycle. The client requires the user to type "RESET" before
// calling this — there's no undo on the server side once it runs.
router.post('/admin/reset', async (req, res) => {
  const { actor = 'Unknown', role = 'Unknown' } = req.body || {};
  console.log(`[admin] Full data reset triggered by ${actor} (${role}) at ${new Date().toISOString()}`);
  const fresh = await resetState();
  res.json({ ok: true, cycle: fresh.cycles[0] });
});

export default router;
