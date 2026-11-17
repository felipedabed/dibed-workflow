// Live check of the AI layer: sends a demo DTP to Claude, verifies every citation, runs the screening rules.
// Usage: ANTHROPIC_API_KEY=... [ANTHROPIC_WORKSPACE_ID=...] node scripts/test-ai.mjs [A|B|C]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadBundle, readJson, ROOT } from './bundle.mjs';

const envFile = join(ROOT, '.env');
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const B = loadBundle();
const rulebook = readJson('rulebook/rulebook.json');
const pkg = readJson('data/packages.json').packages[process.argv[2] || 'A'];
const req = B.buildExtractionRequest('dtp', pkg.documents_v1, rulebook);
const headers = { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
if (process.env.ANTHROPIC_WORKSPACE_ID) headers['anthropic-workspace-id'] = process.env.ANTHROPIC_WORKSPACE_ID;
const t0 = Date.now();
const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(req) });
const json = await res.json();
if (!res.ok) { console.error(json); process.exit(1); }
const x = B.parseModelJson(json);
const cc = B.verifyCitations(x, pkg.documents_v1, 0.8);
const eoi = { businessName: pkg.business_name, registered: 'Yes', categoryCode: null, digitalTools: ['Business website', 'Social media or WhatsApp Business'], exportExperience: 'Never exported but interested in starting' };
const s = B.runScreening({ eoi, documents: pkg.documents_v1, extraction: x, citationCheck: cc, rulebook });
console.log(`model ${req.model} · ${Date.now() - t0} ms · tokens in/out ${json.usage.input_tokens}/${json.usage.output_tokens} · est. USD ${B.estimateCostUsd(json.usage, rulebook).toFixed(4)}`);
console.log(`citations verified ${cc.verified}/${cc.checked}; issues: ${JSON.stringify(cc.issues)}`);
console.log(`preliminary score ${s.score.total}/80 · ${s.recommendation} · flags: ${s.flags.map((f) => f.code).join(', ') || 'none'}`);
console.log('AI-suggested:', JSON.stringify(x.suggested_scores));
