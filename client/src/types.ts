export type CycleState = 'not_started' | 'collecting' | 'compiled' | 'triaged' | 'approved' | 'archived';

export interface Cycle {
  id: string;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  state: CycleState;
  cutoffAt: string;
  minItems: number;
  createdBy: string;
  createdAt: string;
  compiledAt: string | null;
  isBlocked?: boolean;
  itemCount?: number;
  signalCount?: number;
  highCount?: number;
  pendingReview?: number;
  warning?: string | null;
}

export type ItemStatus = 'pending' | 'classified' | 'non_signal';

export interface Item {
  id: string;
  cycleId: string;
  rawText: string;
  normalizedText: string;
  sourceType: string;
  status: ItemStatus;
  mentionCount: number;
  lastMentionedAt: string | null;
  nonSignalReason?: string;
  createdBy: string;
  createdAt: string;
}

export type Tier = 'high' | 'medium' | 'low';
export type SignalStatus = 'proposed' | 'confirmed' | 'dismissed';

export interface EditHistoryEntry {
  at: string;
  actor: string;
  role: string;
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface Signal {
  id: string;
  itemId: string;
  cycleId: string;
  sourceText: string;
  sourceType: string;
  decision_relevant: boolean;
  category: string;
  reclassified_from: string | null;
  base_weight: number;
  priority_match: boolean;
  priority_multiplier: number;
  severity_score: number;
  tier: Tier;
  signal_type: string;
  why_it_matters: string;
  confidence: number;
  needs_review: boolean;
  owner_role: string;
  suggested_action: string;
  response_window: 'same_day' | 'this_week' | 'background';
  deadline: string;
  weight_profile_version: number;
  status: SignalStatus;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  manuallyEdited: boolean;
  editHistory: EditHistoryEntry[];
  reviewedBy: string | null;
  reviewedByRole?: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface ContextPriority {
  id: string;
  cycleId: string;
  text: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
}

export interface WeightProfile {
  id: string;
  version: number;
  name: string;
  categoryWeights: Record<string, number>;
  multiplier: number;
  thresholds: { high: number; medium: number };
  active: boolean;
  createdBy: string;
  createdAt: string;
  notes: string;
}

export interface OwnerMapEntry {
  signalType: string;
  label: string;
  ownerRole: string;
  suggestedAction: string;
  responseWindow: 'same_day' | 'this_week' | 'background';
}

export interface Task {
  id: string;
  cycleId: string;
  type: string;
  assignee: string;
  dueAt: string;
  note: string;
  status: 'open' | 'done';
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface RunLog {
  id: string;
  cycleId: string;
  runAt: string;
  triggeredBy: { actor: string; role: string };
  weightProfileVersion: number;
  itemsProcessed: number;
  signalsCreated: number;
  nonSignals: number;
  tierCounts: { high: number; medium: number; low: number };
  needsReviewCount: number;
  signalSnapshots: Array<{ id: string; signal_type: string; tier: Tier; owner_role: string; suggested_action: string; deadline: string }>;
}

export interface Approval {
  id: string;
  cycleId: string;
  approver: string;
  approverRole: string;
  approvedAt: string;
  signalIds: string[];
}

export interface Brief {
  id: string;
  cycleId: string;
  generatedAt: string;
  generatedBy: string;
  generatedByRole: string;
  weekLabel: string;
  signalIds: string[];
  weightProfileVersions: number[];
  approvalIds: string[];
}

export interface GraphNode {
  stage: string;
  label: string;
  state: 'idle' | 'running' | 'needs-human' | 'blocked' | 'done';
  count: number;
  detail: string;
}

export interface GraphResponse {
  cycleId: string;
  nodes: GraphNode[];
}

export interface Metrics {
  actionableSignalRate: number | null;
  timeToSurfaceMedianHrs: number | null;
  overrideRate: number | null;
  actNowVolume: number;
  beatenByCustomerRate: number | null;
  totals: {
    items: number;
    signals: number;
    confirmed: number;
    dismissed: number;
    proposed: number;
    nonSignals: number;
  };
  note: string;
}

export interface AuditEntry {
  id: string;
  actor: string;
  role: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  cycleId: string | null;
  at: string;
}

export const ROLES = ['Collector', 'Context-keeper', 'Leadership', 'Checkpoint owner', 'Signal owner'] as const;
export type Role = typeof ROLES[number];

export const SOURCE_TYPES = ['news', 'social', 'funding', 'customer_conversation', 'industry_report', 'competitor_website', 'other'] as const;
