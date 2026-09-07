import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { Cycles } from '../api/client';
import type { Cycle, Role } from '../types';
import { ROLES } from '../types';

interface AppState {
  actor: string;
  role: Role;
  setActor: (a: string) => void;
  setRole: (r: Role) => void;
  cycles: Cycle[];
  cycleId: string | null;
  setCycleId: (id: string) => void;
  cycle: Cycle | null;
  refreshCycles: () => Promise<void>;
  refreshCycle: () => Promise<void>;
  createCycle: () => Promise<void>;
}

const AppCtx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [actor, setActorState] = useState(() => localStorage.getItem('mst_actor') || 'Alex Rivera');
  const [role, setRoleState] = useState<Role>(() => (localStorage.getItem('mst_role') as Role) || ROLES[0]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cycleId, setCycleIdState] = useState<string | null>(() => localStorage.getItem('mst_cycle'));

  const setActor = (a: string) => { setActorState(a); localStorage.setItem('mst_actor', a); };
  const setRole = (r: Role) => { setRoleState(r); localStorage.setItem('mst_role', r); };
  const setCycleId = (id: string) => { setCycleIdState(id); localStorage.setItem('mst_cycle', id); };

  const refreshCycles = useCallback(async () => {
    const list = await Cycles.list();
    setCycles(list);
    // Fall back to the first cycle if none is selected yet, or if the
    // previously-selected one (cached in localStorage) no longer exists —
    // e.g. after a full data reset wipes it out from under a stale id.
    const stillExists = cycleId && list.some((c) => c.id === cycleId);
    if (!stillExists && list.length > 0) {
      setCycleId(list[0].id);
    }
  }, [cycleId]);

  useEffect(() => { refreshCycles(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cycle = cycles.find((c) => c.id === cycleId) || null;

  const refreshCycle = useCallback(async () => {
    if (!cycleId) return;
    const updated = await Cycles.get(cycleId);
    setCycles((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }, [cycleId]);

  const createCycle = useCallback(async () => {
    const created = await Cycles.create({ actor, role, minItems: 10 });
    await refreshCycles();
    setCycleId(created.id);
  }, [actor, role, refreshCycles]);

  return (
    <AppCtx.Provider value={{ actor, role, setActor, setRole, cycles, cycleId, setCycleId, cycle, refreshCycles, refreshCycle, createCycle }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
