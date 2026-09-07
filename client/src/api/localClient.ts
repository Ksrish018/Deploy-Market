// This module used to be a thin axios wrapper calling a real Express API.
// For the offline single-file build, every one of these functions now runs
// the same logic locally, against localStorage — but keeps the *exact*
// same exported names, signatures, and return shapes as before, so no page
// component needed to change at all.
import { getState, saveState, resetState } from '../local/store';
import { defaultOwnerMap, isoWeekInfo } from '../local/seed';
import { id } from '../local/id';
import { findCycle, pushAudit, sortBySeverity, cycleSummary } from '../local/helpers';
import { buildGraph } from '../local/graph';
import { classifyItem, rescoreForProfile, normalizeForDedupe, jaccardSimilarity } from '../local/classifier';
import { computeDeadline } from '../local/deadlines';
import { downloadBriefXlsx, downloadRunLogXlsx, downloadBriefMarkdown } from '../local/excel';
import type { AppState } from '../local/seed';
import type {
  Cycle, Item, Signal, ContextPriority, WeightProfile, OwnerMapEntry, Task,
  RunLog, Approval, Brief, GraphResponse, Metrics, AuditEntry,
} from '../types';

export interface Actor { actor: string; role: string; }

/** Thrown by local logic to mirror the shape existing pages already expect from a failed axios call. */
export class LocalApiError extends Error {
  response: { data: { error: string } };
  constructor(message: string) {
    super(message);
    this.response = { data: { error: message } };
  }
}

function notFound(what: string): never {
  throw new LocalApiError(`${what} not found`);
}

// ---------------------------------------------------------------- Cycles --
export const Cycles = {
  list: async (): Promise<Cycle[]> => {
    const state = getState();
    return state.cycles.map((c) => cycleSummary(state, c)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  get: async (cycleId: string): Promise<Cycle> => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    if (!cycle) notFound('Cycle');
    return cycleSummary(state, cycle);
  },

  create: async ({ actor = 'Unknown', role = 'Unknown', minItems = 10 }: Actor & { minItems?: number }): Promise<Cycle> => {
    const state = getState();
    const latest = [...state.cycles].sort((a, b) => new Date(b.weekEnd).getTime() - new Date(a.weekEnd).getTime())[0];
    const baseDate = latest ? new Date(new Date(latest.weekEnd).getTime() + 3 * 24 * 3600 * 1000) : new Date();
    const { label, monday, friday } = isoWeekInfo(baseDate);
    const cutoff = new Date(monday);
    cutoff.setUTCDate(monday.getUTCDate() + 2);
    cutoff.setUTCHours(17, 0, 0, 0);

    const cycle: Cycle = {
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
    saveState(state);
    return cycleSummary(state, cycle);
  },

  markCompiled: async (cycleId: string, { actor = 'Unknown', role = 'Unknown' }: Actor): Promise<Cycle> => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    if (!cycle) notFound('Cycle');
    const itemCount = state.items.filter((i) => i.cycleId === cycle.id).length;
    const before = { ...cycle };
    cycle.state = 'compiled';
    cycle.compiledAt = new Date().toISOString();
    pushAudit(state, { actor, role, action: 'cycle_marked_compiled', entity: 'cycle', entityId: cycle.id, before, after: cycle, cycleId: cycle.id });
    saveState(state);
    return {
      ...cycleSummary(state, cycle),
      warning: itemCount < cycle.minItems ? `Marked compiled with only ${itemCount}/${cycle.minItems} items — below the usual minimum.` : null,
    };
  },

  assignCollection: async (cycleId: string, { actor = 'Unknown', role = 'Unknown', assignee = 'Collector', dueAt, note = '' }: Actor & { assignee: string; dueAt?: string; note?: string }): Promise<Task> => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    if (!cycle) notFound('Cycle');
    const task: Task = {
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
    saveState(state);
    return task;
  },

  tasks: async (cycleId: string): Promise<Task[]> => {
    const state = getState();
    return state.tasks.filter((t) => t.cycleId === cycleId);
  },

  updateTask: async (cycleId: string, taskId: string, { actor = 'Unknown', role = 'Unknown', status = 'done' }: Actor & { status: string }): Promise<Task> => {
    const state = getState();
    const task = state.tasks.find((t) => t.id === taskId && t.cycleId === cycleId);
    if (!task) notFound('Task');
    const before = { ...task };
    task.status = status as Task['status'];
    task.completedAt = status === 'done' ? new Date().toISOString() : task.completedAt;
    pushAudit(state, { actor, role, action: 'task_updated', entity: 'task', entityId: task.id, before, after: task, cycleId: task.cycleId });
    saveState(state);
    return task;
  },

  graph: async (cycleId: string): Promise<GraphResponse> => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    if (!cycle) notFound('Cycle');
    return buildGraph(state, cycle);
  },
};

// ----------------------------------------------------------------- Items --
const DEDUPE_WINDOW_DAYS = 30;
const DEDUPE_SIMILARITY_THRESHOLD = 0.8;

function findDuplicate(state: AppState, normalizedText: string): Item | null {
  const cutoff = Date.now() - DEDUPE_WINDOW_DAYS * 24 * 3600 * 1000;
  let best: Item | null = null;
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

function createItem(state: AppState, cycle: Cycle, { rawText, sourceType, actor, role }: { rawText: string; sourceType?: string; actor: string; role: string }) {
  const normalizedText = normalizeForDedupe(rawText);
  const dup = findDuplicate(state, normalizedText);

  if (dup) {
    dup.mentionCount = (dup.mentionCount || 1) + 1;
    dup.lastMentionedAt = new Date().toISOString();
    pushAudit(state, { actor, role, action: 'item_merged_as_repeat', entity: 'item', entityId: dup.id, after: { mentionCount: dup.mentionCount }, cycleId: dup.cycleId });

    const sig = state.signals.find((s) => s.itemId === dup.id);
    if (sig) {
      const before = { severity_score: sig.severity_score, tier: sig.tier };
      sig.severity_score = Math.min(10, Math.round((sig.severity_score + 0.5) * 10) / 10);
      sig.tier = sig.severity_score >= 6 ? 'high' : sig.severity_score >= 3 ? 'medium' : 'low';
      pushAudit(state, { actor, role, action: 'signal_bumped_by_repeat_mention', entity: 'signal', entityId: sig.id, before, after: { severity_score: sig.severity_score, tier: sig.tier }, cycleId: sig.cycleId });
    }
    return { item: dup, duplicate: true };
  }

  const item: Item = {
    id: id('itm'),
    cycleId: cycle.id,
    rawText,
    normalizedText,
    sourceType: sourceType || 'other',
    status: 'pending',
    mentionCount: 1,
    lastMentionedAt: null,
    createdBy: actor || 'Unknown',
    createdAt: new Date().toISOString(),
  };
  state.items.push(item);
  pushAudit(state, { actor, role, action: 'item_created', entity: 'item', entityId: item.id, after: item, cycleId: cycle.id });
  return { item, duplicate: false };
}

export const Items = {
  list: async (cycleId: string): Promise<Item[]> => {
    const state = getState();
    return state.items.filter((i) => i.cycleId === cycleId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  create: async (cycleId: string, { rawText, sourceType, actor = 'Unknown', role = 'Unknown' }: Actor & { rawText: string; sourceType: string }) => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    if (!cycle) notFound('Cycle');
    if (!rawText || !rawText.trim()) throw new LocalApiError('rawText is required');
    const result = createItem(state, cycle, { rawText: rawText.trim(), sourceType, actor, role });
    saveState(state);
    return result;
  },

  bulk: async (cycleId: string, { text, sourceType, actor = 'Unknown', role = 'Unknown' }: Actor & { text: string; sourceType: string }) => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    if (!cycle) notFound('Cycle');
    if (!text || !text.trim()) throw new LocalApiError('text is required');

    const blocks = text
      .split(/\n\s*(?:---+\s*)?\n|\n---+\n/g)
      .map((b) => b.trim())
      .filter(Boolean);

    const results = blocks.map((rawText) => createItem(state, cycle, { rawText, sourceType, actor, role }));
    saveState(state);
    return {
      created: results.filter((r) => !r.duplicate).length,
      mergedAsRepeat: results.filter((r) => r.duplicate).length,
      items: results,
    };
  },
};

// --------------------------------------------------------------- Context --
export const Context = {
  list: async (cycleId: string): Promise<ContextPriority[]> => {
    const state = getState();
    return state.contextPriorities.filter((c) => c.cycleId === cycleId);
  },

  add: async (cycleId: string, { text, actor = 'Unknown', role = 'Unknown' }: Actor & { text: string }): Promise<ContextPriority> => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    if (!cycle) notFound('Cycle');
    if (!text || !text.trim()) throw new LocalApiError('text is required');
    const priority: ContextPriority = { id: id('ctx'), cycleId: cycle.id, text: text.trim(), active: true, createdBy: actor, createdAt: new Date().toISOString() };
    state.contextPriorities.push(priority);
    pushAudit(state, { actor, role, action: 'priority_added', entity: 'context_priority', entityId: priority.id, after: priority, cycleId: cycle.id });
    saveState(state);
    return priority;
  },

  update: async (contextId: string, { text, active, actor = 'Unknown', role = 'Unknown' }: Actor & { text?: string; active?: boolean }): Promise<ContextPriority> => {
    const state = getState();
    const priority = state.contextPriorities.find((c) => c.id === contextId);
    if (!priority) notFound('Priority');
    const before = { ...priority };
    if (text !== undefined) priority.text = text;
    if (active !== undefined) priority.active = active;
    pushAudit(state, { actor, role, action: 'priority_edited', entity: 'context_priority', entityId: priority.id, before, after: priority, cycleId: priority.cycleId });
    saveState(state);
    return priority;
  },

  remove: async (contextId: string, { actor = 'Unknown', role = 'Unknown' }: Actor): Promise<void> => {
    const state = getState();
    const idx = state.contextPriorities.findIndex((c) => c.id === contextId);
    if (idx === -1) notFound('Priority');
    const [removed] = state.contextPriorities.splice(idx, 1);
    pushAudit(state, { actor, role, action: 'priority_removed', entity: 'context_priority', entityId: removed.id, before: removed, cycleId: removed.cycleId });
    saveState(state);
  },
};

// --------------------------------------------------------------- Weights --
export const Weights = {
  list: async (): Promise<WeightProfile[]> => {
    const state = getState();
    return [...state.weightProfiles].sort((a, b) => b.version - a.version);
  },

  active: async (): Promise<WeightProfile | null> => {
    const state = getState();
    return state.weightProfiles.find((p) => p.active) || null;
  },

  publish: async ({ name = 'Untitled profile', categoryWeights, multiplier = 1.5, thresholds, notes = '', actor = 'Unknown', role = 'Unknown' }: Actor & { name: string; categoryWeights: Record<string, number>; multiplier: number; thresholds: { high: number; medium: number }; notes?: string }): Promise<WeightProfile> => {
    const state = getState();
    if (!categoryWeights) throw new LocalApiError('categoryWeights is required');
    const maxVersion = Math.max(0, ...state.weightProfiles.map((p) => p.version));
    const previousActive = state.weightProfiles.find((p) => p.active);
    const profile: WeightProfile = {
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
    saveState(state);
    return profile;
  },

  activate: async (profileId: string, { actor = 'Unknown', role = 'Unknown' }: Actor): Promise<WeightProfile> => {
    const state = getState();
    const profile = state.weightProfiles.find((p) => p.id === profileId);
    if (!profile) notFound('Profile');
    const previousActive = state.weightProfiles.find((p) => p.active);
    state.weightProfiles.forEach((p) => { p.active = false; });
    profile.active = true;
    pushAudit(state, { actor, role, action: 'weight_profile_activated', entity: 'weight_profile', entityId: profile.id, before: previousActive, after: profile });
    saveState(state);
    return profile;
  },

  rescorePending: async ({ cycleId, actor = 'Unknown', role = 'Unknown' }: Actor & { cycleId: string }) => {
    const state = getState();
    const active = state.weightProfiles.find((p) => p.active);
    if (!active) throw new LocalApiError('No active weight profile');
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
    saveState(state);
    return { rescored: targets.length, changed, activeProfileVersion: active.version };
  },
};

// -------------------------------------------------------------- OwnerMap --
export const OwnerMap = {
  list: async (): Promise<OwnerMapEntry[]> => {
    const state = getState();
    return state.ownerMap.length ? state.ownerMap : defaultOwnerMap();
  },

  update: async (signalType: string, { ownerRole, suggestedAction, responseWindow, actor = 'Unknown', role = 'Unknown' }: Actor & { ownerRole?: string; suggestedAction?: string; responseWindow?: string }): Promise<OwnerMapEntry> => {
    const state = getState();
    const entry = state.ownerMap.find((o) => o.signalType === signalType);
    if (!entry) notFound('Signal type');
    const before = { ...entry };
    if (ownerRole !== undefined) entry.ownerRole = ownerRole;
    if (suggestedAction !== undefined) entry.suggestedAction = suggestedAction;
    if (responseWindow !== undefined) entry.responseWindow = responseWindow as OwnerMapEntry['responseWindow'];
    pushAudit(state, { actor, role, action: 'owner_map_edited', entity: 'owner_map', entityId: entry.signalType, before, after: entry });
    saveState(state);
    return entry;
  },
};

// -------------------------------------------------------------- Analysis --
export const Analysis = {
  run: async (cycleId: string, { actor = 'Unknown', role = 'Unknown', confidenceThreshold = 0.5 }: Actor & { confidenceThreshold?: number }) => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    if (!cycle) notFound('Cycle');

    if (cycle.state === 'collecting' || cycle.state === 'not_started') {
      throw new LocalApiError('This week is not compiled yet. The Context-keeper must assign collection, or the Collector must mark the week compiled, before analysis can run.');
    }

    const activeProfile = state.weightProfiles.find((p) => p.active);
    if (!activeProfile) throw new LocalApiError('No active weight profile');

    const contextPriorities = state.contextPriorities.filter((c) => c.cycleId === cycle.id);
    const pendingItems = state.items.filter((i) => i.cycleId === cycle.id && i.status === 'pending');

    const tierCounts = { high: 0, medium: 0, low: 0 };
    const signalSnapshots: Signal[] = [];
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
        responseWindow: 'this_week' as const,
      };
      const deadline = computeDeadline(mapping.responseWindow, new Date());

      const signal: Signal = {
        id: id('sig'),
        itemId: item.id,
        cycleId: cycle.id,
        sourceText: item.rawText,
        sourceType: item.sourceType,
        ...result,
        category: result.category as string,
        signal_type: result.signal_type as string,
        owner_role: mapping.ownerRole,
        suggested_action: mapping.suggestedAction,
        response_window: mapping.responseWindow as Signal['response_window'],
        deadline,
        weight_profile_version: activeProfile.version,
        status: 'proposed',
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

    const runLog: RunLog = {
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
    saveState(state);

    return { runLog, cycle, createdSignals: signalSnapshots };
  },
};

// --------------------------------------------------------------- Signals --
export const Signals = {
  list: async (cycleId: string, params?: { status?: string; tier?: string }): Promise<Signal[]> => {
    const state = getState();
    let signals = state.signals.filter((s) => s.cycleId === cycleId);
    if (params?.status) signals = signals.filter((s) => s.status === params.status);
    if (params?.tier) signals = signals.filter((s) => s.tier === params.tier);
    return sortBySeverity(signals);
  },

  get: async (signalId: string): Promise<Signal> => {
    const state = getState();
    const signal = state.signals.find((s) => s.id === signalId);
    if (!signal) notFound('Signal');
    return signal;
  },

  confirm: async (signalId: string, { actor = 'Unknown', role = 'Unknown', note = '' }: Actor & { note?: string }): Promise<Signal> => {
    const state = getState();
    const signal = state.signals.find((s) => s.id === signalId);
    if (!signal) notFound('Signal');
    const before = { status: signal.status };
    signal.status = 'confirmed';
    signal.reviewedBy = actor;
    signal.reviewedByRole = role;
    signal.reviewedAt = new Date().toISOString();
    signal.reviewNote = note;
    pushAudit(state, { actor, role, action: 'signal_confirmed', entity: 'signal', entityId: signal.id, before, after: { status: signal.status }, cycleId: signal.cycleId });
    saveState(state);
    return signal;
  },

  dismiss: async (signalId: string, { actor = 'Unknown', role = 'Unknown', note = '' }: Actor & { note?: string }): Promise<Signal> => {
    const state = getState();
    const signal = state.signals.find((s) => s.id === signalId);
    if (!signal) notFound('Signal');
    const before = { status: signal.status };
    signal.status = 'dismissed';
    signal.reviewedBy = actor;
    signal.reviewedByRole = role;
    signal.reviewedAt = new Date().toISOString();
    signal.reviewNote = note;
    pushAudit(state, { actor, role, action: 'signal_dismissed', entity: 'signal', entityId: signal.id, before, after: { status: signal.status }, cycleId: signal.cycleId });
    saveState(state);
    return signal;
  },

  reassign: async (signalId: string, { owner_role, suggested_action, response_window, tier, deadline, actor = 'Unknown', role = 'Unknown', reason = '' }: Actor & { owner_role?: string; suggested_action?: string; response_window?: string; tier?: string; deadline?: string; reason?: string }): Promise<Signal> => {
    const state = getState();
    const signal = state.signals.find((s) => s.id === signalId);
    if (!signal) notFound('Signal');

    const before = {
      owner_role: signal.owner_role,
      suggested_action: signal.suggested_action,
      response_window: signal.response_window,
      tier: signal.tier,
      deadline: signal.deadline,
    };

    if (owner_role !== undefined) signal.owner_role = owner_role;
    if (suggested_action !== undefined) signal.suggested_action = suggested_action;
    if (tier !== undefined) signal.tier = tier as Signal['tier'];
    if (response_window !== undefined) {
      signal.response_window = response_window as Signal['response_window'];
      signal.deadline = deadline || computeDeadline(response_window, new Date());
    } else if (deadline !== undefined) {
      signal.deadline = deadline;
    }

    signal.manuallyEdited = true;
    signal.editHistory = signal.editHistory || [];
    const after = { owner_role: signal.owner_role, suggested_action: signal.suggested_action, response_window: signal.response_window, tier: signal.tier, deadline: signal.deadline };
    signal.editHistory.push({ at: new Date().toISOString(), actor, role, reason, before, after });

    pushAudit(state, { actor, role, action: 'signal_manually_reassigned', entity: 'signal', entityId: signal.id, before, after, cycleId: signal.cycleId });
    saveState(state);
    return signal;
  },

  bulkConfirm: async (cycleId: string, { signalIds, actor = 'Unknown', role = 'Unknown' }: Actor & { signalIds: string[] }) => {
    const state = getState();
    const confirmed: string[] = [];
    for (const sid of signalIds) {
      const signal = state.signals.find((s) => s.id === sid && s.cycleId === cycleId);
      if (!signal) continue;
      signal.status = 'confirmed';
      signal.reviewedBy = actor;
      signal.reviewedByRole = role;
      signal.reviewedAt = new Date().toISOString();
      confirmed.push(signal.id);
    }
    pushAudit(state, { actor, role, action: 'signals_bulk_confirmed', entity: 'signal', entityId: confirmed.join(','), after: { count: confirmed.length }, cycleId });
    saveState(state);
    return { confirmed };
  },
};

// ---------------------------------------------------------------- Digest --
const DIGEST_BUCKETS: Record<string, { exec: string; label: string }> = {
  pricing_financial: { exec: 'CFO', label: 'Financial' },
  funding_ma: { exec: 'CEO', label: 'M&A / Strategy' },
  product_feature: { exec: 'CTO', label: 'Product' },
};

export const Digest = {
  get: async (cycleId: string) => {
    const state = getState();
    const highConfirmed = state.signals.filter((s) => s.cycleId === cycleId && s.tier === 'high' && s.status === 'confirmed');
    const groups: Record<string, { exec: string; label: string; signals: Signal[] }> = {};
    for (const s of highConfirmed) {
      const bucket = DIGEST_BUCKETS[s.category] || { exec: 'Leadership', label: 'Other' };
      const key = `${bucket.exec}::${bucket.label}`;
      if (!groups[key]) groups[key] = { exec: bucket.exec, label: bucket.label, signals: [] };
      groups[key].signals.push(s);
    }
    return { generatedAt: new Date().toISOString(), groups: Object.values(groups) };
  },
};

// ----------------------------------------------------------------- Brief --
function assembleBriefData(state: AppState, cycle: Cycle) {
  const contextPriorities = state.contextPriorities.filter((c) => c.cycleId === cycle.id && c.active);
  const approvedSignals = sortBySeverity(state.signals.filter((s) => s.cycleId === cycle.id && s.approved));
  const versions = [...new Set(approvedSignals.map((s) => s.weight_profile_version))];
  const weightProfiles = state.weightProfiles.filter((p) => versions.includes(p.version));
  const runLogs = state.runLogs.filter((r) => r.cycleId === cycle.id).sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime());
  const nonSignalItems = state.items.filter((i) => i.cycleId === cycle.id && i.status === 'non_signal');
  const approvals = state.approvals.filter((a) => a.cycleId === cycle.id);
  return { contextPriorities, approvedSignals, weightProfiles, runLogs, nonSignalItems, approvals };
}

function latestBrief(state: AppState, cycleId: string): Brief | undefined {
  return state.briefs.filter((b) => b.cycleId === cycleId).sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())[0];
}

function briefExportData(state: AppState, cycle: Cycle, brief: Brief) {
  const signals = sortBySeverity(state.signals.filter((s) => brief.signalIds.includes(s.id)));
  const contextPriorities = state.contextPriorities.filter((c) => c.cycleId === cycle.id && c.active);
  const weightProfiles = state.weightProfiles.filter((p) => brief.weightProfileVersions.includes(p.version));
  const runLogs = state.runLogs.filter((r) => r.cycleId === cycle.id).sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime());
  const nonSignalItems = state.items.filter((i) => i.cycleId === cycle.id && i.status === 'non_signal');
  const approvals = state.approvals.filter((a) => brief.approvalIds.includes(a.id));
  return { cycle, signals, contextPriorities, weightProfiles, runLogs, nonSignalItems, approvals };
}

export const BriefApi = {
  queue: async (cycleId: string): Promise<Signal[]> => {
    const state = getState();
    return sortBySeverity(state.signals.filter((s) => s.cycleId === cycleId && s.status === 'confirmed'));
  },

  approve: async (cycleId: string, { actor = 'Unknown', role = 'Unknown', signalIds }: Actor & { signalIds?: string[] }): Promise<Approval> => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    if (!cycle) notFound('Cycle');

    const targets = signalIds && signalIds.length
      ? state.signals.filter((s) => signalIds.includes(s.id) && s.cycleId === cycle.id)
      : state.signals.filter((s) => s.cycleId === cycle.id && s.status === 'confirmed' && !s.approved);

    if (targets.length === 0) throw new LocalApiError('No confirmed, unapproved signals to approve.');

    const now = new Date().toISOString();
    targets.forEach((s) => { s.approved = true; s.approvedBy = actor; s.approvedAt = now; });

    const approval: Approval = { id: id('apr'), cycleId: cycle.id, approver: actor, approverRole: role, approvedAt: now, signalIds: targets.map((s) => s.id) };
    state.approvals.push(approval);
    cycle.state = 'approved';

    pushAudit(state, { actor, role, action: 'signals_approved', entity: 'approval', entityId: approval.id, after: { count: targets.length }, cycleId: cycle.id });
    saveState(state);
    return approval;
  },

  generate: async (cycleId: string, { actor = 'Unknown', role = 'Unknown' }: Actor): Promise<Brief> => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    if (!cycle) notFound('Cycle');

    const { approvedSignals, weightProfiles, approvals } = assembleBriefData(state, cycle);
    if (approvedSignals.length === 0) throw new LocalApiError('A cycle cannot produce a brief until at least one signal is approved.');

    const brief: Brief = {
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
    saveState(state);
    return brief;
  },

  latest: async (cycleId: string): Promise<{ brief: Brief; signals: Signal[] }> => {
    const state = getState();
    const brief = latestBrief(state, cycleId);
    if (!brief) notFound('No brief generated yet for this cycle');
    const signals = state.signals.filter((s) => brief.signalIds.includes(s.id));
    return { brief, signals: sortBySeverity(signals) };
  },

  runLogs: async (cycleId: string): Promise<RunLog[]> => {
    const state = getState();
    return state.runLogs.filter((r) => r.cycleId === cycleId).sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime());
  },

  // These used to be URLs for <a href>; now they trigger the download
  // directly. Kept as sync functions (not URL strings) — see Brief.tsx /
  // Archive.tsx, which call them from a button's onClick instead of
  // rendering an <a href>.
  downloadXlsx: (cycleId: string, briefId: string) => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    const brief = state.briefs.find((b) => b.id === briefId && b.cycleId === cycleId);
    if (!cycle || !brief) throw new LocalApiError('Not found');
    downloadBriefXlsx(briefExportData(state, cycle, brief));
  },

  downloadMarkdown: (cycleId: string, briefId: string) => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    const brief = state.briefs.find((b) => b.id === briefId && b.cycleId === cycleId);
    if (!cycle || !brief) throw new LocalApiError('Not found');
    downloadBriefMarkdown({ ...briefExportData(state, cycle, brief), generatedAt: brief.generatedAt, generatedBy: brief.generatedBy, generatedByRole: brief.generatedByRole });
  },

  downloadRunLogXlsx: (cycleId: string) => {
    const state = getState();
    const cycle = findCycle(state, cycleId);
    if (!cycle) throw new LocalApiError('Cycle not found');
    const runLogs = state.runLogs.filter((r) => r.cycleId === cycle.id).sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime());
    downloadRunLogXlsx(cycle, runLogs);
  },
};

// ----------------------------------------------------------------- Admin --
export const Admin = {
  reset: async ({ actor = 'Unknown', role = 'Unknown' }: Actor): Promise<{ ok: true; cycle: Cycle }> => {
    console.log(`[admin] Full data reset triggered by ${actor} (${role}) at ${new Date().toISOString()}`);
    const fresh = resetState();
    return { ok: true, cycle: fresh.cycles[0] };
  },
};

// --------------------------------------------------------------- Archive --
export const Archive = {
  nonSignals: async (q?: string): Promise<Item[]> => {
    const state = getState();
    let items = state.items.filter((i) => i.status === 'non_signal');
    const needle = (q || '').toLowerCase();
    if (needle) items = items.filter((i) => i.rawText.toLowerCase().includes(needle));
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  briefs: async (): Promise<Brief[]> => {
    const state = getState();
    return [...state.briefs].sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
  },
};

// ----------------------------------------------------------------- Audit --
export const AuditApi = {
  list: async (cycleId?: string, limit = 200): Promise<AuditEntry[]> => {
    const state = getState();
    let log = state.auditLog;
    if (cycleId) log = log.filter((a) => a.cycleId === cycleId);
    return [...log].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
  },
};

// --------------------------------------------------------------- Metrics --
function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const MetricsApi = {
  get: async (cycleId: string): Promise<Metrics> => {
    const state = getState();
    const signals = state.signals.filter((s) => s.cycleId === cycleId);
    const items = state.items.filter((i) => i.cycleId === cycleId);
    const reviewed = signals.filter((s) => s.status === 'confirmed' || s.status === 'dismissed');
    const confirmed = signals.filter((s) => s.status === 'confirmed');

    const actionableSignalRate = reviewed.length ? Math.round((confirmed.length / reviewed.length) * 1000) / 10 : null;

    const surfaceTimesHrs = confirmed
      .filter((s) => s.reviewedAt)
      .map((s) => {
        const item = state.items.find((i) => i.id === s.itemId);
        if (!item) return null;
        return (new Date(s.reviewedAt as string).getTime() - new Date(item.createdAt).getTime()) / 3600000;
      })
      .filter((v): v is number => v !== null);
    const timeToSurfaceMedianHrs = median(surfaceTimesHrs);

    const overrideRate = signals.length ? Math.round((signals.filter((s) => s.manuallyEdited).length / signals.length) * 1000) / 10 : null;
    const actNowVolume = signals.filter((s) => s.tier === 'high' && s.status !== 'dismissed').length;
    const customerConfirmed = confirmed.filter((s) => s.sourceType === 'customer_conversation').length;
    const beatenByCustomerRate = confirmed.length ? Math.round((customerConfirmed / confirmed.length) * 1000) / 10 : null;

    return {
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
      note: 'actionableSignalRate/beatenByCustomerRate are in-app proxies (based on confirm/dismiss + source type), not external owner surveys.',
    };
  },
};
