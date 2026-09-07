import { useEffect, useState } from 'react';
import { Archive as ArchiveApi, BriefApi } from '../api/client';
import type { Item, Brief } from '../types';
import { useApp } from '../context/AppContext';

export default function Archive() {
  const { cycles } = useApp();
  const [q, setQ] = useState('');
  const [nonSignals, setNonSignals] = useState<Item[]>([]);
  const [briefs, setBriefs] = useState<Brief[]>([]);

  useEffect(() => {
    ArchiveApi.nonSignals(q).then(setNonSignals);
  }, [q]);

  useEffect(() => {
    ArchiveApi.briefs().then(setBriefs);
  }, []);

  const weekLabel = (cycleId: string) => cycles.find((c) => c.id === cycleId)?.weekLabel || cycleId;

  return (
    <div className="p-5 max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Archive</h1>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Past approved briefs and logged non-signals — searchable history the original process lacked.</p>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-2">Approved briefs</h2>
        <div className="flex flex-col gap-2">
          {briefs.map((b) => (
            <div key={b.id} className="flex items-center justify-between text-sm rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)' }}>
              <span>{weekLabel(b.cycleId)} — generated {new Date(b.generatedAt).toLocaleString()} by {b.generatedBy}</span>
              <div className="flex gap-3">
                <button onClick={() => BriefApi.downloadXlsx(b.cycleId, b.id)} className="text-xs font-semibold" style={{ color: 'var(--good)' }}>Excel</button>
                <button onClick={() => BriefApi.downloadMarkdown(b.cycleId, b.id)} className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Markdown</button>
              </div>
            </div>
          ))}
          {briefs.length === 0 && <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>No briefs generated yet.</div>}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Logged non-signals</h2>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="text-sm rounded-lg px-2 py-1 border"
            style={{ borderColor: 'var(--border)' }}
          />
        </div>
        <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto scroll-thin">
          {nonSignals.map((it) => (
            <div key={it.id} className="rounded-lg p-3 text-sm" style={{ background: 'var(--surface-2)' }}>
              <div className="text-xs mb-1" style={{ color: 'var(--ink-muted)' }}>{weekLabel(it.cycleId)} · {it.sourceType} · {new Date(it.createdAt).toLocaleString()}</div>
              <div>{it.rawText}</div>
            </div>
          ))}
          {nonSignals.length === 0 && <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>Nothing logged yet.</div>}
        </div>
      </div>
    </div>
  );
}
