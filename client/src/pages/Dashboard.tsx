import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Cycles, Items, Signals as SignalsApi, MetricsApi, Digest, Analysis } from '../api/client';
import { WorkflowGraph } from '../components/WorkflowGraph';
import { StatTile } from '../components/StatTile';
import { TierBadge, Pill } from '../components/Badges';
import type { GraphResponse, Item, Signal, Metrics } from '../types';

const STAGE_TITLES: Record<string, string> = {
  stage0_gate: 'Readiness gate — open tasks',
  input_intake: 'Intake — items this cycle',
  input_context: 'Priority context',
  stage3_analysis: 'Items waiting on analysis',
  stage4_filter: 'Filtered out (non-signals)',
  stage4b_scoring: 'Scored signals',
  stage5_writeback: 'Owner + action write-back',
  stage6_review: 'Awaiting human confirmation',
  stage7_queue: 'Confirmed priority queue',
  stage8_brief: 'Approved signals',
  stage9_metrics: 'All signals this cycle',
};

export default function Dashboard() {
  const { actor, role, cycleId, cycle, refreshCycle } = useApp();
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [digest, setDigest] = useState<{ groups: Array<{ exec: string; label: string; signals: Signal[] }> } | null>(null);
  const [panelStage, setPanelStage] = useState<string | null>(null);
  const [panelItems, setPanelItems] = useState<Item[]>([]);
  const [panelSignals, setPanelSignals] = useState<Signal[]>([]);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cycleId) return;
    const [g, m, d] = await Promise.all([Cycles.graph(cycleId), MetricsApi.get(cycleId), Digest.get(cycleId)]);
    setGraph(g);
    setMetrics(m);
    setDigest(d);
  }, [cycleId]);

  useEffect(() => { load(); }, [load]);

  const openStage = useCallback(async (stage: string) => {
    if (!cycleId) return;
    setPanelStage(stage);
    if (['input_intake', 'stage3_analysis', 'stage4_filter'].includes(stage)) {
      const items = await Items.list(cycleId);
      if (stage === 'stage3_analysis') setPanelItems(items.filter((i) => i.status === 'pending'));
      else if (stage === 'stage4_filter') setPanelItems(items.filter((i) => i.status === 'non_signal'));
      else setPanelItems(items);
      setPanelSignals([]);
    } else if (['stage4b_scoring', 'stage5_writeback', 'stage6_review', 'stage7_queue', 'stage8_brief', 'stage9_metrics'].includes(stage)) {
      const signals = await SignalsApi.list(cycleId);
      if (stage === 'stage6_review') setPanelSignals(signals.filter((s) => s.status === 'proposed'));
      else if (stage === 'stage7_queue') setPanelSignals(signals.filter((s) => s.status === 'confirmed'));
      else if (stage === 'stage8_brief') setPanelSignals(signals.filter((s) => s.approved));
      else setPanelSignals(signals);
      setPanelItems([]);
    } else {
      setPanelItems([]);
      setPanelSignals([]);
    }
  }, [cycleId]);

  async function handleRunAnalysis() {
    if (!cycleId) return;
    setRunning(true);
    setRunMsg(null);
    try {
      const result = await Analysis.run(cycleId, { actor, role });
      setRunMsg(`Processed ${result.runLog.itemsProcessed} item(s): ${result.runLog.signalsCreated} signal(s), ${result.runLog.nonSignals} filtered out.`);
      await Promise.all([load(), refreshCycle()]);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e ? (e as { response?: { data?: { error?: string } } }).response?.data?.error : undefined;
      setRunMsg(msg || 'Analysis failed.');
    } finally {
      setRunning(false);
    }
  }

  async function handleAssignCollection() {
    if (!cycleId) return;
    await Cycles.assignCollection(cycleId, { actor, role, assignee: 'Collector', note: 'Please compile this week’s market items.' });
    await Promise.all([load(), refreshCycle()]);
  }

  if (!cycle || !graph || !metrics) {
    return <div className="p-6 text-sm" style={{ color: 'var(--ink-muted)' }}>Loading dashboard…</div>;
  }

  const gateNode = graph.nodes.find((n) => n.stage === 'stage0_gate');

  return (
    <div className="p-5 flex flex-col gap-5 max-w-[1500px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">{cycle.weekLabel}</h1>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            State: <Pill tone="accent">{cycle.state}</Pill>{' '}
            {gateNode?.state === 'blocked' && <Pill tone="violet">Cutoff passed</Pill>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {gateNode?.state === 'blocked' && (
            <button onClick={handleAssignCollection} className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: 'var(--critical)' }}>
              Assign collection now
            </button>
          )}
          <button
            onClick={handleRunAnalysis}
            disabled={running || cycle.state === 'collecting'}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
            title={cycle.state === 'collecting' ? 'Week must be compiled first' : 'Run AI analysis on pending items'}
          >
            {running ? 'Running…' : '▶ Run analysis'}
          </button>
        </div>
      </div>

      {runMsg && (
        <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{runMsg}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label="Actionable rate" value={metrics.actionableSignalRate === null ? '—' : `${metrics.actionableSignalRate}%`} sub="confirmed / reviewed" tone="good" />
        <StatTile label="Median time to surface" value={metrics.timeToSurfaceMedianHrs === null ? '—' : `${metrics.timeToSurfaceMedianHrs.toFixed(1)}h`} tone="accent" />
        <StatTile label="Beaten-by-customer" value={metrics.beatenByCustomerRate === null ? '—' : `${metrics.beatenByCustomerRate}%`} tone={metrics.beatenByCustomerRate ? 'warning' : 'good'} />
        <StatTile label="Override rate" value={metrics.overrideRate === null ? '—' : `${metrics.overrideRate}%`} tone="neutral" />
        <StatTile label="Act-now volume" value={String(metrics.actNowVolume)} sub="High tier, open" tone={metrics.actNowVolume > 3 ? 'critical' : 'neutral'} />
        <StatTile label="Non-signals logged" value={String(metrics.totals.nonSignals)} tone="neutral" />
      </div>

      <div className="card p-3">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-sm font-semibold">Live workflow</h2>
          <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>Click any stage to inspect what's there</span>
        </div>
        <WorkflowGraph graph={graph} onOpenStage={openStage} />
      </div>

      {digest && digest.groups.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold mb-2">Batched exec digest — confirmed High signals</h2>
          <div className="grid md:grid-cols-3 gap-3">
            {digest.groups.map((g) => (
              <div key={`${g.exec}-${g.label}`} className="rounded-lg p-3" style={{ background: 'var(--surface-2)' }}>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--ink-muted)' }}>{g.label} → {g.exec}</div>
                <ul className="text-sm flex flex-col gap-1">
                  {g.signals.map((s) => (
                    <li key={s.id}>{s.owner_role}: {s.suggested_action}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {panelStage && (
        <div className="fixed inset-0 z-30 flex justify-end" onClick={() => setPanelStage(null)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.25)' }} />
          <div
            className="relative w-full max-w-lg h-full overflow-y-auto p-5 scroll-thin"
            style={{ background: 'var(--surface-1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{STAGE_TITLES[panelStage] || panelStage}</h3>
              <button onClick={() => setPanelStage(null)} className="text-sm" style={{ color: 'var(--ink-muted)' }}>Close ✕</button>
            </div>
            <div className="flex flex-col gap-3">
              {panelItems.map((it) => (
                <div key={it.id} className="rounded-lg p-3 text-sm" style={{ background: 'var(--surface-2)' }}>
                  <div className="text-xs mb-1" style={{ color: 'var(--ink-muted)' }}>{it.sourceType} · {new Date(it.createdAt).toLocaleString()}</div>
                  <div>{it.rawText}</div>
                  {it.nonSignalReason && <div className="text-xs mt-1 italic" style={{ color: 'var(--ink-muted)' }}>{it.nonSignalReason}</div>}
                </div>
              ))}
              {panelSignals.map((s) => (
                <div key={s.id} className="rounded-lg p-3 text-sm flex flex-col gap-1" style={{ background: 'var(--surface-2)' }}>
                  <div className="flex items-center gap-2">
                    <TierBadge tier={s.tier} />
                    <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>{s.signal_type}</span>
                  </div>
                  <div>{s.sourceText}</div>
                  <div className="text-xs" style={{ color: 'var(--ink-secondary)' }}>Owner: {s.owner_role} · Due {new Date(s.deadline).toLocaleDateString()}</div>
                </div>
              ))}
              {panelItems.length === 0 && panelSignals.length === 0 && (
                <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>Nothing here yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
