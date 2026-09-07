import express from 'express';
import { getState, saveState } from '../db.js';
import { id } from '../ids.js';
import { findCycle, pushAudit } from '../helpers.js';
import { normalizeForDedupe, jaccardSimilarity } from '../classifier.js';

const router = express.Router();
const DEDUPE_WINDOW_DAYS = 30;
const DEDUPE_SIMILARITY_THRESHOLD = 0.8;

function findDuplicate(state, normalizedText) {
  const cutoff = Date.now() - DEDUPE_WINDOW_DAYS * 24 * 3600 * 1000;
  let best = null;
  let bestScore = 0;
  for (const item of state.items) {
    if (new Date(item.createdAt).getTime() < cutoff) continue;
    const score = jaccardSimilarity(normalizedText, item.normalizedText || '');
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= DEDUPE_SIMILARITY_THRESHOLD ? best : null;
}

function createItem(state, cycle, { rawText, sourceType, actor, role }) {
  const normalizedText = normalizeForDedupe(rawText);
  const dup = findDuplicate(state, normalizedText);

  if (dup) {
    dup.mentionCount = (dup.mentionCount || 1) + 1;
    dup.lastMentionedAt = new Date().toISOString();
    pushAudit(state, { actor, role, action: 'item_merged_as_repeat', entity: 'item', entityId: dup.id, after: { mentionCount: dup.mentionCount }, cycleId: dup.cycleId });

    // A repeated mention should raise urgency, not create a duplicate row.
    const sig = state.signals.find((s) => s.itemId === dup.id);
    if (sig) {
      const before = { severity_score: sig.severity_score, tier: sig.tier };
      sig.severity_score = Math.min(10, Math.round((sig.severity_score + 0.5) * 10) / 10);
      sig.tier = sig.severity_score >= 6 ? 'high' : sig.severity_score >= 3 ? 'medium' : 'low';
      pushAudit(state, { actor, role, action: 'signal_bumped_by_repeat_mention', entity: 'signal', entityId: sig.id, before, after: { severity_score: sig.severity_score, tier: sig.tier }, cycleId: sig.cycleId });
    }
    return { item: dup, duplicate: true };
  }

  const item = {
    id: id('itm'),
    cycleId: cycle.id,
    rawText,
    normalizedText,
    sourceType: sourceType || 'other',
    status: 'pending', // pending | classified | non_signal
    mentionCount: 1,
    lastMentionedAt: null,
    createdBy: actor || 'Unknown',
    createdAt: new Date().toISOString(),
  };
  state.items.push(item);
  pushAudit(state, { actor, role, action: 'item_created', entity: 'item', entityId: item.id, after: item, cycleId: cycle.id });
  return { item, duplicate: false };
}

router.get('/cycles/:cycleId/items', async (req, res) => {
  const state = await getState();
  res.json(state.items.filter((i) => i.cycleId === req.params.cycleId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

router.post('/cycles/:cycleId/items', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  const { rawText, sourceType, actor = 'Unknown', role = 'Unknown' } = req.body || {};
  if (!rawText || !rawText.trim()) return res.status(400).json({ error: 'rawText is required' });

  const result = createItem(state, cycle, { rawText: rawText.trim(), sourceType, actor, role });
  await saveState(state);
  res.status(201).json(result);
});

// Collector convenience: paste several items separated by blank lines or "---".
router.post('/cycles/:cycleId/items/bulk', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  const { text, sourceType, actor = 'Unknown', role = 'Unknown' } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

  const blocks = text
    .split(/\n\s*(?:---+\s*)?\n|\n---+\n/g)
    .map((b) => b.trim())
    .filter(Boolean);

  const results = blocks.map((rawText) => createItem(state, cycle, { rawText, sourceType, actor, role }));
  await saveState(state);
  res.status(201).json({
    created: results.filter((r) => !r.duplicate).length,
    mergedAsRepeat: results.filter((r) => r.duplicate).length,
    items: results,
  });
});

export default router;
