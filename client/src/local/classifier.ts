// Ported verbatim (logic-wise) from server/src/classifier.js — the
// deterministic rule engine, now running client-side for the offline build.
import type { ContextPriority, WeightProfile, Tier } from '../types';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  pricing_financial: [
    'price cut', 'pricing', 'discount', 'free tier', 'undercut', 'cost reduction',
    'price increase', 'bundle pricing', 'subscription price', 'lower price',
    'slashed price', 'margin pressure', 'price war',
  ],
  funding_ma: [
    'raised $', 'raised a', 'funding round', 'series a', 'series b', 'series c',
    'series d', 'acquired', 'acquisition', 'merger', 'ipo', 'valuation',
    'venture capital', 'investment round', 'closed a round',
  ],
  product_feature: [
    'launch', 'launches', 'launched', 'new feature', 'beta', 'release',
    'rolled out', 'integration', 'platform update', 'ships', 'unveils',
    'announces', 'product update', 'new capability',
  ],
  sales_customer: [
    'customer said', 'client mentioned', 'lost the deal', 'lost a deal',
    'switched to', 'churned to', 'prospect said', 'account at risk',
    'competitor offered', 'customer reports', 'told us they',
  ],
  partnership_positioning: [
    'partnership', 'partners with', 'alliance', 'channel partner',
    'reseller agreement', 'campaign', 'rebrand', 'positioning',
    'messaging shift', 'ad campaign', 'sponsorship', 'co-marketing',
  ],
  hiring_hr: [
    'hires', 'hired', 'hiring', 'job posting', 'joins as', 'new vp',
    'new chief', 'new head of', 'job listing', 'recruiting for', 'open roles',
  ],
  industry_regulatory: [
    'regulation', 'regulatory', 'compliance', 'lawsuit', 'antitrust', 'gdpr',
    'ftc probe', 'legislation', 'court ruling', 'sanction', 'policy change',
    'investigation into',
  ],
};

const STRATEGIC_HIRE_KEYWORDS = [
  'security', 'ai ', 'artificial intelligence', 'machine learning', ' ml ',
  'infrastructure', 'enterprise', 'platform engineering', 'engineering leadership',
  'encryption', 'compliance engineering',
];
const SENIOR_TITLE_KEYWORDS = ['chief', 'vp ', 'vice president', 'head of', 'director of'];
const MULTI_HIRE_PATTERN = /\b([3-9]|1\d|[2-9]\d)\b[^.]{0,25}(hires?|engineers?|roles?|employees?|positions?)/i;
const MULTI_HIRE_WORDS = ['several', 'multiple', 'a wave of', 'a string of', 'a team of'];

const PARTNERSHIP_CHANNEL_WORDS = ['partner', 'channel', 'reseller', 'alliance', 'integration', 'distributor'];

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'over', 'our',
  'their', 'a', 'an', 'of', 'to', 'in', 'on', 'is', 'are', 'be', 'will',
  'it', 'its', 'we', 'they', 'them', 'than', 'more',
]);

const WHY_TEMPLATES: Record<string, string> = {
  competitor_pricing_move: 'A competitor pricing move could shift open deals and margins we are actively defending.',
  funding_or_ma: 'New funding or M&A activity changes a competitor’s resourcing and timeline we plan against.',
  new_product_launch: 'A competitor product move could change how we position or prioritize our own roadmap.',
  customer_reported_competitor_move: 'A customer already noticed this, so it directly threatens an account we could lose by acting late.',
  positioning_campaign: 'A shift in a competitor’s narrative could change how prospects perceive us in active deals.',
  partnership_channel_move: 'A new partnership or channel move could change our distribution exposure.',
  strategic_competitor_hiring: 'This hiring pattern signals a capability build-out that changes our competitive roadmap risk.',
  routine_hiring: 'Routine hiring with no clear strategic pattern; logged for context only, not a decision trigger.',
  industry_regulatory_change: 'A regulatory or industry shift could change our compliance posture or go-to-market approach.',
};

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

export function matchesAnyPriority(textLower: string, priorities: ContextPriority[]): boolean {
  const words = new Set(significantWords(textLower));
  for (const p of priorities) {
    const pwords = significantWords(p.text || '');
    if (pwords.some((w) => words.has(w))) return true;
  }
  return false;
}

function countHits(textLower: string, keywords: string[]): number {
  let hits = 0;
  for (const kw of keywords) if (textLower.includes(kw)) hits++;
  return hits;
}

function pickCategory(textLower: string) {
  const scores = Object.entries(CATEGORY_KEYWORDS)
    .map(([cat, kws]) => [cat, countHits(textLower, kws)] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  const [topCat, topHits] = scores[0];
  const runnerUpHits = scores[1] ? scores[1][1] : 0;
  return { category: topHits > 0 ? topCat : null, hits: topHits, runnerUpHits };
}

function isStrategicHire(textLower: string): boolean {
  const strategicHit = STRATEGIC_HIRE_KEYWORDS.some((k) => textLower.includes(k));
  const seniorHit = SENIOR_TITLE_KEYWORDS.some((k) => textLower.includes(k));
  const countHit = MULTI_HIRE_PATTERN.test(textLower) || MULTI_HIRE_WORDS.some((k) => textLower.includes(k));
  return strategicHit && (seniorHit || countHit);
}

function subclassifyPartnership(textLower: string): string {
  return PARTNERSHIP_CHANNEL_WORDS.some((w) => textLower.includes(w))
    ? 'partnership_channel_move'
    : 'positioning_campaign';
}

const DIRECT_SIGNAL_TYPES: Record<string, string> = {
  pricing_financial: 'competitor_pricing_move',
  funding_ma: 'funding_or_ma',
  product_feature: 'new_product_launch',
  sales_customer: 'customer_reported_competitor_move',
  industry_regulatory: 'industry_regulatory_change',
};

export interface ClassificationResult {
  decision_relevant: boolean;
  category: string | null;
  reclassified_from: string | null;
  base_weight: number;
  priority_match: boolean;
  priority_multiplier: number;
  severity_score: number;
  tier: Tier;
  signal_type: string | null;
  why_it_matters: string;
  confidence: number;
  needs_review: boolean;
}

export function classifyItem(
  text: string,
  { weightProfile, contextPriorities = [], confidenceThreshold = 0.5 }: { weightProfile: WeightProfile; contextPriorities?: ContextPriority[]; confidenceThreshold?: number },
): ClassificationResult {
  const textLower = (text || '').toLowerCase();
  const { category: rawCategory, hits, runnerUpHits } = pickCategory(textLower);

  if (!rawCategory) {
    return {
      decision_relevant: false,
      category: null,
      reclassified_from: null,
      base_weight: 0,
      priority_match: false,
      priority_multiplier: 1,
      severity_score: 0,
      tier: 'low',
      signal_type: null,
      why_it_matters: 'No decision-linked category matched; treated as market trivia, not a signal.',
      confidence: 0.6,
      needs_review: false,
    };
  }

  let category = rawCategory;
  let reclassifiedFrom: string | null = null;
  let signalType: string;

  if (category === 'hiring_hr' && isStrategicHire(textLower)) {
    reclassifiedFrom = 'hiring_hr';
    category = 'product_feature';
    signalType = 'strategic_competitor_hiring';
  } else if (category === 'hiring_hr') {
    signalType = 'routine_hiring';
  } else if (category === 'partnership_positioning') {
    signalType = subclassifyPartnership(textLower);
  } else {
    signalType = DIRECT_SIGNAL_TYPES[category];
  }

  const baseWeight = weightProfile.categoryWeights[category] ?? 1;
  const priorityMatch = matchesAnyPriority(textLower, contextPriorities.filter((p) => p.active !== false));
  const multiplier = priorityMatch ? weightProfile.multiplier : 1;
  const severityScore = Math.round(baseWeight * multiplier * 10) / 10;
  const tier: Tier =
    severityScore >= weightProfile.thresholds.high ? 'high'
      : severityScore >= weightProfile.thresholds.medium ? 'medium'
        : 'low';

  let confidence = 0.45 + 0.12 * hits - 0.08 * runnerUpHits;
  if (reclassifiedFrom) confidence -= 0.05;
  confidence = Math.max(0.2, Math.min(0.95, Math.round(confidence * 100) / 100));

  return {
    decision_relevant: true,
    category,
    reclassified_from: reclassifiedFrom,
    base_weight: baseWeight,
    priority_match: priorityMatch,
    priority_multiplier: multiplier,
    severity_score: severityScore,
    tier,
    signal_type: signalType,
    why_it_matters: WHY_TEMPLATES[signalType] + (priorityMatch ? ' This matches a stated priority this cycle.' : ''),
    confidence,
    needs_review: confidence < confidenceThreshold,
  };
}

/** Re-scores an already-classified signal's category under a (possibly new) weight profile. */
export function rescoreForProfile(signal: { category: string; base_weight: number; sourceText?: string }, weightProfile: WeightProfile, contextPriorities: ContextPriority[] = []) {
  const priorityMatch = matchesAnyPriority((signal.sourceText || '').toLowerCase(), contextPriorities.filter((p) => p.active !== false));
  const baseWeight = weightProfile.categoryWeights[signal.category] ?? signal.base_weight ?? 1;
  const multiplier = priorityMatch ? weightProfile.multiplier : 1;
  const severityScore = Math.round(baseWeight * multiplier * 10) / 10;
  const tier: Tier =
    severityScore >= weightProfile.thresholds.high ? 'high'
      : severityScore >= weightProfile.thresholds.medium ? 'medium'
        : 'low';
  return { base_weight: baseWeight, priority_match: priorityMatch, priority_multiplier: multiplier, severity_score: severityScore, tier };
}

export function normalizeForDedupe(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
