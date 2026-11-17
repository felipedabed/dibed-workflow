// HTML pages shown to each human at each gate (rendered inside n8n Form pages).
// Only tags allowed by the n8n form sanitizer are used (h3, p, b, table, ul, li, code, i).

export function esc(s) {
  return String(s === null || s === undefined ? '—' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const icon = (r) => ({ pass: '✅', fail: '❌', needs_review: '⚠️', needs_advisor: '🟠', info: 'ℹ️' }[r] || '•');
const sevIcon = (s) => ({ blocking: '⛔', warning: '⚠️', info: 'ℹ️' }[s] || '•');

export function caseHeader(c) {
  return `<p><b>Case ${esc(c.case_id)}</b> · ${esc(c.msme.business_name)} · ${esc(c.msme.sector)} · ${esc(c.msme.district || 'district not found')}</p>`;
}

export function slaLine(sla) {
  if (!sla) return '';
  return `<p><i>Step SLA: ${esc(sla.sla_days)} days · started ${esc(sla.started_at.slice(0, 10))} · due by <b>${esc(sla.due_at ? sla.due_at.slice(0, 10) : '—')}</b></i></p>`;
}

export function flagsTable(flags) {
  if (!flags || !flags.length) return '<p>No flags.</p>';
  return `<table><thead><tr><th></th><th>Flag</th><th>What the reviewer should look at</th></tr></thead><tbody>${
    flags.map((f) => `<tr><td>${sevIcon(f.severity)}</td><td><code>${esc(f.code)}</code></td><td>${esc(f.message)}</td></tr>`).join('')
  }</tbody></table>`;
}

export function checksTable(checks) {
  return `<table><thead><tr><th></th><th>Rule</th><th>Check</th><th>Detail</th></tr></thead><tbody>${
    checks.map((k) => `<tr><td>${icon(k.result)}</td><td><code>${esc(k.id)}</code></td><td>${esc(k.rule || k.question)}</td><td>${esc(typeof k.detail === 'object' ? JSON.stringify(k.detail) : k.detail ?? (k.evidence ? JSON.stringify(k.evidence) : ''))}</td></tr>`).join('')
  }</tbody></table>`;
}

export function intakePage(c) {
  const i = c.steps.intake;
  return [
    caseHeader(c),
    `<h3>Pre-screening result (automatic rules on your Expression of Interest)</h3>`,
    checksTable(i.checks),
    flagsTable(i.flags),
    `<p>Declared category: <b>${esc(i.declared_tier)}</b> · Indicative grant cap: <b>BZD ${esc(i.indicative_grant_cap)}</b></p>`,
    `<h3>Next: formal application</h3><p>Choose a demo application package (synthetic Belizean MSME) or paste your own DTP text.</p>`,
  ].join('');
}

export function extractionTable(x) {
  const rows = [
    ['Business name', x.business_name], ['Registration number', x.registration_number], ['Employees', x.employees],
    ['Annual sales (BZD)', x.annual_sales], ['Capital investment (BZD)', x.capital_investment],
    ['Amount requested (BZD)', x.amount_requested], ['Declared budget total', x.budget_total_declared],
    ['Timeline end', x.timeline_end], ['Responsible person', x.responsible_person],
  ];
  return `<table><thead><tr><th>Field</th><th>Value</th><th>Source (quote · page)</th><th>Conf.</th></tr></thead><tbody>${
    rows.map(([k, f]) => {
      const v = f && typeof f === 'object' ? f : { value: f };
      const ok = v.citation_verified === false ? ' ❌ quote not found' : '';
      return `<tr><td>${esc(k)}</td><td><b>${esc(v.value)}</b></td><td><i>“${esc(v.quote)}”</i> · p.${esc(v.page)}${ok}</td><td>${esc(v.confidence)}</td></tr>`;
    }).join('')
  }</tbody></table>`;
}

export function panelPage(c) {
  const s = c.steps.screening;
  const x = c.extraction.dtp_v1;
  return [
    caseHeader(c), slaLine(c.sla.screening),
    `<h3>Preliminary result: ${esc(s.recommendation)}</h3>`,
    `<p><b>Preliminary score ${esc(s.score.total)} / ${esc(s.score.max)}</b> (threshold ${esc(s.score.threshold)}${s.score.borderline ? ', BORDERLINE' : ''}) · Tier: <b>${esc(s.tier.used)}</b> · Grant cap: BZD ${esc(s.tier.grant_cap)}</p>`,
    `<p><i>Extractor: ${esc(c.ai_runs[c.ai_runs.length - 1].mode)} · citations verified ${esc(c.ai_runs[c.ai_runs.length - 1].citations_verified)}/${esc(c.ai_runs[c.ai_runs.length - 1].citations_checked)}</i></p>`,
    `<table><thead><tr><th>Criterion</th><th>Points</th><th>Method</th><th>Rationale / evidence</th></tr></thead><tbody>${
      s.score.breakdown.map((b) => `<tr><td>${esc(b.id)} ${esc(b.name)}</td><td><b>${esc(b.points)}</b> / ${esc(b.max)}</td><td>${esc(b.method)}${b.needs_human_confirmation ? ' — confirm' : ''}</td><td>${esc(b.rationale)}${b.quote ? ` <i>“${esc(String(b.quote).slice(0, 160))}”</i> p.${esc(b.page)}` : ''}</td></tr>`).join('')
    }</tbody></table>`,
    `<h3>Flags</h3>`, flagsTable(s.flags),
    `<h3>Rules applied</h3>`, checksTable(s.checks),
    `<h3>Extracted evidence (AI, cited)</h3>`, extractionTable(x),
    `<p><i>${esc(s.disclaimer)}</i></p>`,
  ].join('');
}

export function advisorPage(c) {
  const v = c.dtp_versions[c.dtp_versions.length - 1];
  const diff = c.steps.advisor.diff || [];
  return [
    caseHeader(c), slaLine(c.sla.advisor_review),
    `<h3>DTP version v${esc(v.version)} · hash <code>${esc(v.hash.slice(0, 16))}…</code></h3>`,
    diff.length ? `<p><b>Changes vs previous version:</b></p><ul>${diff.map((d) => `<li>${esc(d.section)}: ${esc(JSON.stringify(d))}</li>`).join('')}</ul>` : '',
    `<h3>Structured review checks</h3><p>✅ rule passed · ❌ rule failed · 🟠 needs your judgment (AI suggestions are only suggestions)</p>`,
    `<table><thead><tr><th></th><th>Check</th><th>Section</th><th>Question</th><th>Resolved by</th><th>Evidence</th></tr></thead><tbody>${
      c.steps.advisor.checks.map((k) => `<tr><td>${icon(k.result)}</td><td><code>${esc(k.id)}</code></td><td>${esc(k.section)}</td><td>${esc(k.question)}</td><td>${esc(k.method)}</td><td>${esc(JSON.stringify(k.evidence))}</td></tr>`).join('')
    }</tbody></table>`,
    c.steps.advisor.comments && c.steps.advisor.comments.length ? `<h3>Previous comments</h3><ul>${c.steps.advisor.comments.map((m) => `<li>v${esc(m.version)} · ${esc(m.by)}: ${esc(m.text)}</li>`).join('')}</ul>` : '',
  ].join('');
}

export function revisionPage(c) {
  const last = c.steps.advisor.comments[c.steps.advisor.comments.length - 1];
  return [caseHeader(c), `<h3>Your advisor requested changes</h3>`, `<p>${esc(last ? last.text : '')}</p>`,
    `<p>Upload a revised DTP. The previous version is preserved; the system will compare both versions for the advisor.</p>`].join('');
}

export function preferencesPage(c, roster) {
  const a = c.approved_dtp;
  return [caseHeader(c), `<h3>Approved DTP (locked v${esc(a.version)}, hash <code>${esc(a.hash.slice(0, 16))}…</code>)</h3>`,
    `<p>Services required: <b>${esc(a.services_required.join(', '))}</b> · Approved amount: <b>BZD ${esc(a.approved_amount)}</b></p>`,
    `<h3>Digital Service Providers in the roster</h3><table><thead><tr><th>DSP</th><th>Categories</th><th>Location</th></tr></thead><tbody>${
      roster.map((d) => `<tr><td>${esc(d.name)}</td><td>${esc(d.categories.join(', '))}</td><td>${esc(d.district)}</td></tr>`).join('')
    }</tbody></table>`,
    `<p>Confirm your interest and (optionally) tell us which providers you prefer. Program staff approve the final match.</p>`].join('');
}

export function matchPage(c) {
  const m = c.steps.matching;
  return [caseHeader(c), slaLine(c.sla.matchmaking),
    `<h3>Explainable shortlist (weights ${esc(Object.entries(m.weights).map(([k, w]) => `${k} ${w * 100}%`).join(' · '))})</h3>`,
    `<p><i>${esc(m.weights_note)}</i></p>`,
    `<table><thead><tr><th>#</th><th>DSP</th><th>Score</th><th>Quote</th><th>Weeks</th><th>Covers</th><th>Breakdown</th></tr></thead><tbody>${
      m.shortlist.map((s) => `<tr><td>${s.rank}</td><td><b>${esc(s.dsp_name)}</b></td><td><b>${esc(s.total_score)}</b></td><td>BZD ${esc(s.quote_total)}</td><td>${esc(s.quote_weeks)}</td><td>${esc(s.covered.join(', '))}</td><td>${esc(s.explanation.join(' | '))}</td></tr>`).join('')
    }</tbody></table>`,
    m.excluded.length ? `<h3>Excluded by hard filters</h3><ul>${m.excluded.map((e) => `<li>${esc(e.dsp_name)}: ${esc(e.failed_filters.join(', '))}</li>`).join('')}</ul>` : '',
    `<h3>Flags</h3>`, flagsTable(m.flags),
    `<p><i>${esc(m.disclaimer)} If you do not select #1, a reason is mandatory.</i></p>`].join('');
}

export function reportUploadPage(c, kind) {
  return [caseHeader(c),
    kind === 'first'
      ? `<h3>First progress report</h3><p>Approved DSP: <b>${esc(c.match.dsp_name)}</b> · First tranche received: <b>BZD ${esc(c.disbursements.first.amount)}</b> on ${esc(c.disbursements.first.date)}</p><p>Upload: progress report, proof of payment to the DSP, DSP invoice, MSME–DSP contract.</p>`
      : `<h3>Final report</h3><p>Upload the final report with evidence for every objective and the proof of the final payment to <b>${esc(c.match.dsp_name)}</b>.</p>`,
  ].join('');
}

export function reportReviewPage(c, kind) {
  const v = kind === 'first' ? c.steps.report_1 : c.steps.final_report;
  const sla = kind === 'first' ? c.sla.report_1_review : c.sla.final_review;
  return [caseHeader(c), slaLine(sla),
    `<h3>${kind === 'first' ? 'First report' : 'Final report'} validation: ${esc(v.preliminary)}</h3>`,
    `<p>✅ ${v.counts.pass} pass · ❌ ${v.counts.fail} fail · ⚠️ ${v.counts.needs_review} need review</p>`,
    `<table><thead><tr><th></th><th>Rule</th><th>Check</th><th>Detail</th><th>Evidence</th></tr></thead><tbody>${
      v.results.map((r) => `<tr><td>${icon(r.result)}</td><td><code>${esc(r.id)}</code></td><td>${esc(r.rule)}</td><td>${esc(JSON.stringify(r.detail))}</td><td>${r.evidence ? `<i>“${esc(r.evidence.quote)}”</i> p.${esc(r.evidence.page)}` : ''}</td></tr>`).join('')
    }</tbody></table>`,
    `<p><i>${esc(v.disclaimer)}</i></p>`].join('');
}

export function caseRecordPage(c) {
  const cost = c.ai_runs.reduce((a, r) => a + (r.cost_usd || 0), 0);
  return [
    `<h3>Case ${esc(c.case_id)} — ${esc(c.status)}</h3>`,
    `<p>${esc(c.msme.business_name)} · DSP: ${esc(c.match ? c.match.dsp_name : '—')} · Approved amount: BZD ${esc(c.approved_dtp ? c.approved_dtp.approved_amount : '—')} · Rulebook ${esc(c.rulebook_version)}</p>`,
    `<p>AI runs: ${c.ai_runs.length} (${esc(c.ai_runs.map((r) => r.mode).join(', '))}) · estimated AI cost: USD ${cost.toFixed(4)}</p>`,
    `<h3>Decisions (human)</h3><table><thead><tr><th>When</th><th>Who</th><th>Role</th><th>Decision</th><th>Reason</th></tr></thead><tbody>${
      c.decisions.map((d) => `<tr><td>${esc(d.at.slice(0, 19).replace('T', ' '))}</td><td>${esc(d.by)}</td><td>${esc(d.role)}</td><td><b>${esc(d.decision)}</b>${d.override ? ' (override)' : ''}</td><td>${esc(d.reason)}</td></tr>`).join('')
    }</tbody></table>`,
    `<h3>Audit trail</h3><table><thead><tr><th>When</th><th>Actor</th><th>Action</th></tr></thead><tbody>${
      c.audit.map((e) => `<tr><td>${esc(e.at.slice(11, 19))}</td><td>${esc(e.actor)} (${esc(e.role)})</td><td>${esc(e.action)}</td></tr>`).join('')
    }</tbody></table>`,
    `<p><i>The full raw input/output of every step is available in n8n → Executions.</i></p>`,
  ].join('');
}
