import { isCutoffPassed } from './helpers.js';

// Builds the live workflow graph (§11) — one node per pipeline stage, each
// with a state (idle/running/needs-human/blocked/done) and an item count.
export function buildGraph(state, cycle) {
  const items = state.items.filter((i) => i.cycleId === cycle.id);
  const signals = state.signals.filter((s) => s.cycleId === cycle.id);
  const contextPriorities = state.contextPriorities.filter((c) => c.cycleId === cycle.id);
  const openTasks = state.tasks.filter((t) => t.cycleId === cycle.id && t.status === 'open');
  const nonSignals = items.filter((i) => i.status === 'non_signal');
  const pendingItems = items.filter((i) => i.status === 'pending');
  const proposedSignals = signals.filter((s) => s.status === 'proposed');
  const needsHumanSignals = signals.filter((s) => s.status === 'proposed' && (s.needs_review || s.tier === 'high'));
  const confirmedSignals = signals.filter((s) => s.status === 'confirmed');
  const approvedSignals = signals.filter((s) => s.approved);
  const brief = [...state.briefs].filter((b) => b.cycleId === cycle.id).sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt))[0];

  const blocked = isCutoffPassed(cycle);

  const gateState = blocked ? 'blocked' : (cycle.state === 'collecting' ? 'running' : 'done');

  const nodes = [
    {
      stage: 'stage0_gate',
      label: 'Readiness gate',
      state: gateState,
      count: openTasks.length,
      detail: blocked ? 'Cutoff passed — week not compiled. Assign collection.' : (cycle.state === 'collecting' ? 'Collecting this week’s items.' : 'Week compiled.'),
    },
    {
      stage: 'input_intake',
      label: 'Intake (Collector)',
      state: items.length > 0 ? 'done' : 'idle',
      count: items.length,
      detail: `${items.length} item(s) captured this cycle.`,
    },
    {
      stage: 'input_context',
      label: 'Priority context & weights',
      state: contextPriorities.length > 0 ? 'done' : 'idle',
      count: contextPriorities.filter((c) => c.active).length,
      detail: `${contextPriorities.filter((c) => c.active).length} active priorit${contextPriorities.filter((c) => c.active).length === 1 ? 'y' : 'ies'}.`,
    },
    {
      stage: 'stage3_analysis',
      label: 'AI analysis',
      state: cycle.state === 'collecting' ? 'idle' : (pendingItems.length > 0 ? 'running' : 'done'),
      count: pendingItems.length,
      detail: pendingItems.length > 0 ? `${pendingItems.length} item(s) waiting on a run.` : 'All items classified.',
    },
    {
      stage: 'stage4_filter',
      label: 'Filter (non-signals)',
      state: nonSignals.length > 0 ? 'done' : 'idle',
      count: nonSignals.length,
      detail: `${nonSignals.length} logged as non-signal.`,
    },
    {
      stage: 'stage4b_scoring',
      label: 'Weighted scoring',
      state: signals.length > 0 ? 'done' : 'idle',
      count: signals.length,
      detail: `${signals.length} scored signal(s).`,
    },
    {
      stage: 'stage5_writeback',
      label: 'Write-back (owner + action)',
      state: signals.length > 0 ? 'done' : 'idle',
      count: signals.length,
      detail: 'Owner, action, deadline attached.',
    },
    {
      stage: 'stage6_review',
      label: 'Human checkpoint',
      state: needsHumanSignals.length > 0 ? 'needs-human' : (proposedSignals.length > 0 ? 'running' : 'done'),
      count: proposedSignals.length,
      detail: `${proposedSignals.length} awaiting confirmation (${needsHumanSignals.length} need senior/careful review).`,
    },
    {
      stage: 'stage7_queue',
      label: 'Priority queue',
      state: confirmedSignals.length > 0 ? 'done' : 'idle',
      count: confirmedSignals.length,
      detail: `${confirmedSignals.length} confirmed signal(s).`,
    },
    {
      stage: 'stage8_brief',
      label: 'Approved brief',
      state: brief ? 'done' : (approvedSignals.length > 0 ? 'running' : 'idle'),
      count: approvedSignals.length,
      detail: brief ? `Brief generated ${brief.generatedAt}.` : `${approvedSignals.length} approved, brief not yet generated.`,
    },
    {
      stage: 'stage9_metrics',
      label: 'Outcome & metrics',
      state: 'idle',
      count: signals.length,
      detail: 'See Dashboard metrics tiles.',
    },
  ];

  return { cycleId: cycle.id, nodes };
}
