// Deterministic fallback extractor. Used when the AI provider is unavailable (no API key, outage,
// budget cap reached). It reads the structured DTP / report templates line by line, so the workflow
// keeps running (degraded, flagged) instead of stopping — this is the "manual fallback" principle.

function pagesOf(documents) {
  // Splits every document into { page, line } records using the [Page N] markers.
  const out = [];
  for (const d of documents) {
    let page = 1;
    for (const raw of String(d.text).split('\n')) {
      const m = raw.match(/^\[Page (\d+)\]/i);
      if (m) { page = Number(m[1]); continue; }
      const line = raw.trim();
      if (line) out.push({ doc: d.type, page, line });
    }
  }
  return out;
}

function field(lines, label, transform = (x) => x) {
  const re = new RegExp(`^${label}\\s*:\\s*(.+)$`, 'i');
  for (const l of lines) {
    const m = l.line.match(re);
    if (m) return { value: transform(m[1].trim()), quote: l.line, page: l.page, confidence: 0.9, method: 'fallback' };
  }
  return { value: null, quote: null, page: null, confidence: 0, method: 'fallback' };
}

const money = (s) => {
  const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const num = money;
const date = (s) => {
  const m = String(s).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
};

function section(lines, startLabel, endLabels) {
  const start = lines.findIndex((l) => new RegExp(startLabel, 'i').test(l.line));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => endLabels.some((e) => new RegExp(e, 'i').test(l.line)));
  return end < 0 ? rest : rest.slice(0, end);
}

export function fallbackExtractDtp(documents) {
  const dtpDocs = documents.filter((d) => d.type === 'dtp');
  const lines = pagesOf(dtpDocs);
  const problem = section(lines, '^1\\. Problem statement', ['^2\\. ']);
  const solution = section(lines, '^2\\. Proposed solution', ['^3\\. ']);
  const objectives = lines.filter((l) => /^O\d+\s*:/.test(l.line)).map((l) => {
    const parts = l.line.split('|').map((p) => p.trim());
    const [idText, ...rest] = parts;
    const get = (k) => { const p = rest.find((x) => x.toLowerCase().startsWith(k)); return p ? p.split(':').slice(1).join(':').trim() : null; };
    return {
      id: idText.split(':')[0].trim(),
      text: idText.split(':').slice(1).join(':').trim(),
      metric: get('metric'), target: get('target'), date: date(get('date') || ''),
      quote: l.line, page: l.page,
    };
  });
  const budgetLines = lines.filter((l) => /^B\d+\s*\|/.test(l.line)).map((l) => {
    const [, category, description, amount] = l.line.split('|').map((p) => p.trim());
    return { category: (category || 'uncategorized').toLowerCase(), description, amount: money(amount), quote: l.line, page: l.page };
  });
  const services = [...new Set(budgetLines.map((b) => b.category).filter((c) => c && c !== 'uncategorized'))];
  const wordCount = (arr) => arr.map((l) => l.line).join(' ').split(/\s+/).filter(Boolean).length;
  const hasNumbers = (arr) => /\d/.test(arr.map((l) => l.line).join(' '));
  // Heuristic suggestions (clearly labelled) for the AI-suggested criteria.
  const c1 = Math.min(15, Math.round((Math.min(wordCount(problem), 60) / 60) * 10) + (hasNumbers(problem) ? 5 : 0));
  const c2 = Math.min(20, Math.round((Math.min(wordCount(solution), 60) / 60) * 12) + Math.min(services.length, 4) * 2);
  return {
    business_name: field(lines, 'Business name'),
    registration_number: field(lines, 'Registration number'),
    district: field(lines, 'District'),
    employees: field(lines, 'Full-time employees', num),
    annual_sales: field(lines, 'Annual sales(?: \\(\\d{4}\\))?', money),
    capital_investment: field(lines, 'Capital investment', money),
    manufacturing_space_m2: field(lines, 'Manufacturing space', num),
    amount_requested: field(lines, 'Amount requested', money),
    budget_total_declared: field(lines, 'Declared total', money),
    responsible_person: field(lines, 'Responsible person'),
    problem_statement: { value: problem.map((l) => l.line).join(' ') || null, quote: problem[0] ? problem[0].line : null, page: problem[0] ? problem[0].page : null, confidence: problem.length ? 0.9 : 0 },
    solution_summary: { value: solution.map((l) => l.line).join(' ') || null, quote: solution[0] ? solution[0].line : null, page: solution[0] ? solution[0].page : null, confidence: solution.length ? 0.9 : 0 },
    timeline_start: field(lines, 'Start', date),
    timeline_end: field(lines, 'End', date),
    objectives,
    budget_lines: budgetLines,
    services_required: services,
    suggested_scores: {
      C1: { points: c1, rationale: 'HEURISTIC (no AI): length and specificity of the problem statement', quote: problem[0] ? problem[0].line : null, page: problem[0] ? problem[0].page : null },
      C2: { points: c2, rationale: 'HEURISTIC (no AI): solution description and number of service categories budgeted', quote: solution[0] ? solution[0].line : null, page: solution[0] ? solution[0].page : null },
    },
    _extractor: 'deterministic_fallback',
  };
}

export function fallbackExtractReport(documents) {
  const lines = pagesOf(documents);
  const milestones = lines.filter((l) => /^Milestone\s+O\d+/i.test(l.line)).map((l) => {
    const id = l.line.match(/O\d+/)[0];
    const status = (l.line.match(/Status:\s*([a-z_ ]+)/i) || [])[1];
    const evidence = (l.line.match(/Evidence:\s*(.+)$/i) || [])[1] || null;
    return { objective_id: id, status: status ? status.trim().toLowerCase().replace(/\s+/g, '_') : null,
      evidence: evidence && !/^none/i.test(evidence) ? evidence.trim() : null, quote: l.line, page: l.page };
  });
  return {
    report_date: field(lines, 'Report date', date),
    payment_payer: field(lines, 'Payer'),
    payment_payee: field(lines, 'Payee'),
    payment_amount: field(lines, 'Amount transferred', money),
    payment_date: field(lines, 'Transfer date', date),
    payment_reference: field(lines, 'Reference'),
    invoice_issuer: field(lines, 'Issued by'),
    invoice_number: field(lines, 'Invoice number'),
    invoice_date: field(lines, 'Invoice date', date),
    invoice_amount: field(lines, 'Amount due', money),
    contract_provider: field(lines, 'Provider'),
    contract_value: field(lines, 'Contract value', money),
    contract_signed: field(lines, 'Signed on', date),
    milestones,
    _extractor: 'deterministic_fallback',
  };
}
