// Picks which backend this app talks to, automatically, with no build-time
// flag to remember to set:
//
//  - Opened as a plain file (file:// — the offline single-file build):
//    there is no server at all, so every call runs locally against
//    localStorage (see localClient.ts / src/local/*).
//  - Served over http(s) by anything (dev, the .exe, Docker/Fly.io, Vercel):
//    a real backend is available at /api/*, so calls go there as before
//    (see remoteClient.ts) — including the shared Postgres-backed data on
//    Vercel, which the offline mode must never bypass.
//
// The same built HTML file works correctly either way — this check is what
// makes that possible, and it's why every page imports only from here.
import * as remote from './remoteClient';
import * as local from './localClient';

const isOffline = typeof window !== 'undefined' && window.location.protocol === 'file:';
const impl = isOffline ? local : remote;

export const Cycles = impl.Cycles;
export const Items = impl.Items;
export const Context = impl.Context;
export const Weights = impl.Weights;
export const OwnerMap = impl.OwnerMap;
export const Analysis = impl.Analysis;
export const Signals = impl.Signals;
export const Digest = impl.Digest;
export const BriefApi = impl.BriefApi;
export const Admin = impl.Admin;
export const Archive = impl.Archive;
export const AuditApi = impl.AuditApi;
export const MetricsApi = impl.MetricsApi;

export type { Actor } from './remoteClient';
