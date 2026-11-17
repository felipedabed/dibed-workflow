// Loads the plain-JS modules in src/ as one bundle. The same source files are inlined into the
// n8n Code nodes by scripts/build-workflow.mjs, so tests and the workflow run identical code.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const MODULES = {
  util: 'src/lib/util.js',
  intake: 'src/rules/intake.js',
  extraction: 'src/ai/extraction.js',
  fallback: 'src/ai/fallback.js',
  screening: 'src/rules/screening.js',
  dtp: 'src/rules/dtp.js',
  matching: 'src/rules/matching.js',
  reports: 'src/rules/reports.js',
  pages: 'src/render/pages.js',
  demo: 'src/demo/reports.js',
};

export function source(keys) {
  return keys.map((k) => readFileSync(join(ROOT, MODULES[k]), 'utf8').replace(/^export /gm, '')).join('\n\n');
}

export function exportedNames(keys) {
  const names = [];
  for (const k of keys) {
    const text = readFileSync(join(ROOT, MODULES[k]), 'utf8');
    for (const m of text.matchAll(/^export (?:function|const) (\w+)/gm)) names.push(m[1]);
  }
  return names;
}

export function loadBundle(keys = Object.keys(MODULES)) {
  // eslint-disable-next-line no-new-func
  return new Function(`${source(keys)}\nreturn { ${exportedNames(keys).join(', ')} };`)();
}

export function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}
