import { NavLink } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ROLES } from '../types';
import { ResetDataButton } from './ResetDataButton';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/intake', label: 'Intake' },
  { to: '/priorities', label: 'Priorities & Weights' },
  { to: '/review', label: 'Review Queue' },
  { to: '/queue', label: 'Priority Queue' },
  { to: '/brief', label: 'Brief' },
  { to: '/archive', label: 'Archive' },
];

export function TopBar() {
  const { actor, role, setActor, setRole, cycles, cycleId, setCycleId, createCycle } = useApp();

  return (
    <header
      className="sticky top-0 z-20"
      style={{
        background: 'color-mix(in srgb, var(--surface-1) 82%, transparent)',
        backdropFilter: 'blur(14px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(14px) saturate(1.4)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center gap-4 px-5 pt-3 pb-2 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--violet))' }}
          >
            MS
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-sm">Market Signal Triage</div>
            <div className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>Squad 14</div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0 flex-wrap">
          <select
            value={cycleId || ''}
            onChange={(e) => setCycleId(e.target.value)}
            className="text-sm rounded-lg px-2 py-1.5 border"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
          >
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>{c.weekLabel}</option>
            ))}
          </select>
          <button
            onClick={() => createCycle()}
            title="Start next week's cycle"
            className="text-sm rounded-lg px-2.5 py-1.5 border font-medium hover:opacity-80"
            style={{ borderColor: 'var(--border)', color: 'var(--ink-secondary)' }}
          >
            + New week
          </button>

          <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />

          <input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="Your name"
            className="text-sm rounded-lg px-2 py-1.5 border w-32"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof ROLES[number])}
            className="text-sm rounded-lg px-2 py-1.5 border"
            style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />

          <ResetDataButton />
        </div>
      </div>

      <nav className="flex items-center gap-1 px-5 pb-2 overflow-x-auto scroll-thin">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${isActive ? '' : 'hover:opacity-70'}`
            }
            style={({ isActive }) => ({
              background: isActive ? 'var(--accent-soft)' : 'transparent',
              color: isActive ? 'var(--accent)' : 'var(--ink-secondary)',
            })}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
