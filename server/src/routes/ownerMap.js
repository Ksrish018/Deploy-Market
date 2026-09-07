import express from 'express';
import { getState, saveState } from '../db.js';
import { pushAudit } from '../helpers.js';

const router = express.Router();

router.get('/owner-map', async (req, res) => {
  const state = await getState();
  res.json(state.ownerMap);
});

// Context-keeper / leadership can reshape the default routing table itself
// (distinct from overriding a single signal — see PATCH /signals/:id).
router.put('/owner-map/:signalType', async (req, res) => {
  const state = await getState();
  const entry = state.ownerMap.find((o) => o.signalType === req.params.signalType);
  if (!entry) return res.status(404).json({ error: 'Signal type not found in owner map' });
  const { ownerRole, suggestedAction, responseWindow, actor = 'Unknown', role = 'Unknown' } = req.body || {};
  const before = { ...entry };
  if (ownerRole !== undefined) entry.ownerRole = ownerRole;
  if (suggestedAction !== undefined) entry.suggestedAction = suggestedAction;
  if (responseWindow !== undefined) entry.responseWindow = responseWindow;
  pushAudit(state, { actor, role, action: 'owner_map_edited', entity: 'owner_map', entityId: entry.signalType, before, after: entry });
  await saveState(state);
  res.json(entry);
});

export default router;
