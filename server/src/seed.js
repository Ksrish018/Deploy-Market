import { id } from './ids.js';

// Monday-Friday label for the week containing `d`.
export function isoWeekInfo(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayIdx = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - dayIdx);
  const monday = new Date(date);
  const friday = new Date(date);
  friday.setUTCDate(monday.getUTCDate() + 4);
  const fmt = (x) => x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return {
    label: `Week of ${fmt(monday)}–${fmt(friday)}, ${monday.getUTCFullYear()}`,
    monday,
    friday,
  };
}

export function defaultOwnerMap() {
  return [
    { signalType: 'competitor_pricing_move', label: 'Competitor pricing / financial move', ownerRole: 'Pricing/Finance lead', suggestedAction: 'Review exposed open deals and prep a counter', responseWindow: 'same_day' },
    { signalType: 'funding_or_ma', label: 'Funding / M&A', ownerRole: 'Leadership/Strategy (CEO)', suggestedAction: 'Reassess roadmap & hiring urgency', responseWindow: 'same_day' },
    { signalType: 'new_product_launch', label: 'New product / feature', ownerRole: 'Product lead', suggestedAction: 'Decide respond vs watch; log to roadmap', responseWindow: 'this_week' },
    { signalType: 'customer_reported_competitor_move', label: 'Customer-reported competitor move', ownerRole: 'Sales lead', suggestedAction: 'Verify, protect the account', responseWindow: 'same_day' },
    { signalType: 'positioning_campaign', label: 'Positioning / campaign / messaging', ownerRole: 'Marketing/Brand lead', suggestedAction: 'Assess narrative impact', responseWindow: 'this_week' },
    { signalType: 'partnership_channel_move', label: 'Partnership / channel move', ownerRole: 'Partnerships/BD lead', suggestedAction: 'Evaluate our channel exposure', responseWindow: 'this_week' },
    { signalType: 'strategic_competitor_hiring', label: 'Strategic competitor hiring', ownerRole: 'Talent + Product (dual-flag)', suggestedAction: 'Note capability shift; assess competitive response', responseWindow: 'background' },
    { signalType: 'routine_hiring', label: 'Routine hiring (not strategic)', ownerRole: 'Talent lead', suggestedAction: 'Log for context; no action needed', responseWindow: 'background' },
    { signalType: 'industry_regulatory_change', label: 'Industry / regulatory change', ownerRole: 'Leadership/Strategy (CEO)', suggestedAction: 'Assess regulatory or compliance exposure', responseWindow: 'this_week' },
  ];
}

export function defaultState() {
  const now = new Date();
  const { label, monday, friday } = isoWeekInfo(now);
  const cutoff = new Date(monday);
  cutoff.setUTCDate(monday.getUTCDate() + 2); // Wednesday
  cutoff.setUTCHours(17, 0, 0, 0);

  const profileId = id('wp');
  const cycleId = id('cyc');

  return {
    cycles: [
      {
        id: cycleId,
        weekLabel: label,
        weekStart: monday.toISOString(),
        weekEnd: friday.toISOString(),
        state: 'collecting', // not_started | collecting | compiled | triaged | approved | archived
        cutoffAt: cutoff.toISOString(),
        minItems: 10,
        createdBy: 'system',
        createdAt: now.toISOString(),
        compiledAt: null,
      },
    ],
    items: [],
    signals: [],
    contextPriorities: [],
    weightProfiles: [
      {
        id: profileId,
        version: 1,
        name: 'Default',
        categoryWeights: {
          pricing_financial: 5,
          funding_ma: 5,
          product_feature: 4,
          sales_customer: 4,
          partnership_positioning: 3,
          hiring_hr: 2,
          industry_regulatory: 2,
        },
        multiplier: 1.5,
        thresholds: { high: 6, medium: 3 },
        active: true,
        createdBy: 'system',
        createdAt: now.toISOString(),
        notes: 'Default v1 profile from the PRD.',
      },
    ],
    ownerMap: defaultOwnerMap(),
    tasks: [],
    approvals: [],
    briefs: [],
    runLogs: [],
    auditLog: [],
  };
}
