// End-to-end test of the rules pipeline with the deterministic extractor and simulated human decisions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundle, readJson } from '../scripts/bundle.mjs';

const B = loadBundle();
const rulebook = readJson('rulebook/rulebook.json');
const roster = readJson('data/dsp-roster.json');
const data = readJson('data/packages.json');

function eoiFor(pkg, overrides = {}) {
  const form = {
    [B.EOI_FIELDS.email]: 'owner@example.bz', [B.EOI_FIELDS.applicantName]: pkg.owners[0],
    [B.EOI_FIELDS.businessName]: pkg.business_name, [B.EOI_FIELDS.contactNumber]: '+501 600 0000',
    [B.EOI_FIELDS.gender]: 'Female', [B.EOI_FIELDS.age]: '36-55',
    [B.EOI_FIELDS.address]: 'Main Street, Cayo District', [B.EOI_FIELDS.sector]: 'Food and Beverage',
    [B.EOI_FIELDS.businessDescription]: 'Bakery', [B.EOI_FIELDS.registered]: 'Yes',
    [B.EOI_FIELDS.category]: 'Small: Fewer than 20 full-time employees', [B.EOI_FIELDS.supportInterest]: 'Digital transformation support',
    [B.EOI_FIELDS.digitalTools]: ['Social media or WhatsApp Business', 'Business website'],
    [B.EOI_FIELDS.exportExperience]: 'Never exported but interested in starting', [B.EOI_FIELDS.socialLinks]: 'instagram.com/x',
    [B.EOI_FIELDS.improvementGoals]: 'Online orders', [B.EOI_FIELDS.acknowledgment]: ['I understand'],
    [B.EOI_FIELDS.contactPermission]: 'Yes', [B.EOI_FIELDS.freeAdvising]: 'Yes', ...overrides,
  };
  return B.normalizeEoi(form);
}

function screen(pkgKey, overrides) {
  const pkg = data.packages[pkgKey];
  const eoi = eoiFor(pkg, overrides);
  const x = B.fallbackExtractDtp(pkg.documents_v1);
  const cc = B.verifyCitations(x, pkg.documents_v1, 0.8);
  return { pkg, eoi, x, cc, s: B.runScreening({ eoi, documents: pkg.documents_v1, extraction: x, citationCheck: cc, rulebook }) };
}

test('tier classification uses the official EOI thresholds', () => {
  assert.equal(B.classifyTier({ employees: 4, annual_sales: 90000, capital_investment: 40000 }, rulebook).proposed, 'micro');
  assert.equal(B.classifyTier({ employees: 7, annual_sales: 182000, capital_investment: 61000 }, rulebook).proposed, 'small');
  const m = B.classifyTier({ employees: 25, annual_sales: 410000, capital_investment: 90000 }, rulebook);
  assert.equal(m.diverges, true);
  assert.equal(B.classifyTier({ employees: 60 }, rulebook).exceeds_medium, true);
});

test('intake: complete EOI is invited to apply', () => {
  const r = B.runIntake(eoiFor(data.packages.A), rulebook);
  assert.equal(r.district, 'Cayo');
  assert.equal(r.outcome, 'INVITE_TO_FORMAL_APPLICATION');
});

test('citations from the fallback extractor are all verified', () => {
  const { cc } = screen('A');
  assert.ok(cc.checked > 10);
  assert.equal(cc.issues.filter((i) => i.problem === 'CITATION_NOT_FOUND').length, 0);
});

test('screening A: strong, recommended, no blocking flags', () => {
  const { s } = screen('A');
  assert.equal(s.recommendation, 'RECOMMEND_FOR_PANEL_APPROVAL', JSON.stringify(s.flags));
  assert.ok(s.score.total >= 60, `score ${s.score.total}`);
  assert.equal(s.tier.used, 'small');
});

test('screening B: medium tier, budget mismatch flagged', () => {
  const { s } = screen('B', { [B.EOI_FIELDS.category]: 'Medium: Fewer than 50 full-time employees',
    [B.EOI_FIELDS.address]: 'Hopkins Village, Stann Creek', [B.EOI_FIELDS.sector]: 'Tourism and Hospitality',
    [B.EOI_FIELDS.digitalTools]: ['Social media or WhatsApp Business', 'Business website', 'Digital payments or point-of-sale system'] });
  assert.equal(s.tier.used, 'medium');
  assert.ok(s.flags.some((f) => f.code === 'BUDGET_SUM_MISMATCH'));
  console.log('B score', s.score.total, s.recommendation);
});

test('screening C: missing document → request info, never reject', () => {
  const { s } = screen('C', { [B.EOI_FIELDS.address]: 'Corozal Town, Corozal', [B.EOI_FIELDS.sector]: 'Agriculture' });
  assert.equal(s.recommendation, 'REQUEST_INFORMATION_FROM_MSME');
  for (const code of ['MISSING_DOC', 'ABOVE_GRANT_CAP', 'TIER_CRITERIA_DIVERGE', 'UNCATEGORIZED_BUDGET_LINE']) {
    assert.ok(s.flags.some((f) => f.code === code), code);
  }
});

test('advisor checks + version diff + lock', () => {
  const pkg = data.packages.B;
  const x1 = B.fallbackExtractDtp(pkg.documents_v1);
  const x2 = B.fallbackExtractDtp(pkg.documents_v2);
  const checks = B.advisorChecks({ extraction: x1, rulebook, approvedAmount: 40000 });
  assert.ok(checks.some((k) => k.result === 'fail'));
  const diff = B.diffVersions(x1, x2, rulebook);
  assert.ok(diff.some((d) => d.section === 'Objectives'));
  const rec = B.dtpVersionRecord({ caseId: 'T', version: 2, documents: pkg.documents_v2, extraction: x2, author: 'MSME' });
  assert.equal(rec.hash.length, 64);
  assert.equal(B.lockApprovedVersion(rec, 'Advisor').locked, true);
});

test('matching A: oversubscribed DSP excluded, explainable shortlist', () => {
  const pkg = data.packages.A;
  const x = B.fallbackExtractDtp(pkg.documents_v1);
  const m = B.runMatching({ approved: { services_required: x.services_required, approved_amount: 3800 }, roster, quotes: pkg.quotes,
    preferences: { preferred_dsps: ['DSP-04'] }, msme: { owners: pkg.owners }, rulebook });
  assert.ok(m.flags.some((f) => f.code === 'OVERSUBSCRIBED'));
  assert.ok(!m.shortlist.some((s) => s.dsp_id === 'DSP-02'));
  assert.equal(m.shortlist[0].rank, 1);
  console.log('A shortlist', m.shortlist.map((s) => `${s.dsp_name} ${s.total_score}`).join(' | '));
});

test('matching B: conflict of interest and suspended DSP flagged', () => {
  const pkg = data.packages.B;
  const x = B.fallbackExtractDtp(pkg.documents_v2);
  const m = B.runMatching({ approved: { services_required: x.services_required, approved_amount: 36000 }, roster, quotes: pkg.quotes,
    preferences: { preferred_dsps: [] }, msme: { owners: pkg.owners }, rulebook });
  assert.ok(m.flags.some((f) => f.code === 'POSSIBLE_CONFLICT_OF_INTEREST'));
  assert.ok(m.flags.some((f) => f.code === 'DSP_NOT_ACTIVE'));
});

function caseAfterMatch() {
  const pkg = data.packages.A;
  const x = B.fallbackExtractDtp(pkg.documents_v1);
  const c = { case_id: 'DIBED-TEST-0001', msme: { business_name: pkg.business_name },
    approved_dtp: { approved_amount: 3800, objectives: x.objectives, timeline_start: '2027-04-01', timeline_end: '2027-09-30' },
    match: { dsp_name: 'Jaguar Web & Commerce', quote_total: 3500 } };
  c.disbursements = B.simulateOutOfScopeSteps(c);
  return c;
}

for (const [variant, expectFail] of [['clean', null], ['payee_mismatch', 'R8.02'], ['amount_mismatch', 'R8.05'], ['duplicate_invoice', 'R8.07'], ['missing_evidence', 'R8.08']]) {
  test(`report 1 validator: ${variant}`, () => {
    const c = caseAfterMatch();
    const docs = B.generateFirstReport(c, variant);
    const x = B.fallbackExtractReport(docs);
    const v = B.validateFirstReport({ x, documents: docs, rulebook, registry: data.registry,
      ctx: { case_id: c.case_id, approved_dsp_name: c.match.dsp_name, tranche_amount: c.disbursements.first.amount,
        agreement_signed: c.disbursements.agreement_signed, objectives: c.approved_dtp.objectives, report_due: c.disbursements.report_1_date } });
    if (!expectFail) assert.equal(v.preliminary, 'ALL_CHECKS_PASSED', JSON.stringify(v.results.filter((r) => r.result !== 'pass')));
    else assert.equal(v.results.find((r) => r.id === expectFail).result, 'fail', JSON.stringify(v.results));
  });
}

test('final report validator', () => {
  const c = caseAfterMatch();
  for (const [variant, expected] of [['complete', 'ALL_CHECKS_PASSED'], ['payment_gap', 'NEEDS_REVIEW']]) {
    const x = B.fallbackExtractReport(B.generateFinalReport(c, variant));
    const v = B.validateFinalReport({ x, rulebook, ctx: { approved_amount: 3800, first_payment: c.disbursements.first.amount,
      approved_dsp_name: c.match.dsp_name, objectives: c.approved_dtp.objectives, open_flags_from_step8: 0 } });
    assert.equal(v.preliminary, expected, JSON.stringify(v.results));
  }
});
