# Demo guide (English) — how to present the DIBED workflow

Total: ~10 minutes. Two screens: **(1)** the n8n canvas (the "raw boxes"), **(2)** the live forms a case goes through.
Tip: open both before the call — `https://dibed.app.n8n.cloud/workflow/<id>` and `https://dibed.app.n8n.cloud/form/dibed-eoi`.

---

## 0 · Opening line (20 s)

> "I built a reference implementation of the workflow in the ToR, so we can discuss something concrete.
> It follows one principle: **AI extracts and compares, with citations; rules calculate, from versioned configuration;
> and humans decide, with a logged reason.** All data you'll see is synthetic."

## 1 · The canvas — read it left to right (2 min)

Point at the coloured sections:

1. **Step 1, intake.** "This form replicates BELTRAIDE's 2027 Expression of Interest field by field. The first rule
   box applies the official micro/small/medium thresholds printed on that form, checks the district and sector,
   and checks whether a 5–6-month case still fits before the program ends in February 2028 — that's the time constraint."
2. **Shared AI service (bottom).** "There's only one AI box, reused by steps 2, 3, 8 and 11. Claude returns every
   value with the exact quote and page. The next box verifies that each quote really exists in the document —
   if not, the field is flagged and its confidence drops. If the AI is down or over budget, this fallback box takes
   over so the case never stops. That's the manual-fallback requirement."
3. **Step 2.** "Deterministic rules: completeness, registration, tier, grant cap, budget arithmetic, and a
   *preliminary* score out of 80. It never rejects and never sets the final score — the panel does, here."
4. **Step 3.** "The advisor gets structured checks. Each check says whether a rule, an AI suggestion or the
   advisor's judgment resolves it. If the advisor requests changes, the MSME uploads a new version, we diff it,
   hash it, and when the advisor approves, that version is locked. It's the reference for steps 4, 8 and 11."
5. **Step 4.** "Hard filters first — active DSP, offers the category, has capacity, quote within budget —
   then the 30/30/10/10/20 weighting. Staff see the breakdown for every provider; if they don't pick #1, the reason
   is mandatory."
6. **Steps 5–7 and 9–10** are grey: "out of scope; payments are never executed by this system."
7. **Step 8 and 11.** "A validator: payee must be the approved DSP, amounts and dates must match, no invoice reused
   from another case, due milestones must have evidence. Acceptance is what unlocks the second disbursement."

## 2 · Live case (5 min) — package B is the best story

1. Open the form, fill the EOI as **Hopkins Eco Lodge**, Stann Creek, Tourism, *Medium*.
2. Pick **package B**. → Panel page: score ~50 = **BORDERLINE**, flags `BUDGET_SUM_MISMATCH`,
   `OBJECTIVE_NOT_MEASURABLE`. Show the evidence table: *"every number has its quote and page."* Approve with a score
   and a reason → "that's an override, and it's recorded."
3. Advisor page: failed checks (objective without date, budget). **Request revision** → MSME uploads v2 →
   advisor sees the diff and the new hash → **Approve and lock**.
4. Matchmaking: Placencia Booking Systems flagged **POSSIBLE_CONFLICT_OF_INTEREST** (shares a director with the
   MSME); Toledo Tech is **suspended**. Pick the right one with a reason.
5. First report: choose **"Payment went to a different provider"** → validator shows ❌ R8.02 with the quote from
   the receipt. **Request correction** → upload the clean report → all green → **Accept**.
6. Final report → close-out → **case record**: every decision, who, when, why, overrides, AI runs and cost.
7. Back in n8n → **Executions** → open the run: "this is the raw input and output of every box — that is the audit trail."

## 3 · Closing (30 s)

> "In the real assignment this logic goes inside BELTRAIDE's approved platform, reusing the screening agent they
> already piloted. n8n here is a transparent reference so the rules can be reviewed box by box. The thresholds, the /80
> split and the weight dimensions are placeholders in a versioned rulebook — the first deliverable, inception,
> is exactly to confirm them with your team."

---

## Likely questions — short answers

**Why not let the AI score directly?**
"Scores and thresholds are arithmetic and policy — they must be reproducible and auditable. The AI only suggests the
two qualitative criteria, with a quote, and the panel confirms. Same inputs + same rulebook version = same result."

**How do you prevent hallucinations?**
"Three layers: the model may only return values with a verbatim quote; the system verifies each quote against the
source text; and any calculation is done by rules, not by the model. In my test run, 62 of 62 citations were verified."

**What if the AI provider is down or too expensive?**
"The fallback extractor keeps the case moving, flagged as degraded. There's a monthly cost cap and an alert at 80%
in the rulebook. Measured cost: about four US cents per document extraction."

**Data protection?**
"Role-based access per gate, synthetic or de-identified data in testing, secrets in the encrypted credential store,
document hashes for integrity, and no identifiable data processed without BELTRAIDE's written authorization."

**Why n8n if they have a platform already?**
"It's not a proposal to replace their platform. It shows the logic transparently. The rules are plain JavaScript and a
JSON rulebook — portable to whatever BELTRAIDE uses."

**How would you test it for acceptance?**
"Controlled cases per rule — like the five report variants here — plus de-identified historical cases, comparing
expected vs. actual flags. For step 8, if there are no historical reports yet, a live-validation gate: the first real
reports are reviewed both manually and by the system until they agree."

**What would you need from BELTRAIDE in week 1?**
"Access to the platform and the pilot agent, the evaluation manual, the DSP roster format, sample (de-identified)
DTPs and quotations, and two named counterparts."

**The ToR says 30 working days but the table adds to 56 — which one?**
"I'd like to confirm that, because it changes the depth of each milestone."

## Useful English phrases

* "Let me show you the raw boxes behind that."
* "This is a preliminary result — the decision stays with the panel."
* "That value comes from page two, here's the exact quote."
* "That's a placeholder; I'd confirm it with your team during inception."
* "If I didn't understand the question correctly, could you rephrase it?"
