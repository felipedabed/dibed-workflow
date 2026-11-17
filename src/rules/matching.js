// STEP 4 — MSME EOI & DSP matchmaking. Hard filters, then the 30/30/10/10/20 weighted score.
// Produces an explainable shortlist for STAFF. Staff approve the match (reason required if not #1).

export function runMatching({ approved, roster, quotes, preferences, msme, rulebook }) {
  const M = rulebook.matchmaking;
  const W = M.weights;
  const required = approved.services_required || [];
  const budget = approved.approved_amount;
  const flags = [];
  const evaluated = [];

  for (const dsp of roster) {
    const q = quotes.find((x) => x.dsp_id === dsp.id) || null;
    const covered = q ? required.filter((c) => (q.categories_covered || []).includes(c)) : [];
    const filters = {
      dsp_active: dsp.status === 'active',
      offers_required_category: required.some((c) => (dsp.categories || []).includes(c)),
      quote_received: !!q,
      quote_within_approved_budget: !!q && q.total <= budget,
      capacity_available: dsp.current_load < dsp.capacity,
    };
    const passed = Object.values(filters).every(Boolean);
    const missing = [];
    if (q && (q.weeks === null || q.weeks === undefined)) missing.push('quote.weeks');
    if (dsp.rating === null || dsp.rating === undefined) missing.push('dsp.rating');
    const sharedPeople = (dsp.directors || []).filter((d) => (msme.owners || []).map((o) => o.toLowerCase()).includes(d.toLowerCase()));
    evaluated.push({ dsp, quote: q, covered, filters, passed, missing, conflict_of_interest: sharedPeople });

    if (q && !filters.capacity_available && filters.dsp_active) {
      flags.push({ code: 'OVERSUBSCRIBED', severity: 'warning', status: 'open',
        message: `${dsp.name} is at capacity (${dsp.current_load}/${dsp.capacity}); excluded unless staff override (tie-break rule to confirm)` });
    }
    if (q && !filters.dsp_active) flags.push({ code: 'DSP_NOT_ACTIVE', severity: 'warning', status: 'open', message: `${dsp.name} sent a quote but is ${dsp.status}` });
    if (missing.length && q) flags.push({ code: 'MISSING_DSP_DATA', severity: 'info', status: 'open', message: `${dsp.name}: missing ${missing.join(', ')}` });
    if (sharedPeople.length && q) flags.push({ code: 'POSSIBLE_CONFLICT_OF_INTEREST', severity: 'blocking', status: 'open',
      message: `${dsp.name} shares director(s) with the MSME: ${sharedPeople.join(', ')}` });
    if (q && covered.length < required.length && filters.dsp_active) flags.push({ code: 'PARTIAL_COVERAGE', severity: 'info', status: 'open',
      message: `${dsp.name} covers ${covered.length}/${required.length} required services (missing: ${required.filter((c) => !covered.includes(c)).join(', ')})` });
  }

  const eligible = evaluated.filter((e) => e.passed);
  if (!eligible.length) flags.push({ code: 'NO_ELIGIBLE_DSP', severity: 'blocking', status: 'open', message: 'No DSP passes the hard filters — staff must decide next steps' });
  const minPrice = Math.min(...eligible.map((e) => e.quote.total));
  const minWeeks = Math.min(...eligible.map((e) => e.quote.weeks || Infinity));
  const prefs = (preferences.preferred_dsps || []);

  const scored = eligible.map((e) => {
    const sub = {
      service_fit: required.length ? e.covered.length / required.length : 0,
      price: e.quote.total ? minPrice / e.quote.total : 0,
      timeline: e.quote.weeks ? minWeeks / e.quote.weeks : 0,
      msme_preference: prefs.includes(e.dsp.id) || prefs.includes(e.dsp.name) ? 1 : 0,
      track_record: e.dsp.rating ? Math.min(1, e.dsp.rating / 5) : 0,
    };
    const total = Object.entries(W).reduce((acc, [k, w]) => acc + w * sub[k], 0);
    const explanation = Object.entries(W).map(([k, w]) => `${k} ${Math.round(sub[k] * 100)}% × ${w} = ${(w * sub[k] * 100).toFixed(1)}`);
    return { dsp_id: e.dsp.id, dsp_name: e.dsp.name, quote_total: e.quote.total, quote_weeks: e.quote.weeks,
      covered: e.covered, sub_scores: sub, total_score: Math.round(total * 1000) / 10, explanation,
      conflict_of_interest: e.conflict_of_interest };
  }).sort((a, b) => b.total_score - a.total_score);
  scored.forEach((s, i) => { s.rank = i + 1; });

  const excluded = evaluated.filter((e) => !e.passed && e.quote).map((e) => ({
    dsp_id: e.dsp.id, dsp_name: e.dsp.name,
    failed_filters: Object.entries(e.filters).filter(([, v]) => !v).map(([k]) => k),
  }));

  return {
    required_services: required, approved_budget: budget, weights: W, weights_note: M.weights_note,
    shortlist: scored.slice(0, M.shortlist_size), all_ranked: scored, excluded, flags,
    disclaimer: 'Explainable ranking for staff. The system does not select the provider.',
  };
}
