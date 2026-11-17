// STEP 2 — Screening & evaluation. Deterministic rules over the AI-extracted (and citation-verified) data.
// Output is a PRELIMINARY result for the panel. It never rejects and never sets a final score.
// Depends on: classifyTier (intake.js), val (extraction.js)

export function runScreening({ eoi, documents, extraction, citationCheck, rulebook }) {
  const S = rulebook.screening;
  const checks = [];
  const flags = [];
  const flag = (code, severity, message, evidence = null) => flags.push({ code, severity, message, evidence, status: 'open' });
  const check = (id, rule, result, detail = null) => checks.push({ id, rule, result, detail });

  // R2.01 completeness of mandatory documents
  const present = new Set(documents.map((d) => d.type));
  const missingDocs = S.mandatory_documents.filter((t) => !present.has(t));
  check('R2.01', 'All mandatory documents present', missingDocs.length ? 'fail' : 'pass', missingDocs);
  if (missingDocs.length) flag('MISSING_DOC', 'blocking', `Missing mandatory document(s): ${missingDocs.join(', ')} — request from MSME, do not reject`);

  // R2.02 registration
  const reg = val(extraction.registration_number);
  const registered = String(eoi.registered).toLowerCase() === 'yes' && !!reg;
  check('R2.02', 'Registered business (EOI = Yes and registration number found)', registered ? 'pass' : 'fail', reg);
  if (!registered) flag('REGISTRATION_UNVERIFIED', 'blocking', 'No registration number found in the documents');

  // R2.03 tier from extracted figures vs. self-declared EOI category
  const tier = classifyTier({
    employees: val(extraction.employees), annual_sales: val(extraction.annual_sales),
    capital_investment: val(extraction.capital_investment), space_m2: val(extraction.manufacturing_space_m2),
  }, rulebook);
  check('R2.03', 'Tier computed from DTP figures (official EOI thresholds)', tier.proposed ? 'pass' : 'needs_review', tier);
  if (tier.exceeds_medium) flag('SIZE_ABOVE_MEDIUM', 'blocking', 'At least one size criterion is above the medium-enterprise threshold', tier.per_criterion);
  if (tier.diverges) flag('TIER_CRITERIA_DIVERGE', 'warning', `Size criteria point to different tiers: ${JSON.stringify(tier.per_criterion)}`);
  if (eoi.categoryCode && eoi.categoryCode !== 'unsure' && tier.proposed && eoi.categoryCode !== tier.proposed) {
    flag('CONFLICT_DECLARED_TIER', 'warning', `EOI declared "${eoi.categoryCode}" but DTP figures indicate "${tier.proposed}"`);
  }
  const tierKey = tier.proposed && rulebook.tiers[tier.proposed] ? tier.proposed : eoi.categoryCode;
  const grantCap = tierKey && rulebook.tiers[tierKey] ? rulebook.tiers[tierKey].grant_cap : null;

  // R2.04 medium tier needs advanced digital maturity
  if (tierKey === 'medium') {
    const tools = (eoi.digitalTools || []).filter((t) => t !== 'None currently').length;
    const ok = tools >= rulebook.tiers.medium.min_digital_tools_for_maturity;
    check('R2.04', 'Medium tier: advanced digital maturity indicator', ok ? 'pass' : 'needs_review', { digital_tools: tools });
    if (!ok) flag('MATURITY_INSUFFICIENT', 'warning', 'Medium tier requires advanced digital maturity');
  }

  // R2.05 amount requested within cap
  const requested = val(extraction.amount_requested);
  const withinCap = requested !== null && grantCap !== null && requested <= grantCap;
  check('R2.05', 'Amount requested ≤ tier grant cap', withinCap ? 'pass' : 'fail', { requested, grantCap, tier: tierKey });
  if (!withinCap) flag('ABOVE_GRANT_CAP', 'blocking', `Requested ${requested} exceeds cap ${grantCap} for tier ${tierKey}`);

  // R2.06 budget arithmetic
  const lines = extraction.budget_lines || [];
  const sum = lines.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const declared = val(extraction.budget_total_declared);
  const sumOk = declared !== null && Math.abs(sum - declared) <= declared * S.budget_sum_tolerance;
  check('R2.06', 'Sum of budget lines = declared total (±1%)', sumOk ? 'pass' : 'fail', { sum, declared });
  if (!sumOk) flag('BUDGET_SUM_MISMATCH', 'warning', `Budget lines add up to ${sum}, declared total is ${declared}`);
  const uncategorized = lines.filter((l) => !rulebook.dtp_review.service_categories.includes(l.category));
  if (uncategorized.length) flag('UNCATEGORIZED_BUDGET_LINE', 'warning', `${uncategorized.length} budget line(s) without a valid service category`);

  // R2.07 identity consistency EOI vs DTP
  const nameDtp = String(val(extraction.business_name) || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameEoi = String(eoi.businessName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const nameOk = nameDtp && nameEoi && (nameDtp.includes(nameEoi) || nameEoi.includes(nameDtp));
  check('R2.07', 'Business name in EOI matches DTP', nameOk ? 'pass' : 'needs_review', { eoi: eoi.businessName, dtp: val(extraction.business_name) });
  if (!nameOk) flag('CONFLICT_BUSINESS_NAME', 'warning', 'Business name differs between EOI and DTP');

  // Citation / confidence guard from the AI layer
  for (const issue of (citationCheck && citationCheck.issues) || []) {
    flag(issue.problem === 'CITATION_NOT_FOUND' ? 'CITATION_NOT_FOUND' : 'LOW_CONFIDENCE', 'warning',
      `${issue.path}: ${issue.problem}`, issue.quote || issue.value);
  }

  // ---- Preliminary score /80 ----
  const crit = Object.fromEntries(S.criteria.map((c) => [c.id, c]));
  const scores = [];
  const ai = extraction.suggested_scores || {};
  for (const id of ['C1', 'C2']) {
    const sug = ai[id] || {};
    const pts = Math.max(0, Math.min(crit[id].max, Number(sug.points) || 0));
    scores.push({ id, name: crit[id].name, max: crit[id].max, points: pts, method: extraction._extractor === 'deterministic_fallback' ? 'heuristic_fallback' : 'ai_suggested',
      needs_human_confirmation: true, rationale: sug.rationale || null, quote: sug.quote || null, page: sug.page || null });
  }
  const objectives = extraction.objectives || [];
  const validObjectives = objectives.filter((o) => o.metric && o.target && o.date);
  scores.push({ id: 'C3', name: crit.C3.name, max: crit.C3.max, method: 'deterministic',
    points: Math.min(crit.C3.max, validObjectives.length * crit.C3.points_per_valid_objective),
    rationale: `${validObjectives.length} of ${objectives.length} objectives have metric + target + date` });
  if (objectives.length - validObjectives.length > 0) flag('OBJECTIVE_NOT_MEASURABLE', 'info', `${objectives.length - validObjectives.length} objective(s) missing metric, target or date`);
  const c4 = (sumOk ? 5 : 0) + (withinCap ? 5 : 0) + (lines.length && !uncategorized.length ? 5 : 0);
  scores.push({ id: 'C4', name: crit.C4.name, max: crit.C4.max, method: 'deterministic', points: c4,
    rationale: `sum matches: ${sumOk}; within cap: ${withinCap}; all lines categorized: ${lines.length > 0 && !uncategorized.length}` });
  const end = val(extraction.timeline_end);
  const inWindow = end && end <= rulebook.dtp_review.implementation_must_end_by;
  const hasOwner = !!val(extraction.responsible_person);
  const tools = (eoi.digitalTools || []).filter((t) => t !== 'None currently').length;
  const c5 = (inWindow ? 4 : 0) + (hasOwner ? 3 : 0) + Math.min(3, tools);
  scores.push({ id: 'C5', name: crit.C5.name, max: crit.C5.max, method: 'deterministic', points: c5,
    rationale: `timeline ends in window: ${!!inWindow}; responsible person: ${hasOwner}; digital tools: ${tools}` });
  const c6 = crit.C6.points_by_export_experience[eoi.exportExperience] || 0;
  scores.push({ id: 'C6', name: crit.C6.name, max: crit.C6.max, method: 'deterministic', points: c6, rationale: `EOI: ${eoi.exportExperience}` });

  const total = scores.reduce((a, s) => a + s.points, 0);
  const borderline = Math.abs(total - S.pass_threshold) <= S.borderline_band;
  if (borderline) flag('BORDERLINE', 'warning', `Preliminary score ${total} is within ±${S.borderline_band} of the ${S.pass_threshold} threshold — mandatory panel review`);

  const blocking = flags.filter((f) => f.severity === 'blocking');
  let recommendation;
  if (blocking.some((f) => f.code === 'MISSING_DOC' || f.code === 'REGISTRATION_UNVERIFIED')) recommendation = 'REQUEST_INFORMATION_FROM_MSME';
  else if (borderline) recommendation = 'BORDERLINE_PANEL_MUST_DECIDE';
  else if (total >= S.pass_threshold && !blocking.length) recommendation = 'RECOMMEND_FOR_PANEL_APPROVAL';
  else recommendation = 'BELOW_THRESHOLD_PANEL_TO_CONFIRM';

  return {
    tier: { ...tier, used: tierKey, grant_cap: grantCap },
    checks, flags,
    score: { total, max: S.max_points, threshold: S.pass_threshold, borderline, breakdown: scores },
    recommendation,
    disclaimer: 'Preliminary result prepared by rules + AI extraction. The evaluation panel decides eligibility and the final score.',
  };
}
