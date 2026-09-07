// Ported from server/src/helpers.js.
import { id } from './id';
import type { AppState } from './seed';
import type { Cycle, Signal, Tier } from '../types';

export function findCycle(state: AppState, cycleId: string): Cycle | undefined {
  return state.cycles.find((c) => c.id === cycleId);
}

export function pushAudit(state: AppState, {
  actor = 'Unknown', role = 'Unknown', action, entity, entityId, before = null, after = null, cycleId = null,
}: { actor?: string; role?: string; action: string; entity: string; entityId: string; before?: unknown; after?: unknown; cycleId?: string | null }) {
  state.auditLog.push({
    id: id('aud'),
    actor,
    role,
    action,
    entity,
    entityId,
    before,
    after,
    cycleId,
    at: new Date().toISOString(),
  });
}

export const TIER_ORDER: Record<Tier, number> = { high: 0, medium: 1, low: 2 };

export function sortBySeverity(signals: Signal[]): Signal[] {
  return [...signals].sort((a, b) => (TIER_ORDER[a.tier] - TIER_ORDER[b.tier]) || (b.severity_score - a.severity_score));
}

export function isCutoffPassed(cycle: Cycle): boolean {
  return cycle.state === 'collecting' && new Date() > new Date(cycle.cutoffAt);
}

export function cycleSummary(state: AppState, cycle: Cycle) {
  const items = state.items.filter((i) => i.cycleId === cycle.id);
  const signals = state.signals.filter((s) => s.cycleId === cycle.id);
  return {
    ...cycle,
    isBlocked: isCutoffPassed(cycle),
    itemCount: items.length,
    signalCount: signals.length,
    highCount: signals.filter((s) => s.tier === 'high').length,
    pendingReview: signals.filter((s) => s.status === 'proposed').length,
  };
}
