import express from 'express';
import { getState, saveState } from '../db.js';
import { id } from '../ids.js';
import { pushAudit } from '../helpers.js';
import { rescoreForProfile } from '../classifier.js';

const router = express.Router();

router.get('/weight-profiles', async (req, res) => {
  const state = await getState();
  res.json([...state.weightProfiles].sort((a, b) => b.version - a.version));
});

router.get('/weight-profiles/active', async (req, res) => {
  const state = await getState();
  const active = state.weightProfiles.find((p) => p.active);
  res.json(active || null);
});

router.post('/weight-profiles', async (req, res) => {
  const state = await getState();
  const { name = 'Untitled profile', categoryWeights, multiplier = 1.5, thresholds, notes = '', actor = 'Unknown', role = 'Unknown' } = req.body || {};
  if (!categoryWeights) return res.status(400).json({ error: 'categoryWeights is required' });

  const maxVersion = Math.max(0, ...state.weightProfiles.map((p) => p.version));
  const previousActive = state.weightProfiles.find((p) => p.active);
  const profile = {
    id: id('wp'),
    version: maxVersion + 1,
    name,
    categoryWeights,
    multiplier,
    thresholds: thresholds || { high: 6, medium: 3 },
    active: true,
    createdBy: actor,
    createdAt: new Date().toISOString(),
    notes,
  };
  state.weightProfiles.forEach((p) => { p.active = false; });
  state.weightProfiles.push(profile);
  pushAudit(state, { actor, role, action: 'weight_profile_published', entity: 'weight_profile', entityId: profile.id, before: previousActive, after: profile });
  await saveState(state);
  res.status(201).json(profile);
});

router.post('/weight-profiles/:profileId/activate', async (req, res) => {
  const state = await getState();
  const profile = state.weightProfiles.find((p) => p.id === req.params.profileId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  const { actor = 'Unknown', role = 'Unknown' } = req.body || {};
  const previousActive = state.weightProfiles.find((p) => p.active);
  state.weightProfiles.forEach((p) => { p.active = false; });
  profile.active = true;
  pushAudit(state, { actor, role, action: 'weight_profile_activated', entity: 'weight_profile', entityId: profile.id, before: previousActive, after: profile });
  await saveState(state);
  res.json(profile);
});

// Re-scores all not-yet-confirmed signals in a cycle under the current active profile.
router.post('/weight-profiles/rescore-pending', async (req, res) => {
  const state = await getState();
  const { cycleId, actor = 'Unknown', role = 'Unknown' } = req.body || {};
  const active = state.weightProfiles.find((p) => p.active);
  if (!active) return res.status(400).json({ error: 'No active weight profile' });

  const contextPriorities = state.contextPriorities.filter((c) => c.cycleId === cycleId);
  const targets = state.signals.filter((s) => s.cycleId === cycleId && s.status === 'proposed');
  let changed = 0;
  for (const sig of targets) {
    const before = { severity_score: sig.severity_score, tier: sig.tier, weight_profile_version: sig.weight_profile_version };
    const rescored = rescoreForProfile(sig, active, contextPriorities);
    Object.assign(sig, rescored, { weight_profile_version: active.version });
    if (before.tier !== sig.tier || before.severity_score !== sig.severity_score) {
      changed++;
      pushAudit(state, { actor, role, action: 'signal_rescored', entity: 'signal', entityId: sig.id, before, after: { severity_score: sig.severity_score, tier: sig.tier, weight_profile_version: sig.weight_profile_version }, cycleId });
    }
  }
  await saveState(state);
  res.json({ rescored: targets.length, changed, activeProfileVersion: active.version });
});

export default router;
