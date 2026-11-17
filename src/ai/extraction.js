// Bounded AI extraction. The model ONLY extracts values and the exact quote/page they come from.
// It never decides eligibility, scores, matches or acceptances: those are rules + humans.
// Every quote returned by the model is verified against the source text (anti-hallucination guard).

export const DTP_SCHEMA_HINT = {
  business_name: 'field', registration_number: 'field', district: 'field',
  employees: 'field(number)', annual_sales: 'field(number, BZD)', capital_investment: 'field(number, BZD)',
  manufacturing_space_m2: 'field(number|null)', amount_requested: 'field(number, BZD)',
  budget_total_declared: 'field(number, BZD)', responsible_person: 'field',
  problem_statement: 'field', solution_summary: 'field',
  timeline_start: 'field(YYYY-MM-DD)', timeline_end: 'field(YYYY-MM-DD)',
  objectives: '[{ text, metric, target, date(YYYY-MM-DD|null), quote, page }]',
  budget_lines: '[{ category, description, amount(number), quote, page }]',
  services_required: '[category]',
  suggested_scores: '{ C1: { points, rationale, quote, page }, C2: { points, rationale, quote, page } }',
};

export const REPORT_SCHEMA_HINT = {
  report_date: 'field(YYYY-MM-DD)',
  payment_payer: 'field', payment_payee: 'field', payment_amount: 'field(number, BZD)',
  payment_date: 'field(YYYY-MM-DD)', payment_reference: 'field',
  invoice_issuer: 'field', invoice_number: 'field', invoice_date: 'field(YYYY-MM-DD)', invoice_amount: 'field(number, BZD)',
  contract_provider: 'field', contract_value: 'field(number, BZD)', contract_signed: 'field(YYYY-MM-DD)',
  milestones: '[{ objective_id, status(completed|in_progress|not_started), evidence, quote, page }]',
};

export function docsToText(documents) {
  return documents.map((d) => `=== DOCUMENT: ${d.type} | ${d.name} ===\n${d.text}`).join('\n\n');
}

export function buildExtractionRequest(kind, documents, rulebook, extra = {}) {
  const schema = kind === 'dtp' ? DTP_SCHEMA_HINT : REPORT_SCHEMA_HINT;
  const categories = rulebook.dtp_review.service_categories.join(', ');
  const criteria = rulebook.screening.criteria.filter((c) => c.method !== 'deterministic')
    .map((c) => `${c.id} "${c.name}" (0-${c.max})`).join('; ');
  const system = [
    'You are a document extraction component inside a public grant program workflow (BELTRAIDE DIBED, Belize).',
    'Your ONLY job is to extract values from the documents provided. You do not decide eligibility, scores, matches or approvals.',
    'Rules:',
    '1. Return ONLY valid JSON, no prose, no markdown fences.',
    '2. A "field" is an object: {"value": ..., "quote": "<exact text copied from the document>", "page": <page number from the [Page N] marker>, "confidence": <0..1>}.',
    '3. "quote" must be copied verbatim from the document (max 25 words). If a value is not in the documents, return {"value": null, "quote": null, "page": null, "confidence": 0}. Never guess.',
    `4. Budget and service categories must be one of: ${categories}. Use "uncategorized" if none fits.`,
    kind === 'dtp' ? `5. suggested_scores: suggest points ONLY for ${criteria}, each with a one-sentence rationale and a supporting quote. These are suggestions for a human panel, not decisions.` : '5. milestones: objective_id refers to the DTP objective ids (O1, O2, ...).',
    '6. Amounts are numbers in BZD without separators.',
  ].join('\n');
  const user = [
    `Extract this JSON structure:\n${JSON.stringify(schema, null, 2)}`,
    extra.context ? `Context:\n${extra.context}` : '',
    `Documents:\n${docsToText(documents)}`,
  ].filter(Boolean).join('\n\n');
  return {
    model: (extra.model || rulebook.ai.model),
    max_tokens: rulebook.ai.max_tokens,
    temperature: rulebook.ai.temperature,
    system,
    messages: [{ role: 'user', content: user }],
  };
}

export function parseModelJson(apiResponse) {
  const text = (apiResponse && apiResponse.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const cleaned = text.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Model did not return JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function normalizeSpace(s) {
  return String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

export function verifyCitations(extraction, documents, minConfidence = 0.8) {
  // Walks every {value, quote} pair and checks the quote exists in the source documents.
  const corpus = normalizeSpace(documents.map((d) => d.text).join('\n'));
  const issues = [];
  let checked = 0;
  let verified = 0;
  const visit = (node, path) => {
    if (Array.isArray(node)) { node.forEach((n, i) => visit(n, `${path}[${i}]`)); return; }
    if (!node || typeof node !== 'object') return;
    if ('quote' in node && node.quote) {
      checked += 1;
      const q = normalizeSpace(node.quote).replace(/\.\.\.|…/g, '');
      const ok = q.length > 0 && corpus.includes(q.slice(0, Math.min(q.length, 120)));
      if (ok) verified += 1;
      else {
        node.confidence = Math.min(Number(node.confidence ?? 1), 0.3);
        node.citation_verified = false;
        issues.push({ path, quote: node.quote, problem: 'CITATION_NOT_FOUND' });
      }
      if (ok) node.citation_verified = true;
    }
    if ('confidence' in node && 'value' in node && node.value !== null && Number(node.confidence) < minConfidence &&
        !issues.find((i) => i.path === path)) {
      issues.push({ path, value: node.value, problem: 'LOW_CONFIDENCE', confidence: node.confidence });
    }
    for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') visit(v, path ? `${path}.${k}` : k);
  };
  visit(extraction, '');
  return { checked, verified, issues };
}

export function val(field) {
  // Reads the value of a {value, quote, ...} field, tolerating plain values.
  if (field && typeof field === 'object' && 'value' in field) return field.value;
  return field ?? null;
}

export function estimateCostUsd(usage, rulebook) {
  if (!usage) return 0;
  const p = rulebook.ai.cost_assumptions_usd_per_million_tokens;
  return ((usage.input_tokens || 0) * p.input + (usage.output_tokens || 0) * p.output) / 1e6;
}
