import axios from 'axios';
import type {
  Cycle, Item, Signal, ContextPriority, WeightProfile, OwnerMapEntry, Task,
  RunLog, Approval, Brief, GraphResponse, Metrics, AuditEntry,
} from '../types';

const api = axios.create({ baseURL: '/api' });

// A small helper so every call carries who's acting, for the audit trail —
// the app has no real auth, but every write should still say who did it.
export interface Actor { actor: string; role: string; }

export const Cycles = {
  list: () => api.get<Cycle[]>('/cycles').then((r) => r.data),
  get: (id: string) => api.get<Cycle>(`/cycles/${id}`).then((r) => r.data),
  create: (body: Actor & { minItems?: number }) => api.post<Cycle>('/cycles', body).then((r) => r.data),
  markCompiled: (id: string, body: Actor) => api.post<Cycle>(`/cycles/${id}/mark-compiled`, body).then((r) => r.data),
  assignCollection: (id: string, body: Actor & { assignee: string; dueAt?: string; note?: string }) =>
    api.post<Task>(`/cycles/${id}/assign-collection`, body).then((r) => r.data),
  tasks: (id: string) => api.get<Task[]>(`/cycles/${id}/tasks`).then((r) => r.data),
  updateTask: (cycleId: string, taskId: string, body: Actor & { status: string }) =>
    api.patch<Task>(`/cycles/${cycleId}/tasks/${taskId}`, body).then((r) => r.data),
  graph: (id: string) => api.get<GraphResponse>(`/cycles/${id}/graph`).then((r) => r.data),
};

export const Items = {
  list: (cycleId: string) => api.get<Item[]>(`/cycles/${cycleId}/items`).then((r) => r.data),
  create: (cycleId: string, body: Actor & { rawText: string; sourceType: string }) =>
    api.post(`/cycles/${cycleId}/items`, body).then((r) => r.data),
  bulk: (cycleId: string, body: Actor & { text: string; sourceType: string }) =>
    api.post(`/cycles/${cycleId}/items/bulk`, body).then((r) => r.data),
};

export const Context = {
  list: (cycleId: string) => api.get<ContextPriority[]>(`/cycles/${cycleId}/context`).then((r) => r.data),
  add: (cycleId: string, body: Actor & { text: string }) => api.post<ContextPriority>(`/cycles/${cycleId}/context`, body).then((r) => r.data),
  update: (id: string, body: Actor & { text?: string; active?: boolean }) => api.patch<ContextPriority>(`/context/${id}`, body).then((r) => r.data),
  remove: (id: string, body: Actor) => api.delete(`/context/${id}`, { data: body }),
};

export const Weights = {
  list: () => api.get<WeightProfile[]>('/weight-profiles').then((r) => r.data),
  active: () => api.get<WeightProfile | null>('/weight-profiles/active').then((r) => r.data),
  publish: (body: Actor & { name: string; categoryWeights: Record<string, number>; multiplier: number; thresholds: { high: number; medium: number }; notes?: string }) =>
    api.post<WeightProfile>('/weight-profiles', body).then((r) => r.data),
  activate: (id: string, body: Actor) => api.post<WeightProfile>(`/weight-profiles/${id}/activate`, body).then((r) => r.data),
  rescorePending: (body: Actor & { cycleId: string }) => api.post('/weight-profiles/rescore-pending', body).then((r) => r.data),
};

export const OwnerMap = {
  list: () => api.get<OwnerMapEntry[]>('/owner-map').then((r) => r.data),
  update: (signalType: string, body: Actor & { ownerRole?: string; suggestedAction?: string; responseWindow?: string }) =>
    api.put<OwnerMapEntry>(`/owner-map/${signalType}`, body).then((r) => r.data),
};

export const Analysis = {
  run: (cycleId: string, body: Actor & { confidenceThreshold?: number }) =>
    api.post(`/cycles/${cycleId}/run-analysis`, body).then((r) => r.data),
};

export const Signals = {
  list: (cycleId: string, params?: { status?: string; tier?: string }) =>
    api.get<Signal[]>(`/cycles/${cycleId}/signals`, { params }).then((r) => r.data),
  get: (id: string) => api.get<Signal>(`/signals/${id}`).then((r) => r.data),
  confirm: (id: string, body: Actor & { note?: string }) => api.post<Signal>(`/signals/${id}/confirm`, body).then((r) => r.data),
  dismiss: (id: string, body: Actor & { note?: string }) => api.post<Signal>(`/signals/${id}/dismiss`, body).then((r) => r.data),
  reassign: (id: string, body: Actor & { owner_role?: string; suggested_action?: string; response_window?: string; tier?: string; deadline?: string; reason?: string }) =>
    api.patch<Signal>(`/signals/${id}`, body).then((r) => r.data),
  bulkConfirm: (cycleId: string, body: Actor & { signalIds: string[] }) => api.post(`/cycles/${cycleId}/signals/bulk-confirm`, body).then((r) => r.data),
};

export const Digest = {
  get: (cycleId: string) => api.get(`/cycles/${cycleId}/digest`).then((r) => r.data),
};

export const BriefApi = {
  queue: (cycleId: string) => api.get<Signal[]>(`/cycles/${cycleId}/queue`).then((r) => r.data),
  approve: (cycleId: string, body: Actor & { signalIds?: string[] }) => api.post<Approval>(`/cycles/${cycleId}/approve`, body).then((r) => r.data),
  generate: (cycleId: string, body: Actor) => api.post<Brief>(`/cycles/${cycleId}/brief/generate`, body).then((r) => r.data),
  latest: (cycleId: string) => api.get<{ brief: Brief; signals: Signal[] }>(`/cycles/${cycleId}/brief/latest`).then((r) => r.data),
  runLogs: (cycleId: string) => api.get<RunLog[]>(`/cycles/${cycleId}/run-logs`).then((r) => r.data),
  exportXlsxUrl: (cycleId: string, briefId: string) => `/api/cycles/${cycleId}/brief/${briefId}/export.xlsx`,
  exportMdUrl: (cycleId: string, briefId: string) => `/api/cycles/${cycleId}/brief/${briefId}/export.md`,
  runLogExportUrl: (cycleId: string) => `/api/cycles/${cycleId}/run-logs/export.xlsx`,
};

export const Admin = {
  reset: (body: Actor) => api.post<{ ok: true; cycle: Cycle }>('/admin/reset', body).then((r) => r.data),
};

export const Archive = {
  nonSignals: (q?: string) => api.get<Item[]>('/archive/non-signals', { params: { q } }).then((r) => r.data),
  briefs: () => api.get<Brief[]>('/archive/briefs').then((r) => r.data),
};

export const AuditApi = {
  list: (cycleId?: string) => api.get<AuditEntry[]>('/audit-log', { params: { cycleId } }).then((r) => r.data),
};

export const MetricsApi = {
  get: (cycleId: string) => api.get<Metrics>(`/cycles/${cycleId}/metrics`).then((r) => r.data),
};

export default api;
