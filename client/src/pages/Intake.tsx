import { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { Items, Cycles } from '../api/client';
import type { Item, Task } from '../types';
import { SOURCE_TYPES } from '../types';
import { Pill } from '../components/Badges';

const HEADER_HINTS = ['item', 'text', 'signal', 'note', 'description', 'headline', 'source'];

function looksLikeHeaderRow(row: unknown[]): boolean {
  const cells = row.map((c) => String(c ?? '').trim());
  if (cells.every((c) => c.length === 0)) return false;
  const joined = cells.join(' ').toLowerCase();
  return HEADER_HINTS.some((hint) => joined.includes(hint)) && cells.every((c) => c.length < 40);
}

/** Parses a pasted .xlsx/.xls/.csv file into one item of text per non-empty row. */
function extractRowsAsText(buffer: ArrayBuffer): string[] {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const startIdx = rows.length && looksLikeHeaderRow(rows[0]) ? 1 : 0;
  const texts: string[] = [];
  for (let i = startIdx; i < rows.length; i++) {
    const cells = (rows[i] || []).map((c) => (c === undefined || c === null ? '' : String(c).trim())).filter(Boolean);
    if (cells.length === 0) continue;
    texts.push(cells.join(' — '));
  }
  return texts;
}

export default function Intake() {
  const { actor, role, cycleId, cycle, refreshCycle } = useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [text, setText] = useState('');
  const [sourceType, setSourceType] = useState<string>(SOURCE_TYPES[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!cycleId) return;
    const [i, t] = await Promise.all([Items.list(cycleId), Cycles.tasks(cycleId)]);
    setItems(i);
    setTasks(t);
  }, [cycleId]);

  useEffect(() => { load(); }, [load]);

  async function handleSubmit() {
    if (!cycleId || !text.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await Items.bulk(cycleId, { text, sourceType, actor, role });
      setMsg(`Added ${result.created} item(s)${result.mergedAsRepeat ? `, merged ${result.mergedAsRepeat} as repeat mentions (severity bumped)` : ''}.`);
      setText('');
      await Promise.all([load(), refreshCycle()]);
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !cycleId) return;
    setBusy(true);
    setMsg(null);
    try {
      const buffer = await file.arrayBuffer();
      const rows = extractRowsAsText(buffer);
      if (rows.length === 0) {
        setMsg(`No rows found in "${file.name}" — check it has one item per row.`);
        return;
      }
      const result = await Items.bulk(cycleId, { text: rows.join('\n---\n'), sourceType, actor, role });
      setMsg(`Imported ${result.created} item(s) from ${file.name}${result.mergedAsRepeat ? `, merged ${result.mergedAsRepeat} as repeat mentions` : ''}.`);
      await Promise.all([load(), refreshCycle()]);
    } catch {
      setMsg(`Couldn't read "${file.name}" — make sure it's a valid .xlsx, .xls, or .csv file.`);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleMarkCompiled() {
    if (!cycleId) return;
    const updated = await Cycles.markCompiled(cycleId, { actor, role });
    setMsg(updated.warning || 'Week marked compiled — ready for analysis.');
    await refreshCycle();
  }

  async function handleCompleteTask(taskId: string) {
    if (!cycleId) return;
    await Cycles.updateTask(cycleId, taskId, { actor, role, status: 'done' });
    await load();
  }

  if (!cycle) return null;

  return (
    <div className="p-5 max-w-5xl mx-auto flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Intake — {cycle.weekLabel}</h1>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            {items.length} item(s) captured · minimum {cycle.minItems} · cutoff {new Date(cycle.cutoffAt).toLocaleString()}
          </p>
        </div>
        <button
          onClick={handleMarkCompiled}
          disabled={cycle.state !== 'collecting'}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--good)' }}
        >
          {cycle.state === 'collecting' ? 'Mark week compiled' : `Already ${cycle.state}`}
        </button>
      </div>

      {tasks.filter((t) => t.status === 'open').length > 0 && (
        <div className="card p-4" style={{ borderColor: 'var(--warning)' }}>
          <h2 className="text-sm font-semibold mb-2">Open compile tasks</h2>
          {tasks.filter((t) => t.status === 'open').map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm py-1">
              <span>Assigned to <strong>{t.assignee}</strong> · due {new Date(t.dueAt).toLocaleString()} {t.note && `— "${t.note}"`}</span>
              <button onClick={() => handleCompleteTask(t.id)} className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Mark done</button>
            </div>
          ))}
        </div>
      )}

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-2">Paste items</h2>
        <p className="text-xs mb-2" style={{ color: 'var(--ink-muted)' }}>
          Paste one item, or several separated by a blank line or <code>---</code>. Any format works — headlines, notes, quotes.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={'Competitor X cut pricing on their enterprise tier by 20%.\n---\nCompetitor Y raised a $50M Series B.'}
          className="w-full rounded-lg p-3 text-sm border scroll-thin"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
        />
        <div className="flex items-center justify-between mt-3">
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="text-sm rounded-lg px-2 py-1.5 border"
            style={{ borderColor: 'var(--border)' }}
          >
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          <button
            onClick={handleSubmit}
            disabled={busy || !text.trim()}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {busy ? 'Adding…' : 'Add to intake'}
          </button>
        </div>
        <div className="flex items-center gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--gridline)' }}>
          <label
            className="flex-1 flex items-center justify-center gap-2 text-sm font-medium rounded-lg py-3 cursor-pointer border border-dashed transition-colors hover:opacity-80"
            style={{ borderColor: 'var(--border)', color: 'var(--ink-secondary)' }}
          >
            <span aria-hidden>📄</span>
            {busy ? 'Importing…' : 'Or upload a spreadsheet (.xlsx, .xls, .csv) — one item per row'}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} disabled={busy} className="hidden" />
          </label>
        </div>
        {msg && <div className="text-sm mt-3" style={{ color: 'var(--accent)' }}>{msg}</div>}
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-3">Items this cycle</h2>
        <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto scroll-thin">
          {items.map((it) => (
            <div key={it.id} className="rounded-lg p-3 text-sm flex items-start justify-between gap-3" style={{ background: 'var(--surface-2)' }}>
              <div>
                <div className="text-xs mb-1 flex items-center gap-2" style={{ color: 'var(--ink-muted)' }}>
                  <span>{it.sourceType}</span>
                  <span>·</span>
                  <span>{new Date(it.createdAt).toLocaleString()}</span>
                  {it.mentionCount > 1 && <Pill tone="violet">×{it.mentionCount} mentions</Pill>}
                </div>
                <div>{it.rawText}</div>
              </div>
              <Pill tone={it.status === 'non_signal' ? 'neutral' : it.status === 'pending' ? 'accent' : 'violet'}>{it.status}</Pill>
            </div>
          ))}
          {items.length === 0 && <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>No items yet — paste some above.</div>}
        </div>
      </div>
    </div>
  );
}
