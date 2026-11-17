// Generates n8n/dibed-case-workflow.json from the source modules in src/ and the data in data/ + rulebook/.
// One n8n execution = one MSME case travelling through steps 1 → 11, pausing at every human gate.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, source, readJson } from './bundle.mjs';

const rulebook = readJson('rulebook/rulebook.json');
const roster = readJson('data/dsp-roster.json');
const packages = readJson('data/packages.json');
const { EOI_FIELDS } = (await import('./bundle.mjs')).loadBundle(['intake']);

const N = {
  trigger: '👤 MSME · Expression of Interest form',
  load: '⚙️ Load rulebook + reference data',
  intake: '📏 R1 · Intake rules (pre-screening)',
  prepApp: '🧾 Prepare · formal application page',
  fApp: '👤 MSME · Formal application (DTP)',
  asmApp: '🗂️ Assemble application documents',
  buildAi: '🤖 Build AI extraction request',
  claude: '🤖 Claude · bounded extraction (cited)',
  parse: '🛡️ Parse + verify citations',
  fallback: '🛟 Fallback extractor (no AI)',
  route: '🔀 Route by case stage',
  screen: '📏 R2 · Screening rules (/80)',
  fPanel: '👤 PANEL · Review & decide',
  recPanel: '📝 Record panel decision',
  swPanel: '🔀 Panel outcome',
  endNo: '🏁 Case closed · not approved',
  diff: '📏 R3 · Version diff (v1 → v2)',
  advisor: '📏 R3 · Advisor structured checks',
  fAdvisor: '👤 ADVISOR · Review DTP',
  recAdvisor: '📝 Record advisor decision',
  swAdvisor: '🔀 Advisor outcome',
  prepRev: '🧾 Prepare · revision request page',
  fRev: '👤 MSME · Submit revised DTP',
  asmRev: '🗂️ Assemble revised DTP',
  prepPref: '🧾 Prepare · matchmaking EOI page',
  fPref: '👤 MSME · Matchmaking EOI & preferences',
  match: '📏 R4 · Matchmaking 30/30/10/10/20',
  fMatch: '👤 STAFF · Approve DSP match',
  recMatch: '📝 Record match decision',
  s5: '⏸️ Step 5 · Grant agreement (out of scope)',
  s6: '⏸️ Step 6 · 1st disbursement (out of scope)',
  s7: '⏸️ Step 7 · Implementation (out of scope)',
  sim: '🧪 Simulate steps 5–7 dates (demo)',
  prepR1: '🧾 Prepare · first report page',
  fR1: '👤 MSME · Upload first report',
  asmR1: '🗂️ Assemble first report documents',
  v8: '📏 R8 · First report validator',
  fR1Review: '👤 STAFF · Review first report',
  recR1: '📝 Record report decision',
  swR1: '🔀 Report outcome',
  endHold: '🏁 Case on hold · escalated',
  s9: '⏸️ Step 9 · 2nd disbursement (out of scope)',
  s10: '⏸️ Step 10 · Final implementation (out of scope)',
  prepFinal: '🧾 Prepare · final report page',
  fFinal: '👤 MSME · Upload final report',
  asmFinal: '🗂️ Assemble final report documents',
  v11: '📏 R11 · Final report validator',
  fClose: '👤 STAFF · Close-out',
  recClose: '📝 Record close-out decision',
  swClose: '🔀 Close-out outcome',
  record: '📚 Build case record + audit trail',
  end: '🏁 Case closed · full record',
};

const nodes = [];
const connections = {};
let idSeq = 0;
const uid = () => `00000000-0000-4000-8000-${String(++idSeq).padStart(12, '0')}`;

function add(name, type, typeVersion, position, parameters, extra = {}) {
  nodes.push({ id: uid(), name, type, typeVersion, position, parameters, ...extra });
}
function link(from, to, outIndex = 0) {
  connections[from] = connections[from] || { main: [] };
  while (connections[from].main.length <= outIndex) connections[from].main.push([]);
  connections[from].main[outIndex].push({ node: to, type: 'main', index: 0 });
}

const HEADER = '// Generated from src/ by scripts/build-workflow.mjs — edit the source modules, not this node.\nconst structuredClone = (o) => JSON.parse(JSON.stringify(o));\nconst one = (v) => (Array.isArray(v) ? v[0] : v);\n';
const REF = `const REF = $('${N.load}').first().json;\nconst RB = REF.rulebook;\n`;
function code(name, position, body, modules = [], notes = '') {
  add(name, 'n8n-nodes-base.code', 2, position, {
    jsCode: `${HEADER}${modules.length ? `${source(modules)}\n\n// ---------------- node logic ----------------\n` : ''}${body}`,
  }, notes ? { notes, notesInFlow: true } : {});
}
const prev = (n) => `structuredClone($('${n}').last().json.case)`;
const audit = (actor, role, action) => `c.audit.push({ at: new Date().toISOString(), actor: ${actor}, role: '${role}', action: ${action} });`;

// ------------------------------------------------------------ forms
const CSS = `.container{max-width:1180px !important;width:96% !important}.card{max-width:none !important}table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0}th,td{border:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f3f3ef}code{font-size:11px}h3{margin:14px 0 6px}.form-group{margin-bottom:12px}`;
function formPage(name, position, title, buttonLabel = 'Submit') {
  add(name, 'n8n-nodes-base.form', 2.5, position, {
    operation: 'page', defineForm: 'json', jsonOutput: '={{ JSON.stringify($json.form_fields) }}',
    options: { formTitle: title, buttonLabel, customCss: CSS },
  });
}
function formEnd(name, position, title) {
  add(name, 'n8n-nodes-base.form', 2.5, position, {
    operation: 'completion', respondWith: 'showText', responseText: '={{ $json.page }}',
    options: { formTitle: title, customCss: CSS },
  });
}
function noop(name, position, note) {
  add(name, 'n8n-nodes-base.noOp', 1, position, {}, { notes: note, notesInFlow: true });
}
function switchNode(name, position, expr, outputs) {
  add(name, 'n8n-nodes-base.switch', 3.2, position, { mode: 'expression', numberOutputs: outputs, output: `={{ ${expr} }}` });
}

const opts = (arr) => ({ values: arr.map((option) => ({ option })) });
const F = EOI_FIELDS;
const eoiFields = [
  { fieldLabel: F.email, fieldType: 'email', requiredField: true },
  { fieldLabel: F.applicantName, requiredField: true },
  { fieldLabel: F.businessName, requiredField: true, placeholder: "Demo: use the package business name, e.g. Maya's Bakery Ltd." },
  { fieldLabel: F.contactNumber, requiredField: true },
  { fieldLabel: F.gender, fieldType: 'radio', fieldOptions: opts(['Female', 'Male']), requiredField: true },
  { fieldLabel: F.age, fieldType: 'dropdown', fieldOptions: opts(['18-25', '26-30', '31-35', '36-55', '56 or more']), requiredField: true },
  { fieldLabel: F.address, requiredField: true, placeholder: 'e.g. 12 Burns Avenue, San Ignacio, Cayo' },
  { fieldLabel: F.sector, fieldType: 'dropdown', fieldOptions: opts(rulebook.program.eligible_sectors), requiredField: true },
  { fieldLabel: F.businessDescription, fieldType: 'textarea', requiredField: true },
  { fieldLabel: F.registered, fieldType: 'radio', fieldOptions: opts(['Yes', 'No']), requiredField: true },
  { fieldLabel: F.category, fieldType: 'radio', requiredField: true, fieldOptions: opts([
    'Micro: Fewer than 5 full-time employees; annual sales below BZD 99,400; capital investment below BZD 49,600',
    'Small: Fewer than 20 full-time employees; annual sales below BZD 496,800; capital investment below BZD 149,000; manufacturing space below 372 m2',
    'Medium: Fewer than 50 full-time employees; annual sales below BZD 1,490,400; capital investment below BZD 496,800; manufacturing space below 557 m2',
    'Unsure: I need assistance determining my business category']) },
  { fieldLabel: F.supportInterest, fieldType: 'radio', requiredField: true, fieldOptions: opts([
    'Digital transformation support', 'Export readiness and development support', 'Both digital transformation and export development support', 'Unsure: I would like guidance']) },
  { fieldLabel: F.digitalTools, fieldType: 'checkbox', requiredField: true, fieldOptions: opts([
    'Social media or WhatsApp Business', 'Business website', 'Online store or e-commerce platform', 'Digital payments or point-of-sale system',
    'Accounting or bookkeeping software', 'Inventory management software', 'Customer management or booking system', 'None currently']) },
  { fieldLabel: F.exportExperience, fieldType: 'radio', requiredField: true, fieldOptions: opts(Object.keys(rulebook.screening.criteria.find((c) => c.id === 'C6').points_by_export_experience)) },
  { fieldLabel: F.socialLinks, requiredField: true },
  { fieldLabel: F.improvementGoals, fieldType: 'textarea', requiredField: true },
  { fieldLabel: F.acknowledgment, fieldType: 'checkbox', requiredField: true, fieldOptions: opts(['I understand']) },
  { fieldLabel: F.contactPermission, fieldType: 'radio', fieldOptions: opts(['Yes', 'No']), requiredField: true },
  { fieldLabel: F.freeAdvising, fieldType: 'radio', fieldOptions: opts(['Yes', 'No']), requiredField: true },
];

const X = 240; // column width
const col = (i) => i * X;
const ROW = 300;
const LOW = 560;
const AI = 900;

// ================================================================ STEP 1 · INTAKE
add(N.trigger, 'n8n-nodes-base.formTrigger', 2.5, [col(0), ROW], {
  path: 'dibed-eoi', formTitle: 'DIBED · MSME Digital Transformation and Export Readiness — Expression of Interest 2027',
  formDescription: 'Demo replica of the BELTRAIDE EOI form (synthetic data only). This is not an official grant application.',
  formFields: { values: eoiFields }, responseMode: 'onReceived', options: { buttonLabel: 'Submit Expression of Interest', customCss: CSS },
}, { webhookId: 'dibed-eoi' });

code(N.load, [col(1), ROW], `
// Versioned configuration: changing a threshold or weight = editing rulebook.json + approval (see docs/runbook.md).
return [{ json: {
  rulebook: ${JSON.stringify(rulebook)},
  roster: ${JSON.stringify(roster)},
  packages: ${JSON.stringify(packages)},
  eoi_raw: $json,
} }];`, [], 'Rulebook version ' + rulebook.version);

code(N.intake, [col(2), ROW], `${REF}
const eoi = normalizeEoi(REF.eoi_raw);
const intake = runIntake(eoi, RB);
const n = String(Math.floor(Math.random() * 9000) + 1000);
const c = {
  case_id: 'DIBED-2027-' + n, status: 'INTAKE', stage: 'intake', rulebook_version: RB.version,
  created_at: new Date().toISOString(),
  msme: { business_name: eoi.businessName, applicant: eoi.applicantName, sector: eoi.sector, district: intake.district, owners: [eoi.applicantName] },
  eoi, steps: { intake }, sla: {}, flags: [...intake.flags], decisions: [], audit: [], ai_runs: [], dtp_versions: [], documents: [], extraction: {},
};
${audit('eoi.applicantName', 'MSME', "'Expression of Interest submitted'")}
${audit("'system'", 'rules', "'R1 intake rules applied → ' + intake.outcome")}
return [{ json: { case: c } }];`, ['intake'], 'Deterministic: tier thresholds, district, sector, program window');

code(N.prepApp, [col(3), ROW], `${REF}
const c = structuredClone($json.case);
const pkgs = REF.packages.packages;
const form_fields = [
  { fieldType: 'html', html: intakePage(c) },
  { fieldLabel: 'Application package (demo)', fieldType: 'dropdown', requiredField: true,
    fieldOptions: { values: Object.values(pkgs).map((p) => ({ option: p.label })) } },
  { fieldLabel: 'Or paste your own DTP text (optional, replaces the package DTP)', fieldType: 'textarea' },
];
return [{ json: { case: c, form_fields } }];`, ['util', 'pages']);

formPage(N.fApp, [col(4), ROW], 'Formal application · Digital Transformation Plan', 'Submit application');

code(N.asmApp, [col(5), ROW], `${REF}
const c = ${prev(N.prepApp)};
const label = one($json['Application package (demo)']);
const key = Object.keys(REF.packages.packages).find((k) => REF.packages.packages[k].label === label) || 'A';
const pkg = REF.packages.packages[key];
let documents = structuredClone(pkg.documents_v1);
const pastedRaw = String(one($json['Or paste your own DTP text (optional, replaces the package DTP)']) || '').trim();
const pasted = pastedRaw.length >= 200 ? pastedRaw : ''; // ignore accidental short input
if (pasted) documents = documents.filter((d) => d.type !== 'dtp').concat([{ type: 'dtp', name: 'DTP_pasted.txt', text: pasted.startsWith('[Page') ? pasted : '[Page 1]\\n' + pasted }]);
documents = documents.map((d) => ({ ...d, hash: sha256(d.text) }));
c.package_key = key; c.msme.owners = pkg.owners; c.documents = documents; c.stage = 'screening'; c.status = 'SCREENING';
c.sla.screening = slaWindow('screening', RB);
${audit('c.msme.applicant', 'MSME', "'Formal application submitted: ' + documents.map((d) => d.name).join(', ')")}
return [{ json: { case: c } }];`, ['util']);

// ================================================================ AI SERVICE (shared by steps 2, 3, 8, 11)
code(N.buildAi, [col(6), AI], `${REF}
const c = structuredClone($json.case);
const isReport = c.stage === 'report_1' || c.stage === 'final';
const docs = isReport ? c.report_documents : c.documents;
const context = isReport ? 'Approved DTP objectives: ' + JSON.stringify((c.approved_dtp.objectives || []).map((o) => ({ id: o.id, text: o.text, date: o.date }))) : '';
const request = buildExtractionRequest(isReport ? 'report' : 'dtp', docs, RB, { context });
return [{ json: { case: c, claude_request: request } }];`, ['extraction'], 'Same AI service for DTP (steps 2–3) and reports (steps 8, 11)');

add(N.claude, 'n8n-nodes-base.httpRequest', 4.2, [col(7), AI], {
  method: 'POST', url: 'https://api.anthropic.com/v1/messages',
  authentication: 'predefinedCredentialType', nodeCredentialType: 'anthropicApi',
  sendHeaders: true,
  headerParameters: { parameters: [
    { name: 'anthropic-version', value: '2023-06-01' },
    { name: 'anthropic-workspace-id', value: 'wrkspc_01NFcKrdykRmULnWX5A1xN16' },
  ] },
  sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.claude_request) }}',
  options: { timeout: 120000 },
}, { onError: 'continueErrorOutput', retryOnFail: true, maxTries: 2, waitBetweenTries: 2000,
  credentials: { anthropicApi: { id: 'ANTHROPIC_CREDENTIAL_ID', name: 'Anthropic account' } },
  notes: 'Extraction only. Temperature 0. Errors → fallback extractor', notesInFlow: true });

code(N.parse, [col(8), AI - 120], `${REF}
const c = ${prev(N.buildAi)};
const isReport = c.stage === 'report_1' || c.stage === 'final';
const docs = isReport ? c.report_documents : c.documents;
let x; let mode = 'claude';
try { x = parseModelJson($json); x._extractor = 'claude:' + (RB.ai.model); }
catch (e) { x = isReport ? fallbackExtractReport(docs) : fallbackExtractDtp(docs); mode = 'fallback (unparseable AI output)'; }
const cc = verifyCitations(x, docs, RB.ai.min_field_confidence || 0.8);
const usage = $json.usage || null;
c.ai_runs.push({ at: new Date().toISOString(), stage: c.stage, mode, model: RB.ai.model, usage,
  cost_usd: estimateCostUsd(usage, RB), citations_checked: cc.checked, citations_verified: cc.verified, issues: cc.issues.length });
c.last_extraction = x; c.last_citation_check = cc;
${audit("'AI'", 'extraction', "'Bounded extraction (' + c.stage + ') · ' + mode + ' · citations ' + cc.verified + '/' + cc.checked + ' verified'")}
return [{ json: { case: c } }];`, ['extraction', 'fallback'], 'Anti-hallucination: every quote must exist in the source');

code(N.fallback, [col(8), AI + 120], `${REF}
const c = ${prev(N.buildAi)};
const isReport = c.stage === 'report_1' || c.stage === 'final';
const docs = isReport ? c.report_documents : c.documents;
const x = isReport ? fallbackExtractReport(docs) : fallbackExtractDtp(docs);
const cc = verifyCitations(x, docs, 0.8);
c.ai_runs.push({ at: new Date().toISOString(), stage: c.stage, mode: 'fallback (AI unavailable)', model: null, usage: null, cost_usd: 0,
  citations_checked: cc.checked, citations_verified: cc.verified, issues: cc.issues.length, error: String(($json.error && $json.error.message) || $json.message || 'AI call failed').slice(0, 200) });
c.flags.push({ code: 'AI_UNAVAILABLE', severity: 'info', status: 'open', message: 'Deterministic fallback extractor used for ' + c.stage });
c.last_extraction = x; c.last_citation_check = cc;
${audit("'system'", 'fallback', "'AI unavailable → deterministic fallback extractor (' + c.stage + ')'")}
return [{ json: { case: c } }];`, ['extraction', 'fallback'], 'Manual-fallback principle: the case never stops');

switchNode(N.route, [col(9), AI], "({ screening: 0, revision: 1, report_1: 2, final: 3 })[$json.case.stage]", 4);

// ================================================================ STEP 2 · SCREENING
code(N.screen, [col(10), ROW], `${REF}
const c = structuredClone($json.case);
c.extraction.dtp_v1 = c.last_extraction;
const s = runScreening({ eoi: c.eoi, documents: c.documents, extraction: c.last_extraction, citationCheck: c.last_citation_check, rulebook: RB });
c.steps.screening = s; c.flags.push(...s.flags); c.status = 'PANEL_REVIEW';
${audit("'system'", 'rules', "'R2 screening rules → preliminary ' + s.score.total + '/80 · ' + s.recommendation")}
const form_fields = [
  { fieldType: 'html', html: panelPage(c) },
  { fieldLabel: 'Panel decision', fieldType: 'radio', requiredField: true, fieldOptions: { values: [
    { option: 'Approve' }, { option: 'Not approve' }, { option: 'Request more information from MSME' }] } },
  { fieldLabel: 'Final score (0-80, set by the panel)', fieldType: 'number', requiredField: true, placeholder: String(s.score.total) },
  { fieldLabel: 'Reason / justification (mandatory)', fieldType: 'textarea', requiredField: true },
  { fieldLabel: 'Panel member name', requiredField: true },
];
return [{ json: { case: c, form_fields } }];`, ['util', 'intake', 'extraction', 'screening', 'pages'], 'Deterministic eligibility + /80 preliminary score. Never rejects.');

formPage(N.fPanel, [col(11), ROW], 'Evaluation panel · Preliminary screening result', 'Record panel decision');

code(N.recPanel, [col(12), ROW], `${REF}
const c = ${prev(N.screen)};
const decision = one($json['Panel decision']);
const finalScore = Number(one($json['Final score (0-80, set by the panel)']));
const prelim = c.steps.screening.score.total;
const recommended = c.steps.screening.recommendation === 'RECOMMEND_FOR_PANEL_APPROVAL';
const override = finalScore !== prelim || (decision === 'Approve') !== recommended;
c.decisions.push({ at: new Date().toISOString(), step: 2, by: one($json['Panel member name']), role: 'Evaluation panel', decision,
  final_score: finalScore, preliminary_score: prelim, override, reason: one($json['Reason / justification (mandatory)']) });
c.steps.screening.final_score = finalScore;
${audit("one($json['Panel member name'])", 'Evaluation panel', "'Decision: ' + decision + ' · final score ' + finalScore + (override ? ' (override of preliminary ' + prelim + ')' : '')")}
let route = 0; let page = '';
if (decision === 'Approve') { c.status = 'ADVISOR_REVIEW'; c.sla.advisor_review = slaWindow('advisor_review', RB); }
else if (decision === 'Not approve') { route = 1; c.status = 'NOT_APPROVED'; page = caseRecordPage(c); }
else { route = 2; c.status = 'INFORMATION_REQUESTED'; }
return [{ json: { case: c, route, page } }];`, ['util', 'pages']);

switchNode(N.swPanel, [col(13), ROW], '$json.route', 3);
formEnd(N.endNo, [col(14), LOW + 200], 'Case closed · not approved by the panel');

// ================================================================ STEP 3 · ADVISOR
code(N.advisor, [col(14), ROW], `${REF}
const c = structuredClone($json.case);
c.steps.advisor = c.steps.advisor || { comments: [], diff: [] };
if (!c.dtp_versions.length) {
  c.extraction.current = c.extraction.dtp_v1;
  c.dtp_versions.push(dtpVersionRecord({ caseId: c.case_id, version: 1, documents: c.documents, extraction: c.extraction.current, author: c.msme.applicant }));
}
const cap = c.steps.screening.tier.grant_cap;
c.steps.advisor.checks = advisorChecks({ extraction: c.extraction.current, rulebook: RB, approvedAmount: cap });
${audit("'system'", 'rules', "'R3 structured checks run on DTP v' + c.dtp_versions.length")}
const form_fields = [
  { fieldType: 'html', html: advisorPage(c) },
  { fieldLabel: 'Advisor decision', fieldType: 'radio', requiredField: true, fieldOptions: { values: [
    { option: 'Approve DTP and lock this version' }, { option: 'Request revision from MSME' }] } },
  { fieldLabel: 'Comments for the MSME (mandatory)', fieldType: 'textarea', requiredField: true },
  { fieldLabel: 'Advisor name', requiredField: true },
];
return [{ json: { case: c, form_fields } }];`, ['util', 'extraction', 'dtp', 'pages'], 'Rule / AI-suggestion / advisor-judgment checks');

formPage(N.fAdvisor, [col(15), ROW], 'SBDC Advisor · DTP review', 'Record advisor decision');

code(N.recAdvisor, [col(16), ROW], `${REF}
const c = ${prev(N.advisor)};
const decision = one($json['Advisor decision']);
const name = one($json['Advisor name']);
const comment = one($json['Comments for the MSME (mandatory)']);
const v = c.dtp_versions[c.dtp_versions.length - 1];
c.steps.advisor.comments.push({ version: v.version, by: name, text: comment, at: new Date().toISOString() });
c.decisions.push({ at: new Date().toISOString(), step: 3, by: name, role: 'SBDC advisor', decision, reason: comment, override: false });
let route = 1;
if (decision.startsWith('Approve')) {
  route = 0;
  const locked = lockApprovedVersion(v, name);
  c.dtp_versions[c.dtp_versions.length - 1] = locked;
  const x = c.extraction.current;
  const amount = (x.budget_lines || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);
  c.approved_dtp = { version: locked.version, hash: locked.hash, approved_by: name, approved_at: locked.approved_at,
    approved_amount: Math.min(amount, c.steps.screening.tier.grant_cap || amount), services_required: x.services_required,
    objectives: x.objectives, timeline_start: val(x.timeline_start), timeline_end: val(x.timeline_end) };
  c.status = 'MATCHMAKING'; c.sla.matchmaking = slaWindow('matchmaking', RB);
  ${audit('name', 'SBDC advisor', "'DTP v' + locked.version + ' approved and locked · hash ' + locked.hash.slice(0, 12)")}
} else {
  c.status = 'REVISION_REQUESTED';
  ${audit('name', 'SBDC advisor', "'Revision requested on DTP v' + v.version")}
}
return [{ json: { case: c, route } }];`, ['util', 'extraction', 'dtp']);

switchNode(N.swAdvisor, [col(17), ROW], '$json.route', 2);

code(N.prepRev, [col(17), LOW], `
const c = structuredClone($json.case);
const form_fields = [
  { fieldType: 'html', html: revisionPage(c) },
  { fieldLabel: 'Revised DTP', fieldType: 'radio', requiredField: true, fieldOptions: { values: [
    { option: 'Upload revised plan (demo: package v2)' }, { option: 'Resubmit the same version' }] } },
  { fieldLabel: 'Optional: paste full text instead of the demo file', fieldType: 'textarea' },
];
return [{ json: { case: c, form_fields } }];`, ['pages']);

formPage(N.fRev, [col(18), LOW], 'MSME · Revise your Digital Transformation Plan', 'Submit revised DTP');

code(N.asmRev, [col(19), LOW], `${REF}
const c = ${prev(N.prepRev)};
const pkg = REF.packages.packages[c.package_key];
const pastedRaw = String(one($json['Optional: paste full text instead of the demo file']) || '').trim();
const pasted = pastedRaw.length >= 200 ? pastedRaw : '';
let dtp = c.documents.find((d) => d.type === 'dtp');
if (pasted) dtp = { type: 'dtp', name: 'DTP_revised_pasted.txt', text: pasted.startsWith('[Page') ? pasted : '[Page 1]\\n' + pasted };
else if (String(one($json['Revised DTP'])).startsWith('Upload') && pkg.documents_v2) dtp = structuredClone(pkg.documents_v2[0]);
dtp.hash = sha256(dtp.text);
c.documents = c.documents.filter((d) => d.type !== 'dtp').concat([dtp]);
c.stage = 'revision';
${audit('c.msme.applicant', 'MSME', "'Revised DTP submitted: ' + dtp.name")}
return [{ json: { case: c } }];`, ['util']);

code(N.diff, [col(10), LOW], `${REF}
const c = structuredClone($json.case);
const prevX = c.extraction.current;
const nextX = c.last_extraction;
const diff = diffVersions(prevX, nextX, RB);
c.steps.advisor.diff = diff;
c.extraction.current = nextX;
c.dtp_versions.push(dtpVersionRecord({ caseId: c.case_id, version: c.dtp_versions.length + 1, documents: c.documents, extraction: nextX, author: c.msme.applicant }));
c.stage = 'advisor_review';
${audit("'system'", 'rules', "'New DTP version v' + c.dtp_versions.length + ' · ' + diff.length + ' section(s) changed'")}
return [{ json: { case: c } }];`, ['util', 'extraction', 'dtp'], 'Preserves every version + hash');

// ================================================================ STEP 4 · MATCHMAKING
code(N.prepPref, [col(18), ROW], `${REF}
const c = structuredClone($json.case);
const form_fields = [
  { fieldType: 'html', html: preferencesPage(c, REF.roster) },
  { fieldLabel: 'I confirm my interest in contracting a DSP for my approved plan', fieldType: 'checkbox', requiredField: true, fieldOptions: { values: [{ option: 'Yes, I confirm' }] } },
  { fieldLabel: 'Preferred providers (optional)', fieldType: 'checkbox', fieldOptions: { values: REF.roster.map((d) => ({ option: d.name })) } },
];
return [{ json: { case: c, form_fields } }];`, ['pages']);

formPage(N.fPref, [col(19), ROW], 'MSME · Expression of Interest for DSP matchmaking', 'Submit preferences');

code(N.match, [col(20), ROW], `${REF}
const c = ${prev(N.prepPref)};
const preferred = [].concat($json['Preferred providers (optional)'] || []);
c.preferences = { preferred_dsps: preferred };
const pkg = REF.packages.packages[c.package_key];
const m = runMatching({ approved: c.approved_dtp, roster: REF.roster, quotes: pkg.quotes, preferences: c.preferences, msme: c.msme, rulebook: RB });
c.steps.matching = m; c.flags.push(...m.flags);
${audit('c.msme.applicant', 'MSME', "'Matchmaking EOI confirmed · preferred: ' + (preferred.join(', ') || 'none')")}
${audit("'system'", 'rules', "'R4 matchmaking → shortlist ' + m.shortlist.map((s) => s.dsp_name + ' ' + s.total_score).join(' | ')")}
const options = m.shortlist.map((s) => ({ option: '#' + s.rank + ' ' + s.dsp_name })).concat([{ option: 'None: escalate to program manager' }]);
const form_fields = [
  { fieldType: 'html', html: matchPage(c) },
  { fieldLabel: 'Selected DSP', fieldType: 'radio', requiredField: true, fieldOptions: { values: options } },
  { fieldLabel: 'Reason (mandatory; explain if not #1)', fieldType: 'textarea', requiredField: true },
  { fieldLabel: 'Staff member name', requiredField: true },
];
return [{ json: { case: c, form_fields } }];`, ['matching', 'pages'], 'Hard filters → weighted score → explainable shortlist');

formPage(N.fMatch, [col(21), ROW], 'Program staff · Approve DSP match', 'Record match');

code(N.recMatch, [col(22), ROW], `${REF}
const c = ${prev(N.match)};
const sel = one($json['Selected DSP']);
const name = one($json['Staff member name']);
const m = c.steps.matching;
const chosen = m.shortlist.find((s) => sel.endsWith(s.dsp_name)) || null;
const override = !!chosen && chosen.rank !== 1;
c.decisions.push({ at: new Date().toISOString(), step: 4, by: name, role: 'Program staff', decision: sel, override, reason: one($json['Reason (mandatory; explain if not #1)']) });
if (chosen) {
  c.match = { dsp_id: chosen.dsp_id, dsp_name: chosen.dsp_name, quote_total: chosen.quote_total, rank: chosen.rank, approved_by: name };
  c.status = 'MATCHED';
} else { c.match = null; c.status = 'MATCH_ESCALATED'; }
${audit('name', 'Program staff', "'Match decision: ' + sel + (override ? ' (override of #1)' : '')")}
return [{ json: { case: c } }];`, []);

// ================================================================ STEPS 5–7 (out of scope)
noop(N.s5, [col(23), ROW], 'Out of scope: grant agreement signed by MSME');
noop(N.s6, [col(24), ROW], 'Out of scope: payment execution');
noop(N.s7, [col(25), ROW], 'Out of scope: MSME pays DSP, DSP implements');
code(N.sim, [col(26), ROW], `
const c = structuredClone($('${N.recMatch}').last().json.case);
c.disbursements = simulateOutOfScopeSteps(c);
c.status = 'IMPLEMENTATION';
c.sla.report_1_review = { step: 'report_1_review', sla_days: 14, started_at: new Date().toISOString(), due_at: new Date(Date.now() + 14 * 86400000).toISOString() };
c.audit.push({ at: new Date().toISOString(), actor: 'system', role: 'simulation', action: 'SIMULATED (demo): agreement ' + c.disbursements.agreement_signed + ', 1st tranche BZD ' + c.disbursements.first.amount });
return [{ json: { case: c } }];`, ['demo'], 'Demo only: sets agreement + tranche dates');

// ================================================================ STEP 8 · FIRST REPORT
code(N.prepR1, [col(27), ROW], `${REF}
const c = structuredClone($json.case);
const form_fields = [
  { fieldType: 'html', html: reportUploadPage(c, 'first') },
  { fieldLabel: 'First report package (demo: controlled test cases)', fieldType: 'radio', requiredField: true,
    fieldOptions: { values: Object.values(REF.packages.report_variants).map((v) => ({ option: v })) } },
];
return [{ json: { case: c, form_fields } }];`, ['pages']);

formPage(N.fR1, [col(28), ROW], 'MSME · First progress report', 'Submit first report');

code(N.asmR1, [col(29), ROW], `${REF}
const c = ${prev(N.prepR1)};
const label = one($json['First report package (demo: controlled test cases)']);
const variant = Object.keys(REF.packages.report_variants).find((k) => REF.packages.report_variants[k] === label) || 'clean';
c.report_documents = generateFirstReport(c, variant).map((d) => ({ ...d, hash: sha256(d.text) }));
c.report_variant = variant; c.stage = 'report_1'; c.status = 'REPORT_1_REVIEW';
${audit('c.msme.applicant', 'MSME', "'First report submitted (' + c.report_documents.length + ' documents)'")}
return [{ json: { case: c } }];`, ['util', 'demo']);

code(N.v8, [col(30), ROW], `${REF}
const c = structuredClone($json.case);
c.extraction.report_1 = c.last_extraction;
const v = validateFirstReport({ x: c.last_extraction, documents: c.report_documents, registry: REF.packages.registry, rulebook: RB,
  ctx: { case_id: c.case_id, approved_dsp_name: c.match.dsp_name, tranche_amount: c.disbursements.first.amount,
    agreement_signed: c.disbursements.agreement_signed, objectives: c.approved_dtp.objectives, report_due: c.disbursements.report_1_date } });
c.steps.report_1 = v;
${audit("'system'", 'rules', "'R8 validator → ' + v.preliminary + ' (' + v.counts.fail + ' fail, ' + v.counts.needs_review + ' review)'")}
const form_fields = [
  { fieldType: 'html', html: reportReviewPage(c, 'first') },
  { fieldLabel: 'Decision', fieldType: 'radio', requiredField: true, fieldOptions: { values: [
    { option: 'Accept report (unlocks the 2nd disbursement)' }, { option: 'Request correction from MSME' },
    { option: 'Reject' }, { option: 'Escalate to supervisor' }] } },
  { fieldLabel: 'Reason (mandatory)', fieldType: 'textarea', requiredField: true },
  { fieldLabel: 'Staff member name', requiredField: true },
];
return [{ json: { case: c, form_fields } }];`, ['extraction', 'reports', 'pages'], 'Payee, amounts, dates, duplicates, milestones vs approved DTP');

formPage(N.fR1Review, [col(31), ROW], 'Program staff · First report review', 'Record decision');

code(N.recR1, [col(32), ROW], `
const c = structuredClone($('${N.v8}').last().json.case);
const d = one($json['Decision']);
const name = one($json['Staff member name']);
const v = c.steps.report_1;
const override = d.startsWith('Accept') && v.preliminary !== 'ALL_CHECKS_PASSED';
c.decisions.push({ at: new Date().toISOString(), step: 8, by: name, role: 'Program staff', decision: d, override, reason: one($json['Reason (mandatory)']) });
c.audit.push({ at: new Date().toISOString(), actor: name, role: 'Program staff', action: 'First report: ' + d + (override ? ' (accepted with open discrepancies)' : '') });
let route = 0;
if (d.startsWith('Accept')) { c.status = 'REPORT_1_ACCEPTED'; c.open_flags_from_step8 = override ? v.counts.fail : 0; }
else if (d.startsWith('Request')) { route = 1; c.status = 'REPORT_1_CORRECTION'; }
else { route = 2; c.status = d.startsWith('Reject') ? 'REPORT_1_REJECTED' : 'ESCALATED'; }
const page = route === 2 ? caseRecordPage(c) : '';
return [{ json: { case: c, route, page } }];`, ['pages']);

switchNode(N.swR1, [col(33), ROW], '$json.route', 3);
formEnd(N.endHold, [col(34), LOW + 200], 'Case on hold · second disbursement NOT released');

// ================================================================ STEPS 9–11
noop(N.s9, [col(34), ROW], 'Out of scope: payment execution');
noop(N.s10, [col(35), ROW], 'Out of scope: DSP completes implementation');

code(N.prepFinal, [col(36), ROW], `${REF}
const c = structuredClone($json.case);
c.status = 'FINAL_REPORT'; c.sla.final_review = { step: 'final_review', sla_days: 14, started_at: new Date().toISOString(), due_at: new Date(Date.now() + 14 * 86400000).toISOString() };
const form_fields = [
  { fieldType: 'html', html: reportUploadPage(c, 'final') },
  { fieldLabel: 'Final report package (demo)', fieldType: 'radio', requiredField: true,
    fieldOptions: { values: Object.values(REF.packages.final_variants).map((v) => ({ option: v })) } },
];
return [{ json: { case: c, form_fields } }];`, ['pages']);

formPage(N.fFinal, [col(37), ROW], 'MSME · Final report', 'Submit final report');

code(N.asmFinal, [col(38), ROW], `${REF}
const c = ${prev(N.prepFinal)};
const label = one($json['Final report package (demo)']);
const variant = Object.keys(REF.packages.final_variants).find((k) => REF.packages.final_variants[k] === label) || 'complete';
c.report_documents = generateFinalReport(c, variant).map((d) => ({ ...d, hash: sha256(d.text) }));
c.stage = 'final';
${audit('c.msme.applicant', 'MSME', "'Final report submitted'")}
return [{ json: { case: c } }];`, ['util', 'demo']);

code(N.v11, [col(39), ROW], `${REF}
const c = structuredClone($json.case);
c.extraction.final = c.last_extraction;
const v = validateFinalReport({ x: c.last_extraction, rulebook: RB, ctx: { approved_amount: c.approved_dtp.approved_amount,
  first_payment: c.disbursements.first.amount, approved_dsp_name: c.match.dsp_name, objectives: c.approved_dtp.objectives,
  open_flags_from_step8: c.open_flags_from_step8 || 0 } });
c.steps.final_report = v;
${audit("'system'", 'rules', "'R11 validator → ' + v.preliminary")}
const form_fields = [
  { fieldType: 'html', html: reportReviewPage(c, 'final') },
  { fieldLabel: 'Decision', fieldType: 'radio', requiredField: true, fieldOptions: { values: [
    { option: 'Accept final report and close the case' }, { option: 'Request correction from MSME' }] } },
  { fieldLabel: 'Reason (mandatory)', fieldType: 'textarea', requiredField: true },
  { fieldLabel: 'Staff member name', requiredField: true },
];
return [{ json: { case: c, form_fields } }];`, ['extraction', 'reports', 'pages']);

formPage(N.fClose, [col(40), ROW], 'Program staff · Close-out', 'Record decision');

code(N.recClose, [col(41), ROW], `
const c = structuredClone($('${N.v11}').last().json.case);
const d = one($json['Decision']);
const name = one($json['Staff member name']);
c.decisions.push({ at: new Date().toISOString(), step: 11, by: name, role: 'Program staff', decision: d,
  override: d.startsWith('Accept') && c.steps.final_report.preliminary !== 'ALL_CHECKS_PASSED', reason: one($json['Reason (mandatory)']) });
c.audit.push({ at: new Date().toISOString(), actor: name, role: 'Program staff', action: 'Close-out: ' + d });
const route = d.startsWith('Accept') ? 0 : 1;
if (!route) c.status = 'CLOSED';
return [{ json: { case: c, route } }];`, []);

switchNode(N.swClose, [col(42), ROW], '$json.route', 2);

code(N.record, [col(43), ROW], `
const c = structuredClone($json.case);
c.closed_at = new Date().toISOString();
c.audit.push({ at: c.closed_at, actor: 'system', role: 'records', action: 'Case record archived (retention policy applies)' });
return [{ json: { case: c, page: caseRecordPage(c) } }];`, ['pages'], 'Single case record: decisions, overrides, audit, AI cost');

formEnd(N.end, [col(44), ROW], 'DIBED · Case record');

// ------------------------------------------------------------ wiring
const chain = (...names) => names.slice(1).forEach((n, i) => link(names[i], n));
chain(N.trigger, N.load, N.intake, N.prepApp, N.fApp, N.asmApp, N.buildAi, N.claude);
link(N.claude, N.parse, 0);
link(N.claude, N.fallback, 1);
link(N.parse, N.route);
link(N.fallback, N.route);
link(N.route, N.screen, 0);
link(N.route, N.diff, 1);
link(N.route, N.v8, 2);
link(N.route, N.v11, 3);
chain(N.screen, N.fPanel, N.recPanel, N.swPanel);
link(N.swPanel, N.advisor, 0);
link(N.swPanel, N.endNo, 1);
link(N.swPanel, N.prepApp, 2);
chain(N.advisor, N.fAdvisor, N.recAdvisor, N.swAdvisor);
link(N.swAdvisor, N.prepPref, 0);
link(N.swAdvisor, N.prepRev, 1);
chain(N.prepRev, N.fRev, N.asmRev, N.buildAi);
link(N.diff, N.advisor);
chain(N.prepPref, N.fPref, N.match, N.fMatch, N.recMatch, N.s5, N.s6, N.s7, N.sim, N.prepR1, N.fR1, N.asmR1, N.buildAi);
chain(N.v8, N.fR1Review, N.recR1, N.swR1);
link(N.swR1, N.s9, 0);
link(N.swR1, N.prepR1, 1);
link(N.swR1, N.endHold, 2);
chain(N.s9, N.s10, N.prepFinal, N.fFinal, N.asmFinal, N.buildAi);
chain(N.v11, N.fClose, N.recClose, N.swClose);
link(N.swClose, N.record, 0);
link(N.swClose, N.prepFinal, 1);
link(N.record, N.end);

// ------------------------------------------------------------ sticky notes (the "raw boxes" legend)
function sticky(content, position, width, height, color) {
  add(`Note ${idSeq + 1}`, 'n8n-nodes-base.stickyNote', 1, position, { content, width, height, color });
}
const top = ROW - 260;
sticky('## STEP 1 · Intake & pre-screening\n**👤 MSME** fills the BELTRAIDE EOI form → **📏 rules** check fields, district, sector, tier thresholds, program window → MSME submits formal application (DTP).', [col(0) - 40, top], col(6) - 20, 520, 7);
sticky('## STEP 2 · Screening & evaluation\n**🤖 AI** extracts with citations · **📏 rules** compute eligibility + preliminary /80 · **👤 Panel** decides (never auto-reject).', [col(10) - 40, top], col(4) + 20, 520, 4);
sticky('## STEP 3 · Advisor review & DTP versions\nStructured checks · revision loop with MSME · every version hashed · **approved version locked** as reference for steps 4, 8, 11.', [col(14) - 40, top], col(4) - 10, 1060, 5);
sticky('## STEP 4 · EOI & DSP matchmaking\nHard filters → **30/30/10/10/20** weighted score → explainable shortlist → **👤 Staff** approve (reason if not #1).', [col(18) - 10, top], col(5) - 10, 520, 6);
sticky('## STEPS 5–7 · OUT OF SCOPE\nAgreement, 1st disbursement, implementation. Payments are never executed by this system.', [col(23) - 40, top], col(4) - 10, 520, 1);
sticky('## STEP 8 · First report review\n**🤖 AI** reads receipt, invoice, contract, evidence · **📏 validator** R8.01–R8.10 · **👤 Staff** accept → unlocks 2nd disbursement.', [col(27) - 40, top], col(7) + 30, 520, 3);
sticky('## STEPS 9–11 · Final report & close-out\n2nd disbursement + final implementation out of scope · **📏 R11** validator · **👤 Staff** close the case · full case record + audit trail.', [col(34) - 10, top], col(11) - 20, 520, 2);
sticky('## 🤖 SHARED AI SERVICE (bounded)\nClaude only **extracts values + exact quotes + page**. Every quote is verified against the source. If the AI fails or is unavailable → **deterministic fallback** so the case never stops. Temperature 0, pinned model, versioned prompts.', [col(6) - 40, AI - 300], col(4) + 40, 560, 6);
sticky('# DIBED supervised workflow\n**Legend:** 👤 human decision · 📏 deterministic rule (rulebook ' + rulebook.version + ') · 🤖 AI extraction · 🛡️ guardrail · 🛟 fallback · ⏸️ out of scope\n\nOne execution = one MSME case. Open **Executions** to see the raw input/output of every box.', [col(0) - 40, top - 300], col(10), 260, 1);

const workflow = {
  name: 'DIBED · Supervised MSME grant workflow (steps 1→11)',
  nodes, connections, settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' },
  pinData: {}, meta: { templateCredsSetupCompleted: true },
};
mkdirSync(join(ROOT, 'n8n'), { recursive: true });
writeFileSync(join(ROOT, 'n8n', 'dibed-case-workflow.json'), JSON.stringify(workflow, null, 2));
console.log(`n8n/dibed-case-workflow.json · ${nodes.length} nodes`);
