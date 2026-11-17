// STEPS 8 & 11 — Report validators. Each rule returns pass / fail / needs_review with cited evidence.
// The validator never accepts a report and never triggers a payment: staff decide.
// Depends on: val (extraction.js)

function rule(id, name, result, detail, evidence) { return { id, rule: name, result, detail, evidence: evidence || null }; }
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ev = (f) => (f && f.quote ? { quote: f.quote, page: f.page } : null);

export function validateFirstReport({ x, documents, ctx, registry, rulebook }) {
  // ctx: { approved_dsp_name, tranche_amount, agreement_signed, objectives, report_due }
  const R = rulebook.reports;
  const results = [];
  const required = ['progress_report', 'payment_receipt', 'invoice', 'contract'];
  const present = new Set(documents.map((d) => d.type));
  const missing = required.filter((t) => !present.has(t));
  results.push(rule('R8.01', 'All required report documents uploaded', missing.length ? 'fail' : 'pass', { missing }));

  const payee = val(x.payment_payee);
  results.push(rule('R8.02', 'Payee is the DSP approved in step 4', payee && norm(payee) === norm(ctx.approved_dsp_name) ? 'pass' : 'fail',
    { payee, approved_dsp: ctx.approved_dsp_name }, ev(x.payment_payee)));

  const paid = val(x.payment_amount);
  const share = paid !== null && ctx.tranche_amount ? paid / ctx.tranche_amount : null;
  results.push(rule('R8.03', `Amount paid ≥ ${R.min_share_of_tranche_paid * 100}% of the first tranche and ≤ tranche`,
    share === null ? 'fail' : share >= R.min_share_of_tranche_paid && share <= 1 + R.invoice_payment_tolerance ? 'pass' : 'needs_review',
    { paid, tranche: ctx.tranche_amount, share: share === null ? null : Math.round(share * 100) + '%' }, ev(x.payment_amount)));

  const pdate = val(x.payment_date);
  results.push(rule('R8.04', 'Payment made after the grant agreement was signed', pdate && pdate >= ctx.agreement_signed ? 'pass' : 'fail',
    { payment_date: pdate, agreement_signed: ctx.agreement_signed }, ev(x.payment_date)));

  const inv = val(x.invoice_amount);
  const invOk = inv !== null && paid !== null && Math.abs(inv - paid) <= inv * R.invoice_payment_tolerance;
  results.push(rule('R8.05', 'Invoice amount matches the payment', invOk ? 'pass' : 'fail', { invoice: inv, payment: paid }, ev(x.invoice_amount)));

  const provider = val(x.contract_provider);
  results.push(rule('R8.06', 'Contract is with the approved DSP', provider && norm(provider) === norm(ctx.approved_dsp_name) ? 'pass' : 'fail',
    { contract_provider: provider }, ev(x.contract_provider)));

  const invNo = val(x.invoice_number);
  const docHashes = documents.map((d) => d.hash).filter(Boolean);
  const dupInv = invNo && (registry.invoice_numbers || []).some((n) => norm(n.number) === norm(invNo) && n.case_id !== ctx.case_id);
  const dupDoc = docHashes.some((h) => (registry.document_hashes || []).some((r) => r.hash === h && r.case_id !== ctx.case_id));
  results.push(rule('R8.07', 'No document or invoice reused from another case', dupInv || dupDoc ? 'fail' : 'pass',
    { invoice_number: invNo, duplicate_invoice: !!dupInv, duplicate_file: dupDoc }));

  const reportDate = val(x.report_date) || ctx.report_due;
  const due = (ctx.objectives || []).filter((o) => o.date && o.date <= reportDate);
  const ms = x.milestones || [];
  const unevidenced = due.filter((o) => { const m = ms.find((k) => k.objective_id === o.id); return !m || !m.evidence; });
  results.push(rule('R8.08', 'Milestones due by the report date have evidence', unevidenced.length ? 'fail' : 'pass',
    { due: due.map((o) => o.id), without_evidence: unevidenced.map((o) => o.id) }));

  const notStarted = ms.filter((m) => m.status === 'not_started').map((m) => m.objective_id);
  results.push(rule('R8.09', 'Progress consistent with the approved DTP (AI suggestion, staff confirms)',
    notStarted.length ? 'needs_review' : 'pass', { not_started: notStarted }));

  const lowConf = Object.entries(x).filter(([, f]) => f && typeof f === 'object' && 'confidence' in f && f.value !== null && f.confidence < R.min_field_confidence).map(([k]) => k);
  results.push(rule('R8.10', `Extracted data confidence ≥ ${R.min_field_confidence}`, lowConf.length ? 'needs_review' : 'pass', { low_confidence_fields: lowConf }));

  return summarize(results, 'first');
}

export function validateFinalReport({ x, ctx, rulebook }) {
  const results = [];
  const ms = x.milestones || [];
  const objectives = ctx.objectives || [];
  const missingEv = objectives.filter((o) => { const m = ms.find((k) => k.objective_id === o.id); return !m || !m.evidence || m.status !== 'completed'; });
  results.push(rule('R11.01', 'Every DTP objective is completed with evidence', missingEv.length ? 'fail' : 'pass', { not_completed: missingEv.map((o) => o.id) }));
  const paidTotal = (ctx.first_payment || 0) + (val(x.payment_amount) || 0);
  const gap = ctx.approved_amount - paidTotal;
  results.push(rule('R11.02', 'Total paid to the DSP is consistent with the total grant', Math.abs(gap) <= ctx.approved_amount * 0.05 ? 'pass' : 'needs_review',
    { first_payment: ctx.first_payment, final_payment: val(x.payment_amount), total_paid: paidTotal, approved_amount: ctx.approved_amount }, ev(x.payment_amount)));
  results.push(rule('R11.03', 'Final payment made to the approved DSP', norm(val(x.payment_payee)) === norm(ctx.approved_dsp_name) ? 'pass' : 'fail',
    { payee: val(x.payment_payee) }, ev(x.payment_payee)));
  results.push(rule('R11.04', 'No open flags from the first report', (ctx.open_flags_from_step8 || 0) === 0 ? 'pass' : 'needs_review', { open: ctx.open_flags_from_step8 || 0 }));
  return summarize(results, 'final');
}

function summarize(results, kind) {
  const fails = results.filter((r) => r.result === 'fail').length;
  const reviews = results.filter((r) => r.result === 'needs_review').length;
  return {
    kind, results,
    counts: { pass: results.length - fails - reviews, fail: fails, needs_review: reviews },
    preliminary: fails ? 'DISCREPANCIES_FOUND' : reviews ? 'NEEDS_REVIEW' : 'ALL_CHECKS_PASSED',
    disclaimer: kind === 'first'
      ? 'Staff accept or reject the report. Acceptance is the condition for the second disbursement; this system never executes payments.'
      : 'Staff accept the final report and close the case.',
  };
}
