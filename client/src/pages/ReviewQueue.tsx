import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Signals as SignalsApi, OwnerMap } from '../api/client';
import type { Signal, OwnerMapEntry } from '../types';
import { TierBadge, Pill } from '../components/Badges';

function ReassignForm({ signal, ownerMap, onSave, onCancel }: { signal: Signal; ownerMap: OwnerMapEntry[]; onSave: (patch: Partial<Signal> & { reason: string }) => void; onCancel: () => void }) {
  const [owner, setOwner] = useState(signal.owner_role);
  const [action, setAction] = useState(signal.suggested_action);
  const [window, setWindowVal] = useState(signal.response_window);
  const [tier, setTier] = useState(signal.tier);
  const [reason, setReason] = useState('');

  const roster = Array.from(new Set(ownerMap.map((o) => o.ownerRole)));

  return (
    <div className="rounded-lg p-3 mt-2 flex flex-col gap-2 text-sm" style={{ background: 'var(--surface-1)', border: '1px dashed var(--accent)' }}>
      <label className="flex flex-col gap-1">
        Owner
        <input list="owner-roster" value={owner} onChange={(e) => setOwner(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--border)' }} />
        <datalist id="owner-roster">{roster.map((r) => <option key={r} value={r} />)}</datalist>
      </label>
      <label className="flex flex-col gap-1">
        Suggested action
        <input value={action} onChange={(e) => setAction(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--border)' }} />
      </label>
      <div className="flex gap-3">
        <label className="flex flex-col gap-1 flex-1">
          Response window
          <select value={window} onChange={(e) => setWindowVal(e.target.value as Signal['response_window'])} className="rounded border px-2 py-1" style={{ borderColor: 'var(--border)' }}>
            <option value="same_day">Same day</option>
            <option value="this_week">This week</option>
            <option value="background">Background</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 flex-1">
          Tier
          <select value={tier} onChange={(e) => setTier(e.target.value as Signal['tier'])} className="rounded border px-2 py-1" style={{ borderColor: 'var(--border)' }}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        Reason for change (kept in the audit trail)
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="rounded border px-2 py-1" style={{ borderColor: 'var(--border)' }} />
      </label>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="text-xs font-semibold px-3 py-1.5" style={{ color: 'var(--ink-muted)' }}>Cancel</button>
        <button
          onClick={() => onSave({ owner_role: owner, suggested_action: action, response_window: window, tier, reason })}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
          style={{ background: 'var(--accent)' }}
        >
          Save reassignment
        </button>
      </div>
    </div>
  );
}

export default function ReviewQueue() {
  const { actor, role, cycleId } = useApp();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [ownerMap, setOwnerMap] = useState<OwnerMapEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

  const load = useCallback(async () => {
    if (!cycleId) return;
    const [s, om] = await Promise.all([SignalsApi.list(cycleId, { status: 'proposed' }), OwnerMap.list()]);
    setSignals(s);
    setOwnerMap(om);
  }, [cycleId]);

  useEffect(() => { load(); }, [load]);

  async function confirm(id: string) {
    await SignalsApi.confirm(id, { actor, role });
    await load();
  }
  async function dismiss(id: string) {
    await SignalsApi.dismiss(id, { actor, role, note: 'Dismissed at review.' });
    await load();
  }
  async function saveReassign(id: string, patch: Partial<Signal> & { reason: string }) {
    await SignalsApi.reassign(id, {
      actor, role,
      owner_role: patch.owner_role,
      suggested_action: patch.suggested_action,
      response_window: patch.response_window,
      tier: patch.tier,
      reason: patch.reason,
    });
    setEditingId(null);
    await load();
  }

  const visible = filter === 'all' ? signals : signals.filter((s) => s.tier === filter);
  const reviewerFor = (s: Signal) => (s.tier === 'high' ? 'Checkpoint owner' : 'Collector / Associate');

  return (
    <div className="p-5 max-w-4xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Review Queue</h1>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>{signals.length} signal(s) awaiting confirmation.</p>
        </div>
        <div className="flex gap-1">
          {(['all', 'high', 'medium', 'low'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg capitalize"
              style={{ background: filter === f ? 'var(--accent-soft)' : 'var(--surface-2)', color: filter === f ? 'var(--accent)' : 'var(--ink-secondary)' }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {visible.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <TierBadge tier={s.tier} />
                  <Pill>{s.signal_type}</Pill>
                  {s.reclassified_from && <Pill tone="violet">reclassified from {s.reclassified_from}</Pill>}
                  {s.needs_review && <Pill tone="violet">low confidence — review carefully</Pill>}
                  <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>reviewer: {reviewerFor(s)}</span>
                </div>
                <div className="text-sm mb-1">{s.sourceText}</div>
                <div className="text-xs italic mb-2" style={{ color: 'var(--ink-secondary)' }}>{s.why_it_matters}</div>
                <div className="text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ color: 'var(--ink-muted)' }}>
                  <span>Severity {s.severity_score} (v{s.weight_profile_version})</span>
                  <span>Confidence {(s.confidence * 100).toFixed(0)}%</span>
                  <span>Owner: <strong style={{ color: 'var(--ink-primary)' }}>{s.owner_role}</strong></span>
                  <span>Action: {s.suggested_action}</span>
                  <span>Due {new Date(s.deadline).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <button onClick={() => confirm(s.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: 'var(--good)' }}>Confirm</button>
                <button onClick={() => setEditingId(editingId === s.id ? null : s.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--ink-secondary)' }}>Reassign</button>
                <button onClick={() => dismiss(s.id)} className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'var(--critical-soft)', color: 'var(--critical)' }}>Dismiss</button>
              </div>
            </div>
            {editingId === s.id && (
              <ReassignForm signal={s} ownerMap={ownerMap} onCancel={() => setEditingId(null)} onSave={(patch) => saveReassign(s.id, patch)} />
            )}
          </div>
        ))}
        {visible.length === 0 && <div className="text-sm p-4" style={{ color: 'var(--ink-muted)' }}>Nothing to review — run analysis from the Dashboard first.</div>}
      </div>
    </div>
  );
}
