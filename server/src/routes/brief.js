import express from 'express';
import { getState, saveState } from '../db.js';
import { id } from '../ids.js';
import { findCycle, pushAudit, sortBySeverity } from '../helpers.js';
import { buildBriefWorkbook, buildRunLogWorkbook } from '../excel.js';

const router = express.Router();

router.get('/cycles/:cycleId/queue', async (req, res) => {
  const state = await getState();
  const confirmed = state.signals.filter((s) => s.cycleId === req.params.cycleId && s.status === 'confirmed');
  res.json(sortBySeverity(confirmed));
});

router.post('/cycles/:cycleId/approve', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  const { actor = 'Unknown', role = 'Unknown', signalIds } = req.body || {};

  const targets = signalIds && signalIds.length
    ? state.signals.filter((s) => signalIds.includes(s.id) && s.cycleId === cycle.id)
    : state.signals.filter((s) => s.cycleId === cycle.id && s.status === 'confirmed' && !s.approved);

  if (targets.length === 0) return res.status(400).json({ error: 'No confirmed, unapproved signals to approve.' });

  const now = new Date().toISOString();
  targets.forEach((s) => { s.approved = true; s.approvedBy = actor; s.approvedAt = now; });

  const approval = { id: id('apr'), cycleId: cycle.id, approver: actor, approverRole: role, approvedAt: now, signalIds: targets.map((s) => s.id) };
  state.approvals.push(approval);
  cycle.state = 'approved';

  pushAudit(state, { actor, role, action: 'signals_approved', entity: 'approval', entityId: approval.id, after: { count: targets.length }, cycleId: cycle.id });
  await saveState(state);
  res.status(201).json(approval);
});

function assembleBriefData(state, cycle) {
  const contextPriorities = state.contextPriorities.filter((c) => c.cycleId === cycle.id && c.active);
  const approvedSignals = sortBySeverity(state.signals.filter((s) => s.cycleId === cycle.id && s.approved));
  const versions = [...new Set(approvedSignals.map((s) => s.weight_profile_version))];
  const weightProfiles = state.weightProfiles.filter((p) => versions.includes(p.version));
  const runLogs = state.runLogs.filter((r) => r.cycleId === cycle.id).sort((a, b) => new Date(a.runAt) - new Date(b.runAt));
  const nonSignalItems = state.items.filter((i) => i.cycleId === cycle.id && i.status === 'non_signal');
  const approvals = state.approvals.filter((a) => a.cycleId === cycle.id);
  return { contextPriorities, approvedSignals, weightProfiles, runLogs, nonSignalItems, approvals };
}

router.post('/cycles/:cycleId/brief/generate', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  const { actor = 'Unknown', role = 'Unknown' } = req.body || {};

  const { approvedSignals, weightProfiles, approvals } = assembleBriefData(state, cycle);
  if (approvedSignals.length === 0) {
    return res.status(400).json({ error: 'A cycle cannot produce a brief until at least one signal is approved.' });
  }

  const brief = {
    id: id('brf'),
    cycleId: cycle.id,
    generatedAt: new Date().toISOString(),
    generatedBy: actor,
    generatedByRole: role,
    weekLabel: cycle.weekLabel,
    signalIds: approvedSignals.map((s) => s.id),
    weightProfileVersions: weightProfiles.map((p) => p.version),
    approvalIds: approvals.map((a) => a.id),
  };
  state.briefs.push(brief);
  pushAudit(state, { actor, role, action: 'brief_generated', entity: 'brief', entityId: brief.id, after: { signalCount: approvedSignals.length }, cycleId: cycle.id });
  await saveState(state);
  res.status(201).json(brief);
});

function latestBrief(state, cycleId) {
  return state.briefs.filter((b) => b.cycleId === cycleId).sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt))[0];
}

router.get('/cycles/:cycleId/brief/latest', async (req, res) => {
  const state = await getState();
  const brief = latestBrief(state, req.params.cycleId);
  if (!brief) return res.status(404).json({ error: 'No brief generated yet for this cycle.' });
  const signals = state.signals.filter((s) => brief.signalIds.includes(s.id));
  res.json({ brief, signals: sortBySeverity(signals) });
});

router.get('/cycles/:cycleId/brief/:briefId', async (req, res) => {
  const state = await getState();
  const brief = state.briefs.find((b) => b.id === req.params.briefId && b.cycleId === req.params.cycleId);
  if (!brief) return res.status(404).json({ error: 'Brief not found' });
  const signals = state.signals.filter((s) => brief.signalIds.includes(s.id));
  res.json({ brief, signals: sortBySeverity(signals) });
});

function briefExportData(state, cycle, brief) {
  const signals = sortBySeverity(state.signals.filter((s) => brief.signalIds.includes(s.id)));
  const contextPriorities = state.contextPriorities.filter((c) => c.cycleId === cycle.id && c.active);
  const weightProfiles = state.weightProfiles.filter((p) => brief.weightProfileVersions.includes(p.version));
  const runLogs = state.runLogs.filter((r) => r.cycleId === cycle.id).sort((a, b) => new Date(a.runAt) - new Date(b.runAt));
  const nonSignalItems = state.items.filter((i) => i.cycleId === cycle.id && i.status === 'non_signal');
  const approvals = state.approvals.filter((a) => brief.approvalIds.includes(a.id));
  return { signals, contextPriorities, weightProfiles, runLogs, nonSignalItems, approvals };
}

router.get('/cycles/:cycleId/brief/:briefId/export.xlsx', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  const brief = state.briefs.find((b) => b.id === req.params.briefId && b.cycleId === req.params.cycleId);
  if (!cycle || !brief) return res.status(404).json({ error: 'Not found' });

  const data = briefExportData(state, cycle, brief);
  const wb = buildBriefWorkbook({ cycle, ...data });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Market-Signal-Brief-${cycle.weekLabel.replace(/[^a-z0-9]+/gi, '-')}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

router.get('/cycles/:cycleId/brief/:briefId/export.md', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  const brief = state.briefs.find((b) => b.id === req.params.briefId && b.cycleId === req.params.cycleId);
  if (!cycle || !brief) return res.status(404).json({ error: 'Not found' });
  const { signals, contextPriorities, weightProfiles, approvals } = briefExportData(state, cycle, brief);

  const lines = [
    `# Weekly Market Signal Brief — ${cycle.weekLabel}`,
    '',
    `Generated ${brief.generatedAt} by ${brief.generatedBy} (${brief.generatedByRole})`,
    '',
    '## Active priorities',
    ...(contextPriorities.length ? contextPriorities.map((p) => `- ${p.text}`) : ['- (none set)']),
    '',
    `## Weight profile version(s): ${weightProfiles.map((p) => `v${p.version} (${p.name})`).join(', ')}`,
    '',
    '## Approved signals',
    '',
    '| Tier | Owner | Action | Deadline | Why it matters |',
    '|---|---|---|---|---|',
    ...signals.map((s) => `| ${s.tier.toUpperCase()} | ${s.owner_role} | ${s.suggested_action} | ${new Date(s.deadline).toLocaleString()} | ${s.why_it_matters} |`),
    '',
    '## Sign-off',
    ...approvals.map((a) => `- Approved by ${a.approver} (${a.approverRole}) at ${a.approvedAt}`),
  ];
  res.setHeader('Content-Type', 'text/markdown');
  res.setHeader('Content-Disposition', `attachment; filename="Market-Signal-Brief-${cycle.weekLabel.replace(/[^a-z0-9]+/gi, '-')}.md"`);
  res.send(lines.join('\n'));
});

router.get('/cycles/:cycleId/run-logs', async (req, res) => {
  const state = await getState();
  res.json(state.runLogs.filter((r) => r.cycleId === req.params.cycleId).sort((a, b) => new Date(b.runAt) - new Date(a.runAt)));
});

router.get('/cycles/:cycleId/run-logs/export.xlsx', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  const runLogs = state.runLogs.filter((r) => r.cycleId === cycle.id).sort((a, b) => new Date(a.runAt) - new Date(b.runAt));
  const wb = buildRunLogWorkbook(cycle, runLogs);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Run-Log-${cycle.weekLabel.replace(/[^a-z0-9]+/gi, '-')}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

router.get('/archive/non-signals', async (req, res) => {
  const state = await getState();
  let items = state.items.filter((i) => i.status === 'non_signal');
  const q = (req.query.q || '').toLowerCase();
  if (q) items = items.filter((i) => i.rawText.toLowerCase().includes(q));
  res.json(items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

router.get('/archive/briefs', async (req, res) => {
  const state = await getState();
  res.json(state.briefs.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt)));
});

export default router;
