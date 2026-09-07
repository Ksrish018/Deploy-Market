export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'good' | 'warning' | 'critical' | 'accent';
}) {
  const toneColor = {
    neutral: 'var(--ink-primary)',
    good: 'var(--good)',
    warning: 'var(--warning)',
    critical: 'var(--critical)',
    accent: 'var(--accent)',
  }[tone];

  return (
    <div className="card p-4 flex flex-col gap-1 min-w-[160px]">
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ink-muted)' }}>{label}</span>
      <span className="text-3xl font-semibold" style={{ color: toneColor, fontVariantNumeric: 'proportional-nums' }}>{value}</span>
      {sub && <span className="text-xs" style={{ color: 'var(--ink-secondary)' }}>{sub}</span>}
    </div>
  );
}
