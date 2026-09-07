import express from 'express';
import { getState } from '../db.js';

const router = express.Router();

const BUCKETS = {
  pricing_financial: { exec: 'CFO', label: 'Financial' },
  funding_ma: { exec: 'CEO', label: 'M&A / Strategy' },
  product_feature: { exec: 'CTO', label: 'Product' },
};

// In-app batched view of confirmed High signals, grouped by exec bucket —
// the PRD's "one batched daily digest, split by type," rendered in-app
// (no outbound email/Slack integration in this build).
router.get('/cycles/:cycleId/digest', async (req, res) => {
  const state = await getState();
  const highConfirmed = state.signals.filter((s) => s.cycleId === req.params.cycleId && s.tier === 'high' && s.status === 'confirmed');

  const groups = {};
  for (const s of highConfirmed) {
    const bucket = BUCKETS[s.category] || { exec: 'Leadership', label: 'Other' };
    const key = `${bucket.exec}::${bucket.label}`;
    if (!groups[key]) groups[key] = { exec: bucket.exec, label: bucket.label, signals: [] };
    groups[key].signals.push(s);
  }

  res.json({ generatedAt: new Date().toISOString(), groups: Object.values(groups) });
});

export default router;
