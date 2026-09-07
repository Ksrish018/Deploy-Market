import express from 'express';
import { getState, saveState, writeLogFile } from '../db.js';
import { id } from '../ids.js';
import { findCycle, pushAudit } from '../helpers.js';
import { classifyItem } from '../classifier.js';
import { computeDeadline } from '../deadlines.js';

const router = express.Router();

function renderRunLogMarkdown(cycle, runLog) {
  const lines = [
    `# Run log — ${cycle.weekLabel}`,
    '',
    `- Run at: ${runLog.runAt}`,
    `- Triggered by: ${runLog.triggeredBy.actor} (${runLog.triggeredBy.role})`,
    `- Weight profile version: v${runLog.weightProfileVersion}`,
    `- Items processed: ${runLog.itemsProcessed}`,
    `- Signals created: ${runLog.signalsCreated}`,
    `- Non-signals (filtered): ${runLog.nonSignals}`,
    `- Tier breakdown: High ${runLog.tierCounts.high} · Medium ${runLog.tierCounts.medium} · Low ${runLog.tierCounts.low}`,
    `- Needing careful human review (low confidence): ${runLog.needsReviewCount}`,
    '',
    '## New signals this run',
    '',
  ];
  for (const s of runLog.signalSnapshots) {
    lines.push(`- **[${s.tier.toUpperCase()}]** ${s.signal_type} — owner: ${s.owner_role} — action: ${s.suggested_action} — due ${s.deadline}`);
  }
  return lines.join('\n');
}

router.post('/cycles/:cycleId/run-analysis', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  const { actor = 'Unknown', role = 'Unknown', confidenceThreshold = 0.5 } = req.body || {};

  if (cycle.state === 'collecting' || cycle.state === 'not_started') {
    return res.status(409).json({ error: 'This week is not compiled yet. The Context-keeper must assign collection, or the Collector must mark the week compiled, before analysis can run.' });
  }

  const activeProfile = state.weightProfiles.find((p) => p.active);
  if (!activeProfile) return res.status(400).json({ error: 'No active weight profile' });

  const contextPriorities = state.contextPriorities.filter((c) => c.cycleId === cycle.id);
  const pendingItems = state.items.filter((i) => i.cycleId === cycle.id && i.status === 'pending');

  const tierCounts = { high: 0, medium: 0, low: 0 };
  const signalSnapshots = [];
  let nonSignals = 0;
  let needsReviewCount = 0;

  for (const item of pendingItems) {
    const result = classifyItem(item.rawText, { weightProfile: activeProfile, contextPriorities, confidenceThreshold });

    if (!result.decision_relevant) {
      item.status = 'non_signal';
      item.nonSignalReason = result.why_it_matters;
      nonSignals++;
      continue;
    }

    const mapping = state.ownerMap.find((o) => o.signalType === result.signal_type) || {
      ownerRole: 'Unassigned — needs routing',
      suggestedAction: 'Review and assign an owner',
      responseWindow: 'this_week',
    };
    const deadline = computeDeadline(mapping.responseWindow, new Date());

    const signal = {
      id: id('sig'),
      itemId: item.id,
      cycleId: cycle.id,
      sourceText: item.rawText,
      sourceType: item.sourceType,
      ...result,
      owner_role: mapping.ownerRole,
      suggested_action: mapping.suggestedAction,
      response_window: mapping.responseWindow,
      deadline,
      weight_profile_version: activeProfile.version,
      status: 'proposed', // proposed | confirmed | dismissed
      approved: false,
      manuallyEdited: false,
      editHistory: [],
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: new Date().toISOString(),
    };
    state.signals.push(signal);
    item.status = 'classified';
    tierCounts[signal.tier]++;
    if (signal.needs_review) needsReviewCount++;
    signalSnapshots.push(signal);
  }

  if (cycle.state === 'compiled') cycle.state = 'triaged';

  const runLog = {
    id: id('run'),
    cycleId: cycle.id,
    runAt: new Date().toISOString(),
    triggeredBy: { actor, role },
    weightProfileVersion: activeProfile.version,
    itemsProcessed: pendingItems.length,
    signalsCreated: signalSnapshots.length,
    nonSignals,
    tierCounts,
    needsReviewCount,
    signalSnapshots: signalSnapshots.map((s) => ({ id: s.id, signal_type: s.signal_type, tier: s.tier, owner_role: s.owner_role, suggested_action: s.suggested_action, deadline: s.deadline })),
  };
  state.runLogs.push(runLog);

  pushAudit(state, { actor, role, action: 'analysis_run', entity: 'cycle', entityId: cycle.id, after: { itemsProcessed: runLog.itemsProcessed, signalsCreated: runLog.signalsCreated, nonSignals: runLog.nonSignals }, cycleId: cycle.id });

  await saveState(state);

  // Durable, human-readable copy on disk for the next meeting — independent of the JSON store.
  // A no-op on Postgres/serverless (see writeLogFile in db.js), so no need to branch here.
  try {
    writeLogFile(`run-${cycle.id}-${runLog.id}.md`, renderRunLogMarkdown(cycle, runLog));
  } catch (e) {
    console.error('[analysis] failed to write run log markdown:', e.message);
  }

  res.status(201).json({ runLog, cycle, createdSignals: signalSnapshots });
});

export default router;
