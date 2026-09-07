import express from 'express';
import { getState, saveState } from '../db.js';
import { id } from '../ids.js';
import { findCycle, pushAudit } from '../helpers.js';

const router = express.Router();

router.get('/cycles/:cycleId/context', async (req, res) => {
  const state = await getState();
  res.json(state.contextPriorities.filter((c) => c.cycleId === req.params.cycleId));
});

router.post('/cycles/:cycleId/context', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  const { text, actor = 'Unknown', role = 'Unknown' } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  const priority = { id: id('ctx'), cycleId: cycle.id, text: text.trim(), active: true, createdBy: actor, createdAt: new Date().toISOString() };
  state.contextPriorities.push(priority);
  pushAudit(state, { actor, role, action: 'priority_added', entity: 'context_priority', entityId: priority.id, after: priority, cycleId: cycle.id });
  await saveState(state);
  res.status(201).json(priority);
});

router.patch('/context/:contextId', async (req, res) => {
  const state = await getState();
  const priority = state.contextPriorities.find((c) => c.id === req.params.contextId);
  if (!priority) return res.status(404).json({ error: 'Priority not found' });
  const { text, active, actor = 'Unknown', role = 'Unknown' } = req.body || {};
  const before = { ...priority };
  if (text !== undefined) priority.text = text;
  if (active !== undefined) priority.active = active;
  pushAudit(state, { actor, role, action: 'priority_edited', entity: 'context_priority', entityId: priority.id, before, after: priority, cycleId: priority.cycleId });
  await saveState(state);
  res.json(priority);
});

router.delete('/context/:contextId', async (req, res) => {
  const state = await getState();
  const idx = state.contextPriorities.findIndex((c) => c.id === req.params.contextId);
  if (idx === -1) return res.status(404).json({ error: 'Priority not found' });
  const [removed] = state.contextPriorities.splice(idx, 1);
  const { actor = 'Unknown', role = 'Unknown' } = req.body || {};
  pushAudit(state, { actor, role, action: 'priority_removed', entity: 'context_priority', entityId: removed.id, before: removed, cycleId: removed.cycleId });
  await saveState(state);
  res.status(204).end();
});

export default router;
