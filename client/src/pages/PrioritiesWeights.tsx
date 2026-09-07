import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { Context, Weights, OwnerMap } from '../api/client';
import type { ContextPriority, WeightProfile, OwnerMapEntry } from '../types';
import { Pill } from '../components/Badges';

const CATEGORY_LABELS: Record<string, string> = {
  pricing_financial: 'Pricing / Financial',
  funding_ma: 'Funding / M&A',
  product_feature: 'Product / Feature',
  sales_customer: 'Sales / Customer',
  partnership_positioning: 'Partnership / Positioning',
  hiring_hr: 'Hiring / HR',
  industry_regulatory: 'Industry / Regulatory',
};

export default function PrioritiesWeights() {
  const { actor, role, cycleId, cycle } = useApp();
  const [priorities, setPriorities] = useState<ContextPriority[]>([]);
  const [newPriority, setNewPriority] = useState('');
  const [profiles, setProfiles] = useState<WeightProfile[]>([]);
  const [ownerMap, setOwnerMap] = useState<OwnerMapEntry[]>([]);
  const [draftWeights, setDraftWeights] = useState<Record<string, number>>({});
  const [draftMultiplier, setDraftMultiplier] = useState(1.5);
  const [draftThresholds, setDraftThresholds] = useState({ high: 6, medium: 3 });
  const [profileName, setProfileName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cycleId) return;
    const [p, w, om] = await Promise.all([Context.list(cycleId), Weights.list(), OwnerMap.list()]);
    setPriorities(p);
    setProfiles(w);
    setOwnerMap(om);
    const active = w.find((x) => x.active) || w[0];
    if (active) {
      setDraftWeights(active.categoryWeights);
      setDraftMultiplier(active.multiplier);
      setDraftThresholds(active.thresholds);
    }
  }, [cycleId]);

  useEffect(() => { load(); }, [load]);

  async function addPriority() {
    if (!cycleId || !newPriority.trim()) return;
    await Context.add(cycleId, { text: newPriority.trim(), actor, role });
    setNewPriority('');
    await load();
  }

  async function toggleActive(p: ContextPriority) {
    await Context.update(p.id, { active: !p.active, actor, role });
    await load();
  }

  async function removePriority(p: ContextPriority) {
    await Context.remove(p.id, { actor, role });
    await load();
  }

  async function publishProfile() {
    const nextVersion = Math.max(0, ...profiles.map((p) => p.version)) + 1;
    await Weights.publish({
      name: profileName.trim() || `v${nextVersion}`,
      categoryWeights: draftWeights,
      multiplier: draftMultiplier,
      thresholds: draftThresholds,
      actor,
      role,
    });
    setProfileName('');
    setMsg('New weight profile published and activated.');
    await load();
  }

  async function activateProfile(id: string) {
    await Weights.activate(id, { actor, role });
    await load();
  }

  async function rescorePending() {
    if (!cycleId) return;
    const result = await Weights.rescorePending({ cycleId, actor, role });
    setMsg(`Re-scored ${result.rescored} pending signal(s); ${result.changed} changed tier/severity.`);
    await load();
  }

  async function updateOwnerMap(signalType: string, patch: { ownerRole?: string; suggestedAction?: string; responseWindow?: string }) {
    await OwnerMap.update(signalType, { ...patch, actor, role });
    await load();
  }

  const activeProfile = profiles.find((p) => p.active);

  return (
    <div className="p-5 max-w-5xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Priorities & Weights</h1>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
          Leadership steers attention here. Changing a weight or a priority changes what the classifier flags — no rules to rewrite.
        </p>
      </div>

      {msg && <div className="text-sm rounded-lg px-3 py-2" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{msg}</div>}

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-2">Active priorities — {cycle?.weekLabel}</h2>
        <div className="flex flex-col gap-2 mb-3">
          {priorities.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)' }}>
              <span className={p.active ? '' : 'line-through opacity-50'}>{p.text}</span>
              <div className="flex items-center gap-3">
                <button onClick={() => toggleActive(p)} className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{p.active ? 'Deactivate' : 'Activate'}</button>
                <button onClick={() => removePriority(p)} className="text-xs font-semibold" style={{ color: 'var(--critical)' }}>Remove</button>
              </div>
            </div>
          ))}
          {priorities.length === 0 && <div className="text-sm" style={{ color: 'var(--ink-muted)' }}>No priorities set for this cycle yet.</div>}
        </div>
        <div className="flex gap-2">
          <input
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPriority()}
            placeholder="e.g. Defend enterprise pricing against undercutting"
            className="flex-1 text-sm rounded-lg px-3 py-2 border"
            style={{ borderColor: 'var(--border)' }}
          />
          <button onClick={addPriority} className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>Add</button>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Weight profile editor {activeProfile && <Pill tone="accent">active: v{activeProfile.version} {activeProfile.name}</Pill>}</h2>
          <button onClick={rescorePending} className="text-xs font-semibold" style={{ color: 'var(--violet)' }}>Re-score pending signals now</button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          {Object.keys(CATEGORY_LABELS).map((cat) => (
            <div key={cat} className="flex items-center justify-between gap-3 text-sm">
              <span>{CATEGORY_LABELS[cat]}</span>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={1} max={5} step={1}
                  value={draftWeights[cat] ?? 1}
                  onChange={(e) => setDraftWeights((w) => ({ ...w, [cat]: Number(e.target.value) }))}
                />
                <span className="w-5 text-right font-semibold tabular-nums">{draftWeights[cat] ?? 1}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 items-center mb-3 text-sm">
          <label className="flex items-center gap-2">Priority multiplier
            <input type="number" step={0.1} value={draftMultiplier} onChange={(e) => setDraftMultiplier(Number(e.target.value))} className="w-16 rounded border px-2 py-1" style={{ borderColor: 'var(--border)' }} />
          </label>
          <label className="flex items-center gap-2">High ≥
            <input type="number" value={draftThresholds.high} onChange={(e) => setDraftThresholds((t) => ({ ...t, high: Number(e.target.value) }))} className="w-14 rounded border px-2 py-1" style={{ borderColor: 'var(--border)' }} />
          </label>
          <label className="flex items-center gap-2">Medium ≥
            <input type="number" value={draftThresholds.medium} onChange={(e) => setDraftThresholds((t) => ({ ...t, medium: Number(e.target.value) }))} className="w-14 rounded border px-2 py-1" style={{ borderColor: 'var(--border)' }} />
          </label>
        </div>
        <div className="flex gap-2">
          <input
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder='Profile name, e.g. "Product-war mode"'
            className="flex-1 text-sm rounded-lg px-3 py-2 border"
            style={{ borderColor: 'var(--border)' }}
          />
          <button onClick={publishProfile} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: 'var(--good)' }}>Publish & activate</button>
        </div>

        <div className="mt-4">
          <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--ink-muted)' }}>Version history (reversible)</h3>
          <div className="flex flex-col gap-1">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm rounded-lg px-3 py-1.5" style={{ background: p.active ? 'var(--accent-soft)' : 'var(--surface-2)' }}>
                <span>v{p.version} — {p.name}</span>
                {!p.active && <button onClick={() => activateProfile(p.id)} className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>Roll back to this</button>}
                {p.active && <Pill tone="accent">active</Pill>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-semibold mb-1">Owner routing table</h2>
        <p className="text-xs mb-3" style={{ color: 'var(--ink-muted)' }}>
          The default owner/action/window for each signal type. The Context-keeper can edit these defaults here, or override a single signal in the Review Queue.
        </p>
        <div className="flex flex-col gap-2">
          {ownerMap.map((o) => (
            <div key={o.signalType} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center text-sm rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)' }}>
              <span className="font-medium">{o.label}</span>
              <input defaultValue={o.ownerRole} onBlur={(e) => e.target.value !== o.ownerRole && updateOwnerMap(o.signalType, { ownerRole: e.target.value })} className="rounded border px-2 py-1" style={{ borderColor: 'var(--border)' }} />
              <input defaultValue={o.suggestedAction} onBlur={(e) => e.target.value !== o.suggestedAction && updateOwnerMap(o.signalType, { suggestedAction: e.target.value })} className="rounded border px-2 py-1" style={{ borderColor: 'var(--border)' }} />
              <select defaultValue={o.responseWindow} onChange={(e) => updateOwnerMap(o.signalType, { responseWindow: e.target.value })} className="rounded border px-2 py-1" style={{ borderColor: 'var(--border)' }}>
                <option value="same_day">Same day</option>
                <option value="this_week">This week</option>
                <option value="background">Background</option>
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
