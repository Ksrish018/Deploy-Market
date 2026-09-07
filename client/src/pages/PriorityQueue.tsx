import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { BriefApi } from '../api/client';
import type { Signal } from '../types';
import { TierBadge, Pill } from '../components/Badges';

export default function PriorityQueue() {
  const { actor, role, cycleId } = useApp();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cycleId) return;
    const s = await BriefApi.queue(cycleId);
    setSignals(s);
  }, [cycleId]);

  useEffect(() => { load(); }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function approveSelected() {
    if (!cycleId) return;
    const ids = selected.size > 0 ? Array.from(selected) : undefined;
    const approval = await BriefApi.approve(cycleId, { actor, role, signalIds: ids });
    setMsg(`Approved ${approval.signalIds.length} signal(s). Head to Brief to generate the document.`);
    setSelected(new Set());
    await load();
  }

  const unapproved = signals.filter((s) => !s.approved);

  return (
    <div className="p-5 max-w-4xl mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Priority Queue</h1>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>{signals.length} confirmed signal(s), sorted by severity.</p>
        </div>
        <button
          onClick={approveSelected}
          disabled={unapproved.length === 0}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--good)' }}
        >
          {selected.size > 0 ? `Approve ${selected.size} selected` : 'Approve all confirmed'}
        </button>
      </div>
      {msg && <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{msg}</div>}

      <div className="flex flex-col gap-2">
        {signals.map((s) => (
          <div key={s.id} className="card p-3 flex items-start gap-3">
            {!s.approved ? (
              <input type="checkbox" className="mt-1.5" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
            ) : (
              <span className="mt-1.5 text-xs" title="Already approved">✓</span>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <TierBadge tier={s.tier} />
                <Pill>{s.signal_type}</Pill>
                {s.approved && <Pill tone="violet">approved</Pill>}
                {s.manuallyEdited && <Pill>owner reassigned</Pill>}
              </div>
              <div className="text-sm">{s.sourceText}</div>
              <div className="text-xs mt-1 flex flex-wrap gap-x-4" style={{ color: 'var(--ink-muted)' }}>
                <span>Owner: <strong style={{ color: 'var(--ink-primary)' }}>{s.owner_role}</strong></span>
                <span>Action: {s.suggested_action}</span>
                <span>Due {new Date(s.deadline).toLocaleString()}</span>
                <span>Confirmed by {s.reviewedBy}</span>
              </div>
            </div>
          </div>
        ))}
        {signals.length === 0 && <div className="text-sm p-4" style={{ color: 'var(--ink-muted)' }}>No confirmed signals yet — confirm items in the Review Queue.</div>}
      </div>
    </div>
  );
}
