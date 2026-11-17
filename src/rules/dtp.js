// STEP 3 — Advisor review & DTP versions.
// Structured review checks: each check is resolved by a RULE, suggested by the AI (with citation),
// or left to the ADVISOR's judgment. Versions are hashed; the approved version is locked.
// Depends on: val (extraction.js), sha256 (util.js)

export function advisorChecks({ extraction, rulebook, approvedAmount }) {
  const R = rulebook.dtp_review;
  const out = [];
  const add = (id, section, question, method, result, evidence) => out.push({ id, section, question, method, result, evidence });

  const objectives = extraction.objectives || [];
  objectives.forEach((o, i) => {
    const ok = !!(o.metric && o.target && o.date);
    add(`R3.01.${i + 1}`, 'Objectives', `Objective ${o.id || i + 1} has metric + target + date`, 'rule', ok ? 'pass' : 'fail',
      { text: o.text, metric: o.metric, target: o.target, date: o.date, quote: o.quote, page: o.page });
  });
  if (!objectives.length) add('R3.01', 'Objectives', 'At least one objective is defined', 'rule', 'fail', null);

  const lines = extraction.budget_lines || [];
  const bad = lines.filter((l) => !R.service_categories.includes(l.category));
  add('R3.02', 'Budget', 'Every budget line maps to a service category in the catalog', 'rule', bad.length ? 'fail' : 'pass',
    bad.map((l) => ({ description: l.description, category: l.category, quote: l.quote })));

  const total = lines.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  add('R3.03', 'Budget', 'Budget total ≤ approved grant amount', 'rule', approvedAmount !== null && total <= approvedAmount ? 'pass' : 'fail',
    { budget_total: total, approved_amount: approvedAmount });

  const end = val(extraction.timeline_end);
  add('R3.04', 'Timeline', `Implementation ends by ${R.implementation_must_end_by} (program window)`, 'rule',
    end && end <= R.implementation_must_end_by ? 'pass' : 'fail', { timeline_end: end });

  const services = new Set(extraction.services_required || []);
  const solution = String(val(extraction.solution_summary) || '').toLowerCase();
  const mentioned = R.service_categories.filter((c) => solution.includes(c.replace('_', ' ')) || solution.includes(c));
  const unbudgeted = mentioned.filter((c) => !services.has(c));
  add('R3.05', 'Budget vs scope', 'Services described in the solution are budgeted', 'ai_suggestion',
    unbudgeted.length ? 'needs_advisor' : 'pass', { described_not_budgeted: unbudgeted, note: 'Suggestion only — advisor confirms' });

  add('R3.06', 'Viability', 'The business has the people and connectivity to operate the solution', 'advisor', 'needs_advisor',
    { responsible_person: val(extraction.responsible_person) });

  return out;
}

export function dtpVersionRecord({ caseId, version, documents, extraction, author, note }) {
  const text = documents.filter((d) => d.type === 'dtp').map((d) => d.text).join('\n');
  return {
    case_id: caseId, version, author, note: note || null,
    hash: sha256(text), created_at: new Date().toISOString(),
    status: 'submitted',
    summary: {
      objectives: (extraction.objectives || []).length,
      budget_total: (extraction.budget_lines || []).reduce((a, b) => a + (Number(b.amount) || 0), 0),
      services: extraction.services_required || [],
    },
  };
}

export function diffVersions(prevExtraction, nextExtraction, rulebook) {
  const changes = [];
  const sum = (e) => (e.budget_lines || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const a = sum(prevExtraction);
  const b = sum(nextExtraction);
  if (a !== b) {
    const ratio = a ? Math.abs(b - a) / a : 1;
    changes.push({ section: 'Budget', from: a, to: b, change_ratio: Math.round(ratio * 100) / 100,
      alert: ratio > rulebook.dtp_review.budget_change_alert_ratio ? 'BUDGET_CHANGE_ABOVE_THRESHOLD' : null });
  }
  const objKey = (o) => `${o.id}|${o.metric}|${o.target}|${o.date}`;
  const prevO = new Set((prevExtraction.objectives || []).map(objKey));
  const nextO = (nextExtraction.objectives || []).filter((o) => !prevO.has(objKey(o)));
  if (nextO.length) changes.push({ section: 'Objectives', changed: nextO.map((o) => `${o.id}: ${o.text}`) });
  const sv = (e) => (e.services_required || []).slice().sort().join(',');
  if (sv(prevExtraction) !== sv(nextExtraction)) changes.push({ section: 'Services', from: prevExtraction.services_required, to: nextExtraction.services_required });
  return changes;
}

export function lockApprovedVersion(record, advisor) {
  return { ...record, status: 'approved', approved_by: advisor, approved_at: new Date().toISOString(), locked: true,
    lock_note: 'Immutable reference for matchmaking (step 4) and report reviews (steps 8 and 11). Any change requires a new approval.' };
}
