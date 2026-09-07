import express from 'express';
import { getState } from '../db.js';

const router = express.Router();

router.get('/audit-log', async (req, res) => {
  const state = await getState();
  let log = state.auditLog;
  if (req.query.cycleId) log = log.filter((a) => a.cycleId === req.query.cycleId);
  const limit = parseInt(req.query.limit, 10) || 200;
  res.json([...log].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit));
});

export default router;
