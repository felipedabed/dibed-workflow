// STEP 1 (pre-screening) — normalizes the BELTRAIDE "MSME Digital Transformation and Export Readiness
// Expression of Interest 2027" form and applies deterministic intake rules.
// The tier thresholds are the official ones printed on the form (see rulebook.tiers).

export const EOI_FIELDS = {
  email: 'Email',
  applicantName: 'Applicant Name',
  businessName: 'Business Name',
  contactNumber: 'Contact Number',
  gender: 'Gender',
  age: 'Age',
  address: 'Address (Street/City/Town/Village/District)',
  sector: 'Which sector of the economy does your business belong to?',
  businessDescription: 'Describe your business venture (product/service line, customers)',
  registered: 'Is your business registered?',
  category: 'Which category best describes your business?',
  supportInterest: 'What support is your business interested in receiving?',
  digitalTools: 'Which digital tools does your business currently use?',
  exportExperience: "Which statement best describes your business's export experience?",
  socialLinks: 'Please include social media link(s) for your business',
  improvementGoals: 'Briefly describe what you would like to improve in your business',
  acknowledgment: 'I understand this form records interest only (not an official grant application)',
  contactPermission: 'May BELTRAIDE contact you about relevant opportunities?',
  freeAdvising: 'Would you like to receive additional free business advising through BELTRAIDE?',
};

export const REQUIRED_EOI_KEYS = [
  'email', 'applicantName', 'businessName', 'contactNumber', 'address', 'sector',
  'businessDescription', 'registered', 'category', 'supportInterest', 'digitalTools',
  'exportExperience', 'improvementGoals', 'acknowledgment',
];

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null || v === '') return [];
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

export function normalizeEoi(form) {
  const get = (key) => form[EOI_FIELDS[key]];
  const eoi = {};
  const multi = ['digitalTools', 'acknowledgment'];
  for (const key of Object.keys(EOI_FIELDS)) {
    const v = get(key) ?? null;
    eoi[key] = !multi.includes(key) && Array.isArray(v) ? (v[0] ?? null) : v;
  }
  eoi.digitalTools = asArray(eoi.digitalTools);
  eoi.acknowledgment = asArray(eoi.acknowledgment).length > 0 || eoi.acknowledgment === true;
  // Category arrives as the long label; keep a short code too.
  const cat = String(eoi.category || '').toLowerCase();
  eoi.categoryCode = cat.startsWith('micro') ? 'micro' : cat.startsWith('small') ? 'small'
    : cat.startsWith('medium') ? 'medium' : cat.startsWith('unsure') ? 'unsure' : null;
  return eoi;
}

export function detectDistrict(address, districts) {
  const a = String(address || '').toLowerCase();
  // Longest names first so "Belize" (district) does not shadow "Orange Walk" etc.
  const sorted = [...districts].sort((x, y) => y.length - x.length);
  return sorted.find((d) => a.includes(d.toLowerCase())) || null;
}

export function classifyTier(numbers, rulebook) {
  // numbers: { employees, annual_sales, capital_investment, space_m2 }
  // Returns the tier implied by EACH criterion, the proposed tier and whether criteria diverge.
  const { order } = rulebook.tiers;
  const criteria = [
    ['employees', 'employees_below'],
    ['annual_sales', 'annual_sales_below'],
    ['capital_investment', 'capital_below'],
    ['space_m2', 'space_m2_below'],
  ];
  const perCriterion = {};
  for (const [field, limitKey] of criteria) {
    const v = numbers[field];
    if (v === null || v === undefined || v === '') continue;
    let found = null;
    for (const tier of order) {
      const limit = rulebook.tiers[tier][limitKey];
      if (limit === null || limit === undefined) continue; // e.g. micro has no space limit
      if (Number(v) < limit) { found = tier; break; }
    }
    perCriterion[field] = found || 'above_medium';
  }
  const values = Object.values(perCriterion);
  if (values.length === 0) return { per_criterion: {}, proposed: null, diverges: false, exceeds_medium: false };
  const exceeds = values.includes('above_medium');
  const counts = {};
  values.forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
  // Majority; ties resolved to the larger tier (staff confirms — never automatic).
  const rank = (t) => (t === 'above_medium' ? 99 : order.indexOf(t));
  const proposed = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || rank(b) - rank(a))[0];
  return { per_criterion: perCriterion, proposed, diverges: new Set(values).size > 1, exceeds_medium: exceeds };
}

export function runIntake(eoi, rulebook) {
  const flags = [];
  const checks = [];
  const missing = REQUIRED_EOI_KEYS.filter((k) => eoi[k] === null || eoi[k] === '' ||
    (Array.isArray(eoi[k]) && eoi[k].length === 0) || eoi[k] === false);
  checks.push({ id: 'R1.01', rule: 'All required EOI fields answered', result: missing.length ? 'fail' : 'pass', detail: missing });
  if (missing.length) flags.push({ code: 'EOI_INCOMPLETE', severity: 'blocking', message: `Missing: ${missing.join(', ')}`, status: 'open' });

  const district = detectDistrict(eoi.address, rulebook.program.belize_districts);
  checks.push({ id: 'R1.02', rule: 'Address located in a Belize district', result: district ? 'pass' : 'needs_review', detail: district });
  if (!district) flags.push({ code: 'LOCATION_UNVERIFIED', severity: 'warning', message: 'No Belize district found in the address', status: 'open' });

  const sectorOk = rulebook.program.eligible_sectors.includes(eoi.sector);
  checks.push({ id: 'R1.03', rule: 'Sector is one of the program sectors', result: sectorOk ? 'pass' : 'needs_review', detail: eoi.sector });
  if (!sectorOk) flags.push({ code: 'SECTOR_NOT_LISTED', severity: 'warning', message: `Sector "${eoi.sector}" not in the list`, status: 'open' });

  const registered = String(eoi.registered).toLowerCase() === 'yes';
  checks.push({ id: 'R1.04', rule: 'Business declares it is registered', result: registered ? 'pass' : 'needs_review', detail: eoi.registered });
  if (!registered) flags.push({ code: 'NOT_REGISTERED', severity: 'blocking', message: 'Business declares it is not registered: staff to advise on registration before applying', status: 'open' });

  const tools = eoi.digitalTools.filter((t) => t !== 'None currently');
  checks.push({ id: 'R1.05', rule: 'Digital maturity indicator (number of digital tools)', result: 'info', detail: tools.length });

  if (eoi.categoryCode === 'unsure') {
    flags.push({ code: 'CATEGORY_UNSURE', severity: 'info', message: 'Applicant needs help determining the category; tier will be computed from DTP figures', status: 'open' });
  }
  if (eoi.categoryCode === 'medium' && tools.length < rulebook.tiers.medium.min_digital_tools_for_maturity) {
    flags.push({ code: 'MATURITY_CHECK', severity: 'warning', message: `Medium tier requires advanced digital maturity; only ${tools.length} digital tool(s) declared`, status: 'open' });
  }

  // Time constraint: will a case that starts today finish before the program ends?
  const projectedEnd = new Date(Date.now() + rulebook.program.expected_cycle_days * 86400000);
  const programEnd = new Date(rulebook.program.end_date);
  const fitsWindow = projectedEnd <= programEnd;
  checks.push({ id: 'R1.06', rule: 'Expected 5–6 month cycle fits before program end', result: fitsWindow ? 'pass' : 'needs_review',
    detail: { projected_close: projectedEnd.toISOString().slice(0, 10), program_end: rulebook.program.end_date } });
  if (!fitsWindow) flags.push({ code: 'PROGRAM_WINDOW_RISK', severity: 'warning', message: 'Case may not close before the program end date', status: 'open' });

  const grantCap = eoi.categoryCode && rulebook.tiers[eoi.categoryCode] ? rulebook.tiers[eoi.categoryCode].grant_cap : null;
  return {
    district, digital_tools_count: tools.length, declared_tier: eoi.categoryCode, indicative_grant_cap: grantCap,
    checks, flags,
    outcome: flags.some((f) => f.severity === 'blocking') ? 'NEEDS_STAFF_FOLLOW_UP' : 'INVITE_TO_FORMAL_APPLICATION',
  };
}
