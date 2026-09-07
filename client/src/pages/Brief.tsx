import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { BriefApi } from '../api/client';
import type { Signal, Brief as BriefType, RunLog } from '../types';
import { TierBadge } from '../components/Badges';

export default function Brief() {
  const { actor, role, cycleId, cycle, refreshCycle } = useApp();
  const [brief, setBrief] = useState<BriefType | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [runLogs, setRunLogs] = useState<RunLog[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!cycleId) return;
    const logs = await BriefApi.runLogs(cycleId);
    setRunLogs(logs);
    try {
      const latest = await BriefApi.latest(cycleId);
      setBrief(latest.brief);
      setSignals(latest.signals);
    } catch {
      setBrief(null);
      setSignals([]);
    }
  }, [cycleId]);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    if (!cycleId) return;
    setBusy(true);
    setMsg(null);
    try {
      await BriefApi.generate(cycleId, { actor, role });
      setMsg('Brief generated.');
      await Promise.all([load(), refreshCycle()]);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setMsg(err.response?.data?.error || 'Could not generate brief — approve at least one signal first.');
    } finally {
      setBusy(false);
    }
  }

  if (!cycle) return null;

  return (
    <div className="p-5 max-w-4xl mx-auto flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Weekly Market Signal Brief — {cycle.weekLabel}</h1>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>The durable, owner-approved output. Approve signals in the Priority Queue, then generate here.</p>
        </div>
        <button onClick={generate} disabled={busy} className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--accent)' }}>
          {busy ? 'Generating…' : brief ? 'Re-generate brief' : 'Generate brief'}
        </button>
      </div>

      {msg && <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{msg}</div>}

      {brief ? (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>
              Generated {new Date(brief.generatedAt).toLocaleString()} by {brief.generatedBy} ({brief.generatedByRole}) · {signals.length} approved signal(s)
            </div>
            <div className="flex gap-2">
              <a href={BriefApi.exportXlsxUrl(cycle.id, brief.id)} className="text-xs font-semibold rounded-lg px-3 py-1.5 text-white" style={{ background: 'var(--good)' }}>⬇ Export Excel (.xlsx)</a>
              <a href={BriefApi.exportMdUrl(cycle.id, brief.id)} className="text-xs font-semibold rounded-lg px-3 py-1.5" style={{ background: 'var(--surface-2)', color: 'var(--ink-secondary)' }}>⬇ Export Markdown</a>
            </div>
          </div>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ color: 'var(--ink-muted)' }} className="text-left">
                  <th className="py-1 pr-3">Tier</th>
                  <th className="py-1 pr-3">Signal</th>
                  <th className="py-1 pr-3">Owner</th>
                  <th className="py-1 pr-3">Action</th>
                  <th className="py-1 pr-3">Deadline</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--gridline)' }}>
                    <td className="py-2 pr-3"><TierBadge tier={s.tier} /></td>
                    <td className="py-2 pr-3 max-w-xs">{s.sourceText}</td>
                    <td className="py-2 pr-3 font-medium">{s.owner_role}</td>
                    <td className="py-2 pr-3">{s.suggested_action}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{new Date(s.deadline).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card p-6 text-sm text-center" style={{ color: 'var(--ink-muted)' }}>No brief generated yet for this cycle.</div>
      )}

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Run log — for the next meeting</h2>
          <a href={BriefApi.runLogExportUrl(cycle.id)} className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>⬇ Export run log (.xlsx)</a>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ color: 'var(--ink-muted)' }} className="text-left">
                <th className="py-1 pr-3">Run at</th>
                <th className="py-1 pr-3">By</th>
                <th className="py-1 pr-3">Profile</th>
                <th className="py-1 pr-3">Processed</th>
                <th className="py-1 pr-3">Signals</th>
                <th className="py-1 pr-3">Non-signals</th>
                <th className="py-1 pr-3">H/M/L</th>
              </tr>
            </thead>
            <tbody>
              {runLogs.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--gridline)' }}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(r.runAt).toLocaleString()}</td>
                  <td className="py-1.5 pr-3">{r.triggeredBy.actor} ({r.triggeredBy.role})</td>
                  <td className="py-1.5 pr-3">v{r.weightProfileVersion}</td>
                  <td className="py-1.5 pr-3">{r.itemsProcessed}</td>
                  <td className="py-1.5 pr-3">{r.signalsCreated}</td>
                  <td className="py-1.5 pr-3">{r.nonSignals}</td>
                  <td className="py-1.5 pr-3">{r.tierCounts.high}/{r.tierCounts.medium}/{r.tierCounts.low}</td>
                </tr>
              ))}
              {runLogs.length === 0 && (
                <tr><td colSpan={7} className="py-3 text-center" style={{ color: 'var(--ink-muted)' }}>No analysis runs yet this cycle.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
