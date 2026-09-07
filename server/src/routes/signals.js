import express from 'express';
import { getState, saveState } from '../db.js';
import { pushAudit, sortBySeverity } from '../helpers.js';
import { computeDeadline } from '../deadlines.js';

const router = express.Router();

router.get('/cycles/:cycleId/signals', async (req, res) => {
  const state = await getState();
  let signals = state.signals.filter((s) => s.cycleId === req.params.cycleId);
  if (req.query.status) signals = signals.filter((s) => s.status === req.query.status);
  if (req.query.tier) signals = signals.filter((s) => s.tier === req.query.tier);
  res.json(sortBySeverity(signals));
});

router.get('/signals/:signalId', async (req, res) => {
  const state = await getState();
  const signal = state.signals.find((s) => s.id === req.params.signalId);
  if (!signal) return res.status(404).json({ error: 'Signal not found' });
  res.json(signal);
});

router.post('/signals/:signalId/confirm', async (req, res) => {
  const state = await getState();
  const signal = state.signals.find((s) => s.id === req.params.signalId);
  if (!signal) return res.status(404).json({ error: 'Signal not found' });
  const { actor = 'Unknown', role = 'Unknown', note = '' } = req.body || {};
  const before = { status: signal.status };
  signal.status = 'confirmed';
  signal.reviewedBy = actor;
  signal.reviewedByRole = role;
  signal.reviewedAt = new Date().toISOString();
  signal.reviewNote = note;
  pushAudit(state, { actor, role, action: 'signal_confirmed', entity: 'signal', entityId: signal.id, before, after: { status: signal.status }, cycleId: signal.cycleId });
  await saveState(state);
  res.json(signal);
});

router.post('/signals/:signalId/dismiss', async (req, res) => {
  const state = await getState();
  const signal = state.signals.find((s) => s.id === req.params.signalId);
  if (!signal) return res.status(404).json({ error: 'Signal not found' });
  const { actor = 'Unknown', role = 'Unknown', note = '' } = req.body || {};
  const before = { status: signal.status };
  signal.status = 'dismissed';
  signal.reviewedBy = actor;
  signal.reviewedByRole = role;
  signal.reviewedAt = new Date().toISOString();
  signal.reviewNote = note;
  pushAudit(state, { actor, role, action: 'signal_dismissed', entity: 'signal', entityId: signal.id, before, after: { status: signal.status }, cycleId: signal.cycleId });
  await saveState(state);
  res.json(signal);
});

// The context-keeper (or anyone, per the app's permission model) can hand-assign
// an owner/action/deadline/tier on a specific signal — overriding the table lookup.
router.patch('/signals/:signalId', async (req, res) => {
  const state = await getState();
  const signal = state.signals.find((s) => s.id === req.params.signalId);
  if (!signal) return res.status(404).json({ error: 'Signal not found' });
  const { owner_role, suggested_action, response_window, tier, deadline, actor = 'Unknown', role = 'Unknown', reason = '' } = req.body || {};

  const before = {
    owner_role: signal.owner_role,
    suggested_action: signal.suggested_action,
    response_window: signal.response_window,
    tier: signal.tier,
    deadline: signal.deadline,
  };

  if (owner_role !== undefined) signal.owner_role = owner_role;
  if (suggested_action !== undefined) signal.suggested_action = suggested_action;
  if (tier !== undefined) signal.tier = tier;
  if (response_window !== undefined) {
    signal.response_window = response_window;
    signal.deadline = deadline || computeDeadline(response_window, new Date());
  } else if (deadline !== undefined) {
    signal.deadline = deadline;
  }

  signal.manuallyEdited = true;
  signal.editHistory = signal.editHistory || [];
  signal.editHistory.push({ at: new Date().toISOString(), actor, role, reason, before, after: { owner_role: signal.owner_role, suggested_action: signal.suggested_action, response_window: signal.response_window, tier: signal.tier, deadline: signal.deadline } });

  pushAudit(state, { actor, role, action: 'signal_manually_reassigned', entity: 'signal', entityId: signal.id, before, after: signal.editHistory[signal.editHistory.length - 1].after, cycleId: signal.cycleId });
  await saveState(state);
  res.json(signal);
});

router.post('/cycles/:cycleId/signals/bulk-confirm', async (req, res) => {
  const state = await getState();
  const { signalIds = [], actor = 'Unknown', role = 'Unknown' } = req.body || {};
  const confirmed = [];
  for (const sid of signalIds) {
    const signal = state.signals.find((s) => s.id === sid && s.cycleId === req.params.cycleId);
    if (!signal) continue;
    signal.status = 'confirmed';
    signal.reviewedBy = actor;
    signal.reviewedByRole = role;
    signal.reviewedAt = new Date().toISOString();
    confirmed.push(signal.id);
  }
  pushAudit(state, { actor, role, action: 'signals_bulk_confirmed', entity: 'signal', entityId: confirmed.join(','), after: { count: confirmed.length }, cycleId: req.params.cycleId });
  await saveState(state);
  res.json({ confirmed });
});

export default router;
