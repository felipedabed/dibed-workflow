// Deploys the workflow to any n8n instance (n8n Cloud or self-hosted) through the n8n public API.
// Usage:
//   N8N_URL=https://<instance>.app.n8n.cloud N8N_API_KEY=... ANTHROPIC_API_KEY=... \
//   [ANTHROPIC_WORKSPACE_ID=wrkspc_...] npm run deploy
// Creates/updates the "Anthropic account" credential, creates/updates the workflow and activates it.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './bundle.mjs';

// Optional .env (never committed)
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const { N8N_URL, N8N_API_KEY, ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID } = process.env;
if (!N8N_URL || !N8N_API_KEY) { console.error('Set N8N_URL and N8N_API_KEY'); process.exit(1); }

const api = async (method, path, body) => {
  const res = await fetch(`${N8N_URL.replace(/\/$/, '')}/api/v1${path}`, {
    method, headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
};

const wf = JSON.parse(readFileSync(join(ROOT, 'n8n', 'dibed-case-workflow.json'), 'utf8'));

// 1. Credential (secrets live in n8n's encrypted credential store, never in the workflow JSON)
let credId = null;
if (ANTHROPIC_API_KEY) {
  const cred = await api('POST', '/credentials', { name: 'Anthropic account (DIBED)', type: 'anthropicApi', data: { apiKey: ANTHROPIC_API_KEY, url: 'https://api.anthropic.com', header: false } });
  credId = cred.id;
  console.log('credential created', credId);
} else {
  console.warn('ANTHROPIC_API_KEY not set: the workflow will run with the deterministic fallback extractor');
}

for (const node of wf.nodes) {
  if (node.type !== 'n8n-nodes-base.httpRequest') continue;
  if (credId) node.credentials = { anthropicApi: { id: credId, name: 'Anthropic account (DIBED)' } };
  else delete node.credentials;
  const hp = node.parameters.headerParameters.parameters;
  const ws = hp.find((h) => h.name === 'anthropic-workspace-id');
  if (ANTHROPIC_WORKSPACE_ID) ws.value = ANTHROPIC_WORKSPACE_ID;
  else node.parameters.headerParameters.parameters = hp.filter((h) => h.name !== 'anthropic-workspace-id');
}

// 2. Workflow (create or update by name)
const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' } };
const existing = (await api('GET', '/workflows?limit=250')).data.find((w) => w.name === wf.name);
let id;
if (existing) {
  try { await api('POST', `/workflows/${existing.id}/deactivate`); } catch { /* not active */ }
  id = (await api('PUT', `/workflows/${existing.id}`, body)).id;
  console.log('workflow updated', id);
} else {
  id = (await api('POST', '/workflows', body)).id;
  console.log('workflow created', id);
}
await api('POST', `/workflows/${id}/activate`);
console.log(`active ✔  EOI form: ${N8N_URL.replace(/\/$/, '')}/form/dibed-eoi`);
console.log(`editor:     ${N8N_URL.replace(/\/$/, '')}/workflow/${id}`);
