import type { Tier, GraphNode } from '../types';

const TIER_STYLE: Record<Tier, { bg: string; fg: string; icon: string; label: string }> = {
  high: { bg: 'var(--critical-soft)', fg: 'var(--critical)', icon: '●', label: 'High' },
  medium: { bg: 'var(--warning-soft)', fg: 'var(--warning)', icon: '●', label: 'Medium' },
  low: { bg: 'var(--good-soft)', fg: 'var(--good)', icon: '●', label: 'Low' },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const s = TIER_STYLE[tier];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: s.bg, color: s.fg }}
    >
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

const NODE_STATE_STYLE: Record<GraphNode['state'], { bg: string; fg: string; label: string }> = {
  idle: { bg: 'var(--surface-2)', fg: 'var(--ink-muted)', label: 'Idle' },
  running: { bg: 'var(--accent-soft)', fg: 'var(--accent)', label: 'Running' },
  'needs-human': { bg: 'var(--warning-soft)', fg: 'var(--warning)', label: 'Needs human' },
  blocked: { bg: 'var(--critical-soft)', fg: 'var(--critical)', label: 'Blocked' },
  done: { bg: 'var(--good-soft)', fg: 'var(--good)', label: 'Done' },
};

export function StateBadge({ state }: { state: GraphNode['state'] }) {
  const s = NODE_STATE_STYLE[state];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'violet' }) {
  const styles = {
    neutral: { bg: 'var(--surface-2)', fg: 'var(--ink-secondary)' },
    accent: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
    violet: { bg: 'var(--violet-soft)', fg: 'var(--violet)' },
  }[tone];
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: styles.bg, color: styles.fg }}>
      {children}
    </span>
  );
}
