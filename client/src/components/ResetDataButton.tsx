import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Admin } from '../api/client';
import { useApp } from '../context/AppContext';

const CONFIRM_WORD = 'RESET';

export function ResetDataButton() {
  const { actor, role } = useApp();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setTyped('');
    setError(null);
  }

  async function confirmReset() {
    setBusy(true);
    setError(null);
    try {
      await Admin.reset({ actor, role });
      // Drop the cached cycle id — it no longer exists post-reset — so the
      // reload picks the fresh cycle immediately instead of 404ing on the
      // stale one first. A full reload is deliberate beyond that: every
      // page's local state (items, signals, graph, etc.) needs to forget
      // the wiped data, and this guarantees it does, with zero risk of a
      // stale cache lingering anywhere.
      localStorage.removeItem('mst_cycle');
      window.location.href = '/';
    } catch {
      setError('Reset failed — the server may be unreachable. Try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Permanently delete all data and start over"
        className="text-sm rounded-lg px-2.5 py-1.5 border font-medium hover:opacity-80"
        style={{ borderColor: 'var(--border)', color: 'var(--critical)' }}
      >
        Reset data
      </button>

      {open && createPortal(
        // Portaled to <body> deliberately: this button lives inside <header>,
        // which sets `backdrop-filter` for its frosted-glass look — and
        // backdrop-filter (like transform) creates a new containing block,
        // which would silently break this modal's `position: fixed`
        // centering if it stayed nested inside the header's DOM subtree.
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={close}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.35)' }} />
          <div
            className="card relative w-full max-w-md p-5"
            style={{ borderColor: 'var(--critical)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-2" style={{ color: 'var(--critical)' }}>Reset all data?</h3>
            <p className="text-sm mb-3" style={{ color: 'var(--ink-secondary)' }}>
              This permanently deletes every cycle, item, signal, priority, weight-profile
              version, brief, and audit-log entry — on this server, for everyone using it.
              <strong> This cannot be undone.</strong> A fresh, empty current-week cycle is
              created afterward so you can start again.
            </p>
            <label className="text-sm flex flex-col gap-1 mb-3">
              Type <strong>{CONFIRM_WORD}</strong> to confirm
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && typed === CONFIRM_WORD && !busy && confirmReset()}
                className="rounded-lg px-3 py-2 border text-sm"
                style={{ borderColor: 'var(--border)' }}
              />
            </label>
            {error && <div className="text-sm mb-3" style={{ color: 'var(--critical)' }}>{error}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={close} className="text-sm font-medium px-3 py-1.5 rounded-lg" style={{ color: 'var(--ink-secondary)' }}>
                Cancel
              </button>
              <button
                onClick={confirmReset}
                disabled={typed !== CONFIRM_WORD || busy}
                className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
                style={{ background: 'var(--critical)' }}
              >
                {busy ? 'Resetting…' : 'Delete everything'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
