# DIBED · Supervised AI workflow for MSME digital-transformation grants

Reference implementation built by **Guren AI** for the IDB / BELTRAIDE consultancy *"DIBED AI Workflow and Capacity"*
(IDB Loan BL-L1039). It runs one MSME case end to end — **Expression of Interest → screening → advisor review →
DSP matchmaking → first report → final report → close-out** — with AI used only for bounded extraction,
deterministic rules for every calculation, and a human decision at every gate.

> **AI extracts and compares (with citations). Rules calculate (versioned config). Humans decide (logged).**

All data in this repository is **synthetic** (fictional Belizean MSMEs and providers). No real applicant data.

---

## What it does, step by step

| ToR step | Who / what | In this repo |
|---|---|---|
| **1 · Intake** (pre-screening) | 👤 MSME fills the BELTRAIDE EOI 2027 form · 📏 rules | `src/rules/intake.js` — required fields, Belize district, sector, **official tier thresholds** from the EOI form, program-window check (time constraint) |
| **2 · Screening & evaluation** | 🤖 extraction · 📏 rules · 👤 panel | `src/ai/extraction.js` (cited extraction + quote verification), `src/rules/screening.js` (eligibility, grant cap, budget arithmetic, **preliminary /80**, borderline band). Never rejects, never sets the final score |
| **3 · Advisor review & DTP versions** | 📏 structured checks · 👤 advisor ⇄ MSME | `src/rules/dtp.js` — checks resolved by rule / AI suggestion / advisor judgment, version diff, **SHA-256 hash**, approved version **locked** |
| **4 · EOI & DSP matchmaking** | 📏 filters + weighted score · 👤 staff | `src/rules/matching.js` — hard filters, **30/30/10/10/20**, oversubscription, conflict of interest, explainable shortlist; reason required if staff do not pick #1 |
| 5–7 | out of scope | simulated dates only (`src/demo/reports.js`) |
| **8 · First report review** | 🤖 extraction · 📏 validator · 👤 staff | `src/rules/reports.js` R8.01–R8.10 — payee = approved DSP, tranche share, dates, invoice = payment, duplicates across cases, milestones vs approved DTP. Acceptance unlocks the 2nd disbursement; **the system never pays** |
| 9–10 | out of scope | — |
| **11 · Final report & close-out** | 📏 validator · 👤 staff | R11.01–R11.04, full case record + audit trail |

Every gate records **who decided, when, the reason, and whether it overrode the system's preliminary result**.

## Architecture

```
 BELTRAIDE EOI form ─► Intake rules ─► Formal application (DTP + documents)
                                              │
                         ┌────────────────────▼─────────────────────┐
                         │  Shared AI service (bounded extraction)   │
                         │  Claude → JSON with value + quote + page  │
                         │  🛡️ every quote verified in the source    │
                         │  🛟 deterministic fallback if AI fails    │
                         └────────────────────┬─────────────────────┘
                                              ▼
   📏 Rules engine (rulebook.json, versioned) ─► 👤 Human gate (form) ─► 📝 decision + audit
                                              │
                 Single case record: documents (hashed), DTP versions, extractions, rules applied,
                 flags, decisions, overrides, SLA per step, AI runs + cost
```

* **Orchestration:** n8n (`n8n/dibed-case-workflow.json`, 61 nodes). One execution = one case. Human gates are n8n
  Form pages; every box's raw input/output is visible in **Executions** — the audit trail is inspectable.
* **Rules:** plain JavaScript in `src/`, unit-tested (`tests/`). The build script inlines the *same* source into the
  n8n Code nodes, so what is tested is what runs.
* **Configuration:** `rulebook/rulebook.json` — tier thresholds, grant caps, /80 criteria, weights, SLAs, AI model,
  cost caps. Changing a rule = editing config + approval, not code.
* **AI:** Anthropic Claude, pinned model, versioned prompt (sampling parameters are fixed by the model). Extraction only. Secrets live in the n8n
  credential store, never in the workflow file.

## Run it

```bash
npm test                 # 15 tests: rules, citations, matchmaking, report validators (no network needed)
npm run build            # regenerate n8n/dibed-case-workflow.json from src/ + data/ + rulebook/
node scripts/test-ai.mjs A   # live Claude extraction on demo package A (needs ANTHROPIC_API_KEY)

# Deploy to n8n Cloud or self-hosted n8n (creates the credential, imports and activates the workflow)
N8N_URL=https://<instance>.app.n8n.cloud N8N_API_KEY=... ANTHROPIC_API_KEY=... npm run deploy
```

Then open `<N8N_URL>/form/dibed-eoi` and walk a case through every gate. See `docs/demo-guide.md`.

## Demo data (controlled test cases)

| Package | Profile | What it exercises |
|---|---|---|
| **A · Maya's Bakery Ltd.** | small, complete | clean path · recommended · oversubscribed DSP excluded |
| **B · Hopkins Eco Lodge** | medium, borderline | budget mismatch · objective without date → revision loop v1→v2 · **conflict of interest** with a DSP · suspended DSP |
| **C · Corozal Agro Supplies** | incomplete | missing financial statement · above grant cap · tier criteria diverge · uncategorized budget line |

Report variants (step 8): clean · payee mismatch · amount mismatch · reused invoice · missing milestone evidence.

## What is illustrative vs. real

* **Real:** EOI form fields and tier thresholds (BELTRAIDE EOI 2027), grant caps and the 30/30/10/10/20 weighting (ToR).
* **Illustrative, to confirm at inception:** /80 criteria split, pass threshold, dimension names for the weights,
  oversubscription tie-break, tranche split, SLA days. All live in `rulebook.json`.
* In the real assignment this logic is implemented **inside BELTRAIDE's approved platform**, reusing the existing
  screening agent; n8n here is a transparent reference implementation, not a parallel platform proposal.

## Repository map

```
rulebook/rulebook.json      versioned rules and thresholds
src/lib/util.js             hashing, SLA windows, helpers
src/rules/*.js              intake, screening, dtp, matching, reports
src/ai/extraction.js        prompt, schema, JSON parsing, citation verification, cost estimate
src/ai/fallback.js          deterministic extractor (manual-fallback principle)
src/render/pages.js         HTML shown to each human at each gate
src/demo/reports.js         synthetic report generator (controlled defects)
data/                       synthetic DSP roster and MSME packages
n8n/dibed-case-workflow.json  generated workflow
scripts/                    build, deploy, live AI test
tests/                      node:test suite
docs/demo-guide.md          how to present it
```
