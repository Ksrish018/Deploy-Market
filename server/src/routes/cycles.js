import express from 'express';
import { getState, saveState } from '../db.js';
import { id } from '../ids.js';
import { findCycle, pushAudit, cycleSummary, isCutoffPassed } from '../helpers.js';
import { buildGraph } from '../graph.js';
import { isoWeekInfo } from '../seed.js';

const router = express.Router();

router.get('/cycles', async (req, res) => {
  const state = await getState();
  res.json(state.cycles.map((c) => cycleSummary(state, c)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

router.post('/cycles', async (req, res) => {
  const state = await getState();
  const { actor = 'Unknown', role = 'Unknown', minItems = 10 } = req.body || {};

  const latest = [...state.cycles].sort((a, b) => new Date(b.weekEnd) - new Date(a.weekEnd))[0];
  const baseDate = latest ? new Date(new Date(latest.weekEnd).getTime() + 3 * 24 * 3600 * 1000) : new Date();
  const { label, monday, friday } = isoWeekInfo(baseDate);
  const cutoff = new Date(monday);
  cutoff.setUTCDate(monday.getUTCDate() + 2);
  cutoff.setUTCHours(17, 0, 0, 0);

  const cycle = {
    id: id('cyc'),
    weekLabel: label,
    weekStart: monday.toISOString(),
    weekEnd: friday.toISOString(),
    state: 'collecting',
    cutoffAt: cutoff.toISOString(),
    minItems,
    createdBy: actor,
    createdAt: new Date().toISOString(),
    compiledAt: null,
  };
  state.cycles.push(cycle);
  pushAudit(state, { actor, role, action: 'cycle_created', entity: 'cycle', entityId: cycle.id, after: cycle, cycleId: cycle.id });
  await saveState(state);
  res.status(201).json(cycleSummary(state, cycle));
});

router.get('/cycles/:cycleId', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  res.json(cycleSummary(state, cycle));
});

router.post('/cycles/:cycleId/mark-compiled', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  const { actor = 'Unknown', role = 'Unknown' } = req.body || {};

  const itemCount = state.items.filter((i) => i.cycleId === cycle.id).length;
  const before = { ...cycle };
  cycle.state = 'compiled';
  cycle.compiledAt = new Date().toISOString();
  pushAudit(state, { actor, role, action: 'cycle_marked_compiled', entity: 'cycle', entityId: cycle.id, before, after: cycle, cycleId: cycle.id });
  await saveState(state);
  res.json({
    ...cycleSummary(state, cycle),
    warning: itemCount < cycle.minItems ? `Marked compiled with only ${itemCount}/${cycle.minItems} items — below the usual minimum.` : null,
  });
});

router.post('/cycles/:cycleId/assign-collection', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  const { actor = 'Unknown', role = 'Unknown', assignee = 'Collector', dueAt, note = '' } = req.body || {};

  const task = {
    id: id('task'),
    cycleId: cycle.id,
    type: 'compile_week',
    assignee,
    dueAt: dueAt || cycle.cutoffAt,
    note,
    status: 'open',
    createdBy: actor,
    createdAt: new Date().toISOString(),
  };
  state.tasks.push(task);
  pushAudit(state, { actor, role, action: 'collection_assigned', entity: 'task', entityId: task.id, after: task, cycleId: cycle.id });
  await saveState(state);
  res.status(201).json(task);
});

router.patch('/cycles/:cycleId/tasks/:taskId', async (req, res) => {
  const state = await getState();
  const task = state.tasks.find((t) => t.id === req.params.taskId && t.cycleId === req.params.cycleId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const { status = 'done', actor = 'Unknown', role = 'Unknown' } = req.body || {};
  const before = { ...task };
  task.status = status;
  task.completedAt = status === 'done' ? new Date().toISOString() : task.completedAt;
  pushAudit(state, { actor, role, action: 'task_updated', entity: 'task', entityId: task.id, before, after: task, cycleId: task.cycleId });
  await saveState(state);
  res.json(task);
});

router.get('/cycles/:cycleId/tasks', async (req, res) => {
  const state = await getState();
  res.json(state.tasks.filter((t) => t.cycleId === req.params.cycleId));
});

router.get('/cycles/:cycleId/graph', async (req, res) => {
  const state = await getState();
  const cycle = findCycle(state, req.params.cycleId);
  if (!cycle) return res.status(404).json({ error: 'Cycle not found' });
  res.json(buildGraph(state, cycle));
});

export default router;
