// The entire backend, replaced: instead of a server holding one JSON file
// (or Postgres row), the browser's own localStorage holds the whole app
// state. This is what makes the app work with zero server and zero
// deployment — open the HTML file anywhere and it just works — at the
// cost of that data being private to whichever browser opened it (see the
// README section on the offline build for that trade-off).
import { defaultState, type AppState } from './seed';

const STORAGE_KEY = 'market_signal_triage_state_v1';

let cached: AppState | null = null;

function load(): AppState {
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cached = JSON.parse(raw) as AppState;
      return cached;
    }
  } catch (e) {
    console.error('[store] stored state was unreadable, reinitializing from seed:', e);
  }
  cached = defaultState();
  persist(cached);
  return cached;
}

function persist(state: AppState) {
  cached = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Most likely quota exceeded (localStorage is typically ~5-10MB) —
    // surfacing this clearly beats silently losing the write.
    console.error('[store] failed to save — localStorage may be full:', e);
    throw new Error('Could not save: browser storage may be full. Try exporting a brief and starting a fresh cycle.');
  }
}

export function getState(): AppState {
  return load();
}

export function saveState(state: AppState): void {
  persist(state);
}

export function resetState(): AppState {
  const fresh = defaultState();
  persist(fresh);
  return fresh;
}
