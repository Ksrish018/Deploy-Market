// Client-side replacement for server/src/excel.js. Uses SheetJS (`xlsx`,
// already bundled for the Intake upload feature) instead of `exceljs`,
// since exceljs is Node-oriented and this now has to run in the browser
// with no server at all.
//
// One honest trade-off: the free/community build of SheetJS used here has
// limited cell-fill/color support compared to exceljs, so this export is
// clean and fully data-complete but doesn't color-code tiers the way the
// server version's workbook does. Column widths and sheet structure match.
import * as XLSX from 'xlsx';
import type { Cycle, ContextPriority, WeightProfile, Signal, RunLog, Item, Approval } from '../types';

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function sheetFromAOA(rows: unknown[][], colWidths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = colWidths.map((wch) => ({ wch }));
  return sheet;
}

export interface BriefWorkbookData {
  cycle: Cycle;
  contextPriorities: ContextPriority[];
  weightProfiles: WeightProfile[];
  signals: Signal[];
  runLogs: RunLog[];
  nonSignalItems: Item[];
  approvals: Approval[];
}

export function buildBriefWorkbook({ cycle, contextPriorities, weightProfiles, signals, runLogs, nonSignalItems, approvals }: BriefWorkbookData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // --- Sheet 1: Action Table (the primary ask) ---
  const actionHeader = ['#', 'Tier', 'Severity', 'Signal Type', 'Category', 'Summary / Source Text', 'Why It Matters', 'Owner', 'Suggested Action', 'Deadline', 'Confidence', 'Status', 'Confirmed By', 'Manually Reassigned', 'Weight Profile'];
  const actionRows = signals.map((s, i) => [
    i + 1,
    s.tier.toUpperCase(),
    s.severity_score,
    s.signal_type,
    s.category,
    s.sourceText,
    s.why_it_matters,
    s.owner_role,
    s.suggested_action,
    fmtDate(s.deadline),
    s.confidence,
    s.status,
    s.reviewedBy || '',
    s.manuallyEdited ? 'Yes' : '',
    `v${s.weight_profile_version}`,
  ]);
  const actionSheet = sheetFromAOA([actionHeader, ...actionRows], [4, 9, 9, 26, 20, 50, 45, 26, 40, 18, 10, 12, 18, 10, 12]);
  actionSheet['!autofilter'] = { ref: `A1:O${actionRows.length + 1}` };
  XLSX.utils.book_append_sheet(wb, actionSheet, 'Action Table');

  // --- Sheet 2: Cycle Info & Sign-off ---
  const infoRows: unknown[][] = [
    ['Cycle', cycle.weekLabel],
    ['Week', `${fmtDate(cycle.weekStart)} – ${fmtDate(cycle.weekEnd)}`],
    ['Cycle state', cycle.state],
    ['Generated at', fmtDate(new Date().toISOString())],
    [],
    ['Active priorities this cycle'],
    ...(contextPriorities.length ? contextPriorities.map((p) => ['', p.text]) : [['', '(none set)']]),
    [],
    ['Weight profile version(s) in force'],
    ...weightProfiles.map((p) => [`v${p.version} — ${p.name}`, JSON.stringify(p.categoryWeights)]),
    [],
    ['Sign-off record'],
    ['Approver', 'Approved At'],
    ...approvals.map((a) => [a.approver, fmtDate(a.approvedAt)]),
  ];
  XLSX.utils.book_append_sheet(wb, sheetFromAOA(infoRows, [28, 70]), 'Cycle Info & Sign-off');

  // --- Sheet 3: Run Log (for next meeting) ---
  XLSX.utils.book_append_sheet(wb, buildRunLogSheet(runLogs), 'Run Log');

  // --- Sheet 4: Non-Signals (Logged, for transparency/archive) ---
  const nsHeader = ['Source Type', 'Text', 'Reason', 'Logged At'];
  const nsRows = nonSignalItems.map((it) => [it.sourceType, it.rawText, it.nonSignalReason || '', fmtDate(it.createdAt)]);
  XLSX.utils.book_append_sheet(wb, sheetFromAOA([nsHeader, ...nsRows], [16, 70, 50, 20]), 'Non-Signals (Logged)');

  return wb;
}

function buildRunLogSheet(runLogs: RunLog[]) {
  const header = ['Run #', 'Run At', 'Triggered By', 'Weight Profile', 'Items Processed', 'Signals Created', 'Non-Signals', 'High', 'Medium', 'Low', 'Needs Careful Review'];
  const rows = runLogs.map((r, i) => [
    i + 1,
    fmtDate(r.runAt),
    `${r.triggeredBy.actor} (${r.triggeredBy.role})`,
    `v${r.weightProfileVersion}`,
    r.itemsProcessed,
    r.signalsCreated,
    r.nonSignals,
    r.tierCounts.high,
    r.tierCounts.medium,
    r.tierCounts.low,
    r.needsReviewCount,
  ]);
  return sheetFromAOA([header, ...rows], [6, 20, 20, 12, 14, 14, 12, 8, 8, 8, 16]);
}

export function buildRunLogWorkbook(runLogs: RunLog[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildRunLogSheet(runLogs), 'Run Log');
  return wb;
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-');
}

export function downloadBriefXlsx(data: BriefWorkbookData) {
  const wb = buildBriefWorkbook(data);
  XLSX.writeFile(wb, `Market-Signal-Brief-${safeFilenamePart(data.cycle.weekLabel)}.xlsx`);
}

export function downloadRunLogXlsx(cycle: Cycle, runLogs: RunLog[]) {
  const wb = buildRunLogWorkbook(runLogs);
  XLSX.writeFile(wb, `Run-Log-${safeFilenamePart(cycle.weekLabel)}.xlsx`);
}

function downloadTextFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadBriefMarkdown({ cycle, contextPriorities, weightProfiles, signals, approvals, generatedAt, generatedBy, generatedByRole }: BriefWorkbookData & { generatedAt: string; generatedBy: string; generatedByRole: string }) {
  const lines = [
    `# Weekly Market Signal Brief — ${cycle.weekLabel}`,
    '',
    `Generated ${generatedAt} by ${generatedBy} (${generatedByRole})`,
    '',
    '## Active priorities',
    ...(contextPriorities.length ? contextPriorities.map((p) => `- ${p.text}`) : ['- (none set)']),
    '',
    `## Weight profile version(s): ${weightProfiles.map((p) => `v${p.version} (${p.name})`).join(', ')}`,
    '',
    '## Approved signals',
    '',
    '| Tier | Owner | Action | Deadline | Why it matters |',
    '|---|---|---|---|---|',
    ...signals.map((s) => `| ${s.tier.toUpperCase()} | ${s.owner_role} | ${s.suggested_action} | ${new Date(s.deadline).toLocaleString()} | ${s.why_it_matters} |`),
    '',
    '## Sign-off',
    ...approvals.map((a) => `- Approved by ${a.approver} (${a.approverRole}) at ${a.approvedAt}`),
  ];
  downloadTextFile(lines.join('\n'), `Market-Signal-Brief-${safeFilenamePart(cycle.weekLabel)}.md`, 'text/markdown');
}
