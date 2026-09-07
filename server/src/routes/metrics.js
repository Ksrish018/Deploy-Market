import express from 'express';
import { getState } from '../db.js';

const router = express.Router();

function median(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

router.get('/cycles/:cycleId/metrics', async (req, res) => {
  const state = await getState();
  const signals = state.signals.filter((s) => s.cycleId === req.params.cycleId);
  const items = state.items.filter((i) => i.cycleId === req.params.cycleId);
  const reviewed = signals.filter((s) => s.status === 'confirmed' || s.status === 'dismissed');
  const confirmed = signals.filter((s) => s.status === 'confirmed');

  const actionableSignalRate = reviewed.length ? Math.round((confirmed.length / reviewed.length) * 1000) / 10 : null;

  const surfaceTimesHrs = confirmed
    .filter((s) => s.reviewedAt)
    .map((s) => {
      const item = state.items.find((i) => i.id === s.itemId);
      if (!item) return null;
      return (new Date(s.reviewedAt) - new Date(item.createdAt)) / 3600000;
    })
    .filter((v) => v !== null);
  const timeToSurfaceMedianHrs = median(surfaceTimesHrs);

  const overrideRate = signals.length ? Math.round((signals.filter((s) => s.manuallyEdited).length / signals.length) * 1000) / 10 : null;

  const actNowVolume = signals.filter((s) => s.tier === 'high' && s.status !== 'dismissed').length;

  const customerConfirmed = confirmed.filter((s) => s.sourceType === 'customer_conversation').length;
  const beatenByCustomerRate = confirmed.length ? Math.round((customerConfirmed / confirmed.length) * 1000) / 10 : null;

  res.json({
    actionableSignalRate,
    timeToSurfaceMedianHrs,
    overrideRate,
    actNowVolume,
    beatenByCustomerRate,
    totals: {
      items: items.length,
      signals: signals.length,
      confirmed: confirmed.length,
      dismissed: signals.filter((s) => s.status === 'dismissed').length,
      proposed: signals.filter((s) => s.status === 'proposed').length,
      nonSignals: items.filter((i) => i.status === 'non_signal').length,
    },
    note: 'actionableSignalRate/beatenByCustomerRate are in-app proxies (based on confirm/dismiss + source type), not external owner surveys — see README.',
  });
});

export default router;
