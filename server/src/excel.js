import ExcelJS from 'exceljs';

const TIER_FILL = {
  high: 'FFE53935',
  medium: 'FFFB8C00',
  low: 'FF43A047',
};
const HEADER_FILL = 'FF1F2937';

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 22;
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Builds the primary deliverable: an Owner/Action Excel workbook for the
 * cycle, plus a run-log sheet so the pipeline's work is on record for the
 * next meeting even if nobody opens the app again.
 */
export function buildBriefWorkbook({ cycle, contextPriorities, weightProfiles, signals, runLogs, nonSignalItems, approvals }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Market Signal Triage';
  wb.created = new Date();

  // --- Sheet 1: Action Table (the primary ask) ---
  const actionSheet = wb.addWorksheet('Action Table', { views: [{ state: 'frozen', ySplit: 1 }] });
  actionSheet.columns = [
    { header: '#', key: 'idx', width: 4 },
    { header: 'Tier', key: 'tier', width: 9 },
    { header: 'Severity', key: 'severity', width: 9 },
    { header: 'Signal Type', key: 'signal_type', width: 26 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Summary / Source Text', key: 'summary', width: 50 },
    { header: 'Why It Matters', key: 'why', width: 45 },
    { header: 'Owner', key: 'owner', width: 26 },
    { header: 'Suggested Action', key: 'action', width: 40 },
    { header: 'Deadline', key: 'deadline', width: 18 },
    { header: 'Confidence', key: 'confidence', width: 10 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Confirmed By', key: 'confirmedBy', width: 18 },
    { header: 'Manually Reassigned', key: 'manual', width: 10 },
    { header: 'Weight Profile', key: 'profile', width: 12 },
  ];
  styleHeaderRow(actionSheet.getRow(1));

  signals.forEach((s, i) => {
    const row = actionSheet.addRow({
      idx: i + 1,
      tier: s.tier.toUpperCase(),
      severity: s.severity_score,
      signal_type: s.signal_type,
      category: s.category,
      summary: s.sourceText,
      why: s.why_it_matters,
      owner: s.owner_role,
      action: s.suggested_action,
      deadline: fmtDate(s.deadline),
      confidence: s.confidence,
      status: s.status,
      confirmedBy: s.reviewedBy || '',
      manual: s.manuallyEdited ? 'Yes' : '',
      profile: `v${s.weight_profile_version}`,
    });
    const tierCell = row.getCell('tier');
    tierCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TIER_FILL[s.tier] || 'FFFFFFFF' } };
    tierCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    row.getCell('summary').alignment = { wrapText: true, vertical: 'top' };
    row.getCell('why').alignment = { wrapText: true, vertical: 'top' };
    row.getCell('action').alignment = { wrapText: true, vertical: 'top' };
  });
  actionSheet.autoFilter = { from: 'A1', to: 'O1' };

  // --- Sheet 2: Cycle Info & Sign-off ---
  const infoSheet = wb.addWorksheet('Cycle Info & Sign-off');
  infoSheet.columns = [{ width: 28 }, { width: 70 }];
  infoSheet.addRow(['Cycle', cycle.weekLabel]);
  infoSheet.addRow(['Week', `${fmtDate(cycle.weekStart)} – ${fmtDate(cycle.weekEnd)}`]);
  infoSheet.addRow(['Cycle state', cycle.state]);
  infoSheet.addRow(['Generated at', fmtDate(new Date().toISOString())]);
  infoSheet.addRow([]);
  infoSheet.addRow(['Active priorities this cycle']).font = { bold: true };
  (contextPriorities.length ? contextPriorities : [{ text: '(none set)' }]).forEach((p) => infoSheet.addRow(['', p.text]));
  infoSheet.addRow([]);
  infoSheet.addRow(['Weight profile version(s) in force']).font = { bold: true };
  weightProfiles.forEach((p) => {
    infoSheet.addRow([`v${p.version} — ${p.name}`, JSON.stringify(p.categoryWeights)]);
  });
  infoSheet.addRow([]);
  infoSheet.addRow(['Sign-off record']).font = { bold: true };
  infoSheet.addRow(['Approver', 'Approved At']);
  (approvals.length ? approvals : []).forEach((a) => infoSheet.addRow([a.approver, fmtDate(a.approvedAt)]));

  // --- Sheet 3: Run Log (for next meeting) ---
  const logSheet = wb.addWorksheet('Run Log');
  logSheet.columns = [
    { header: 'Run #', key: 'n', width: 6 },
    { header: 'Run At', key: 'runAt', width: 20 },
    { header: 'Triggered By', key: 'by', width: 20 },
    { header: 'Weight Profile', key: 'wp', width: 12 },
    { header: 'Items Processed', key: 'items', width: 14 },
    { header: 'Signals Created', key: 'sig', width: 14 },
    { header: 'Non-Signals', key: 'ns', width: 12 },
    { header: 'High', key: 'high', width: 8 },
    { header: 'Medium', key: 'med', width: 8 },
    { header: 'Low', key: 'low', width: 8 },
    { header: 'Needs Careful Review', key: 'nr', width: 16 },
  ];
  styleHeaderRow(logSheet.getRow(1));
  runLogs.forEach((r, i) => {
    logSheet.addRow({
      n: i + 1,
      runAt: fmtDate(r.runAt),
      by: `${r.triggeredBy.actor} (${r.triggeredBy.role})`,
      wp: `v${r.weightProfileVersion}`,
      items: r.itemsProcessed,
      sig: r.signalsCreated,
      ns: r.nonSignals,
      high: r.tierCounts.high,
      med: r.tierCounts.medium,
      low: r.tierCounts.low,
      nr: r.needsReviewCount,
    });
  });

  // --- Sheet 4: Non-Signals (Logged, for transparency/archive) ---
  const nsSheet = wb.addWorksheet('Non-Signals (Logged)');
  nsSheet.columns = [
    { header: 'Source Type', key: 'src', width: 16 },
    { header: 'Text', key: 'text', width: 70 },
    { header: 'Reason', key: 'reason', width: 50 },
    { header: 'Logged At', key: 'at', width: 20 },
  ];
  styleHeaderRow(nsSheet.getRow(1));
  nonSignalItems.forEach((it) => {
    const row = nsSheet.addRow({ src: it.sourceType, text: it.rawText, reason: it.nonSignalReason || '', at: fmtDate(it.createdAt) });
    row.getCell('text').alignment = { wrapText: true, vertical: 'top' };
  });

  return wb;
}

export function buildRunLogWorkbook(cycle, runLogs) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Run Log');
  sheet.columns = [
    { header: 'Run #', key: 'n', width: 6 },
    { header: 'Run At', key: 'runAt', width: 20 },
    { header: 'Triggered By', key: 'by', width: 20 },
    { header: 'Weight Profile', key: 'wp', width: 12 },
    { header: 'Items Processed', key: 'items', width: 14 },
    { header: 'Signals Created', key: 'sig', width: 14 },
    { header: 'Non-Signals', key: 'ns', width: 12 },
    { header: 'High', key: 'high', width: 8 },
    { header: 'Medium', key: 'med', width: 8 },
    { header: 'Low', key: 'low', width: 8 },
    { header: 'Needs Careful Review', key: 'nr', width: 16 },
  ];
  styleHeaderRow(sheet.getRow(1));
  runLogs.forEach((r, i) => {
    sheet.addRow({
      n: i + 1,
      runAt: fmtDate(r.runAt),
      by: `${r.triggeredBy.actor} (${r.triggeredBy.role})`,
      wp: `v${r.weightProfileVersion}`,
      items: r.itemsProcessed,
      sig: r.signalsCreated,
      ns: r.nonSignals,
      high: r.tierCounts.high,
      med: r.tierCounts.medium,
      low: r.tierCounts.low,
      nr: r.needsReviewCount,
    });
  });
  return wb;
}
