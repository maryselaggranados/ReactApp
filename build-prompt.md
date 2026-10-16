# Escalation Router — Teacher and district escalations, routed by your rules

This document is the complete build specification for a single-page React + Tailwind web app with a small local server, built with Claude Code. Follow every section exactly. Do not improvise sections that are not specified. Business rules are deterministic code, never model output. The AI decides only the one low-stakes call named in the AI Decision section, and its answer never overrides a business rule. Confirm completion when the app renders with all listed components, and tell the user the exact commands to run it.

## App Name
Escalation Router — Teacher and district escalations, routed by your rules

## Core Functionality
A Customer Success coordinator pastes one teacher or district item (a support ticket, focus-group notes, or teacher-training notes). The AI reads it and proposes four fields: issue type, whether student data is involved, teachers affected, and days to district renewal; it decides the issue type on its own from a fixed list. Deterministic checks verify that every number it proposes is in the text and that every field is valid; on a failure the AI retries once, then writes a short question to the person who submitted the item, then a person takes over. The coordinator confirms the fields, and the deterministic business rules route the item: privacy officer, Sev1 page to engineering on-call, coordinator review, engineering queue, product backlog, or support, and copy the account manager when renewal is near. The AI drafts a short internal routing note, which the rules check before anyone sees it. A person confirms every privacy case, and the Head of Customer Success confirms every Sev1 page in parallel. Workflow pattern: Operator. Autonomy: low by design: code sets the order of the steps; AI reads, asks, and drafts; your rules check and decide; a person approves.

## Tech Stack Preferences
- Vite + React (TypeScript, functional components), Tailwind CSS, Google Fonts via CDN. One page; the main view logic may live in `src/App.tsx` with the rules in `src/rules.ts`.
- Business rules implemented as pure TypeScript functions in `src/rules.ts` (no model calls inside rules).
- The Python rules module in the Appendix runs in the browser through Pyodide (`<script src="https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js">` in `index.html`), loaded once at start without blocking the page. It makes every decision. The TypeScript copy of the rules runs beside it as a cross-check and as the fallback while Python loads.
- AI calls go ONLY through a small local server (`server/index.js`, Node + Express, port 8787, proxied from Vite at `/api`). The server reads `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` (default `claude-haiku-5-5`) from a `.env` file using `dotenv`, calls the Claude Messages API with `@anthropic-ai/sdk`, and exposes one endpoint: `POST /api/ai` with body `{ call: "read" | "question" | "draft", system: string, message: string }`, returning `{ json }` (the model's reply parsed as JSON) or `{ error, status }`. The browser never sees the key. Add `.env` to `.gitignore` and create `.env.example` with `ANTHROPIC_API_KEY=` and `ANTHROPIC_MODEL=claude-haiku-5-5`. Never write a real key into any file.
- The server asks the model to reply with only a JSON object matching the schema named in the request, strips any code fences, and parses it; on a parse failure it returns `{ error: "Bad JSON", status: 502 }`.
- One script runs both: `npm run dev` starts Vite and the server together (use `concurrently`).
- If an AI call fails, show "AI unavailable:" with the status code, and keep every rule result; on a 429, say "AI limit reached; your rules still work." Wrap every AI call in a 30-second timeout (an AbortController); on a timeout show "AI unavailable: timeout. Your rules still work.", re-enable the button, and keep every rule result. While a call runs, show the seconds elapsed beside its status line. If the key is missing, the server returns status 401 and the app says "AI unavailable: add ANTHROPIC_API_KEY to .env. Your rules still work."
- No auth, no localStorage; synthetic data only.

## Features List
- Four views, state-toggled: Overview (default), App, Rules Module, and Executive Readout
- App view: 4-field input form: Issue type, Student data involved, Teachers affected, Days to district renewal
- Deterministic rules engine with a "Why this result" rule trace
- 12 clickable test scenarios (links, not a dropdown), a Self-Test button, and a Stress Test button
- "How this request ran": a six-step trace at the top of the output panel, AI and rules alternating, each step with its decider badge and Pass or Fail
- Rules Module view, headed "Determinism + Probabilism": "Same request, 3 runs" first (the AI's words vary, the checks and the route do not), the check loop, "Your business rules, in plain English" for the rule owner, then the expert rules as code (the Python source), the parity table, and the Stress Test
- Executive Readout view: the recommendation, live ROI and payback, what has to be true, a live Self-Test badge, the quality bar, and the ask
- Human checkpoint panel for rules that route to a person
- "Paste the request" box with a "Read request" button: the AI proposes the fields, the rules check them, one retry, then a question to the requester and "Read again", then a person; a check-loop log
- AI decision badge with an Override control, and an AI decision log
- ROI panel with Conservative / Base / Stretch toggle
- Action buttons: Copy Result, Print or Save as PDF, Reset

## UI/UX Design
A professional business tool for ed tech customer success, in the Ops console look below. No chatbot styling, no marketing page. Mobile-responsive at 768px. Every visual choice follows the sections below; where they are silent, choose the plainer option.

## Audience
The Overview and Executive Readout are read by the Head of Customer Success. Write them in plain business language: no implementation terms (Pyodide, Python, JavaScript, TypeScript, JSON, schema, engine, persona, system prompt, API, server). The App and Rules Module views may use them.

## Look
- **Ops console:** base font 14px; table rows 36px; card padding 16px; gaps 16px; neutral grays, one dark primary, status colors only for results.

## Layout System
- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48. Use no other values.
- Content max-width 72rem, centered; text blocks max 44rem.
- Radius: 6px cards, 4px inputs and buttons. One shadow only: `0 1px 2px rgba(0,0,0,.06)`.
- Never put a card inside a card. Separate sections with a 1px divider in `text-muted` at 20% opacity, not with more cards.
- The "How this request ran" strip: six equal steps in one row when the output panel is 40rem or wider, two rows of three below that, one column on mobile. Each step: the decider badge, a one-line step name at 13px weight 600, and the status word; steps 12px padding, 8px gaps. It sits flush in the output panel (no card inside the card).
- The "Same request, 3 runs" table spans the full content width: a 3px left border in the decider's color on each cell, no filled cell backgrounds; drafts cut to 20 words with an ellipsis; the headline above it at 1.75rem weight 700.
- Numbers use tabular figures (`font-variant-numeric: tabular-nums`) and are right-aligned in tables.

## Decider Colors
One color per decider, used the same way everywhere: **your rules** = `primary`, **AI** = `accent`, **a person** = `secondary`. Every decider badge uses its color as text on a 10% tint of the same color, with 4px radius. The Overview's three steps each have a 3px top border in their decider's color. Status colors (`rule-approve`, `rule-review`, `rule-escalate`) are only for results, never for deciders. Check outcomes: "Pass" in `text-muted` weight 600; "Fail", "Not in the request", "Held for a person", and "Sent to a person" in `rule-escalate` weight 600; "Asked the requester" in `accent` weight 600; "Skipped" in `text-muted` italic. No green for Pass.

## Labels
Use only the headings and labels this spec names, in sentence case. No eyebrow labels, small caps, taglines, or headings of your own.

## States
- Before the first submit, the output panel shows "Pick an example or enter a request."
- A loading indicator appears only while an AI call runs.
- Errors appear in `rule-escalate`, one line, naming the field.

## Never
Gradients, emoji, decorative icons in place of data, a centered marketing hero, testimonial-style copy, more than one accent color, text wider than 44rem, a heading that repeats the app name.

## Data Logic
(R) When the user pastes a request and clicks "Read request", call `POST /api/ai` with `call: "read"`, the AI Reads Instruction below as `system`, and the pasted text as `message`; the reply follows the AI Reads Schema. Fill the form fields with the proposed values, each marked "Proposed by AI · check" with its confidence shown as "N/10" (the schema's integer; clamp anything else into 1 to 10). Then run validation only, not the routing rules. Before validation, run two evidence checks in code: (E1) every number the AI proposes (Teachers affected, Days to district renewal) must appear in the pasted text (strip $ and commas; 80K is 80000), or the field fails as "Not in the request"; (E2) a field the AI returns as null or lists in `missing` stays blank, never 0 (never convert null or an empty string to a number). A field that fails E1 or E2 fails validation. If validation fails, call the AI once more, sending the validation errors. If it still fails, ask the requester (Q): call `POST /api/ai` with `call: "question"`, the Requester Question Instruction below as `system`, and its schema; send the request text and the failing fields' labels exactly as the input panel names them (never code keys such as `renewal_days`). Run the Question Checks; if one fails, call once more with the failed check; if it still fails, mark the failing fields "Needs a person" and stop. Otherwise show the question under "Question for the requester", badged "Drafted by AI · checked by your rules", with Copy, and show "Paste the reply" (2 rows, with a link that pastes the sample reply) and "Read again", which runs this step on the request plus the reply as a new read. The user reviews or edits the fields and clicks the submit button; only then do the rules decide, and the fields show "Confirmed by you". Blank means failing: after the read and its retry, any field that is blank (null, listed in `missing`, or cleared by E1 or E2) fails validation even if no other check flagged it. Each such field shows "Missing · needs the requester", step 1 of the strip shows "Asked the requester", (Q) runs at once without another click, and the submit button stays disabled until every failing field has a value or the user clicks "Send to a person" (which submits, so the missing-field rule decides). Never label a blank field "Confirmed by you"; show a blank value as "missing", never "empty" or 0. Log every read: time, and "passed first time", "passed after one retry", "asked the requester", or "sent to a person".
On submit: (0) The issue type comes from the AI read in step (R); it is the AI-DECIDES call. Accept it only if it is one of how_to, bug, feature, outage, other and its confidence is at least 7; otherwise set the field to `needs_review`. Pass it to both engines as the typed field `issue_type`, so the rules read it like any other input and R8 catches `needs_review`. A value the coordinator picks by hand or through Override is used as entered. Self-Test, Stress Test, and the scenarios supply this field directly and never call the AI. (1) validate inputs ONCE, as the Validation section says, turning raw form text into typed values; invalid or missing data fires the stop rule (R1) and stops. Every rule reads only the typed values, never the raw form text. (2) Run every deterministic rule, record each one that fired, and resolve conflicts as the Deterministic Rules section says. (3) Call `POST /api/ai` with `call: "draft"`, the Persona / System Instruction below as `system`, and the Output Schema below; send the validated field values, the result, the rule IDs that fired, and their explanations as the message. The AI output may summarize, extract, or draft. It may never change a rule result. An AI-DECIDES value counts only as the input field in step (0). If the AI call fails, show "Draft unavailable" and keep the rule result. (3b) Run the Draft Checks on the draft. If one fails, call the AI once more with the failed checks; if it still fails, show the draft with "Held for a person:" and the failed checks. Log every draft: time, and "passed first time", "passed after one retry", or "sent to a person". (4) Render "How this request ran", the decision, the rule trace, any AI draft with its check results, and the next step and owner.

---

# Detailed Specifications

## Design Tokens (exact hex codes)
- `bg-page`: `#F5F6F8`
- `bg-card`: `#FFFFFF`
- `primary`: `#1F2A44`
- `secondary`: `#6B4E9B`
- `accent`: `#0F7B8A`
- `text`: `#1A1D23`
- `text-muted`: `#5B6270`
- `rule-approve`: `#2E7D4F`
- `rule-review`: `#B7791F`
- `rule-escalate`: `#C0392B`

## Typography
- Headings: Inter via Google Fonts. H1 weight 700 size 1.75rem. H2 weight 600 size 1.25rem. H3 weight 600 size 1rem.
- Body: Inter via Google Fonts. Weight 400, size 14px, line-height 1.5.
- Section labels: 0.75rem, weight 600, `text-muted`, sentence case.
- Monospace (IBM Plex Mono via Google Fonts) only for rule IDs, test IDs, and code.

## Page Identity
- Page title (`<title>`): Escalation Router
- Favicon: capital E in the `primary` color via inline SVG data URI

## Layout: Views
State-toggled between `overview` (default), `app`, `rules` (the Rules Module view), and `readout` (the Executive Readout view).

### Overview (default), exactly this, top to bottom
1. H1: "Escalations take 20 minutes each and 15% get misrouted"
2. One sentence under it: "Customer Success coordinators spend 20 minutes triaging each of about 150 teacher and district escalations a week."
3. A KPI strip: 4 tiles in one row (2 × 2 on mobile), no borders between them heavier than the divider. Each tile: the number at 1.75rem weight 700, a 0.8rem label under it, and the number's label (ASSUMED) in `text-muted`: 2,400 hours a year · $132,000 a year · 15% misrouted · Conservative payback (read live from the ROI Panel).
4. "How each case is decided": one horizontal row of three steps joined by arrows (stacked on mobile), not cards. Step 1, **Probabilistic: AI.** "AI reads each ticket or set of notes, proposes the fields, names the issue type, and drafts the routing note. Its wording varies from run to run." Step 2, **Deterministic: your rules.** "Your rules check everything the AI produces and decide where each item goes and who is copied. Same input, same answer, every time." Step 3, **Accountable: a person.** "The coordinator confirms the fields; the privacy officer reviews every student-data case; the Head of Customer Success confirms every Sev1 page."
5. One line under the row: "Your expert rules, extracted into code: 11 rules, 12 tests, and a check on every AI step." It links to "Your business rules, in plain English" in the Rules Module view.
6. Button "Open the tool" (`primary`) switches state to `app`.

### App View
- Top bar (every view): a `primary` background with white text, 56px tall: Escalation Router left; "Overview", "App", "Rules Module", and "Readout" links right; the current view underlined in white, not boxed.
- Two columns at 1024px and wider: the input panel left (max-width 28rem), the output panel right; one column below that.
- "Paste the request" box (4 rows) with the sample request links under it and the "Read request" button (`primary`), above the fields.
- Input panel (`bg-card`), one field per line, label left of the input at 1024px and wider, above it below: "Issue type" (choice: how_to, bug, feature, outage, other, needs_review) · "Student data involved" (choice: yes, no, unsure) · "Teachers affected" (whole number, 1 to 10,000) · "Days to district renewal" (whole number, 0 to 1,095). Choice fields are selects with a blank first option.
- Do not use HTML `required` attributes or browser validation. Blank or invalid values must reach the stop rule (R1).
- Whole-number fields: `type="text"`, `inputMode="numeric"`, and keep only the characters 0–9 as the user types. Scenario links, Self-Test, and Stress Test set values directly, so malformed test values reach validation unchanged.
- Submit button: "Route this item", `primary`, full width of the input panel. Self-Test and Stress Test are secondary buttons (outlined), side by side under the example links.
- Under the button: "Try an example:" followed by the test scenarios as separate clickable links separated by middots. Each fills all fields and submits.
- Order in the App view, top to bottom: paste box, input panel, example links, Self-Test button, output panel, action buttons, human checkpoint, AI decision log, ROI panel.

## Deterministic Rules (implement exactly)
Thresholds: Sev1 at 3 or more teachers affected; account manager copied at 90 or fewer days to renewal.

| ID | Rule (IF ... THEN ...) | Output |
|---|---|---|
| R1 | IF any field is missing or invalid THEN stop | Coordinator review |
| R2 | IF student_data = yes OR student_data = unsure THEN route to the privacy officer, same day | Privacy officer |
| R3 | IF issue_type = outage AND teachers_affected >= 3 THEN Sev1 | Sev1: page engineering on-call |
| R4 | IF issue_type = outage AND teachers_affected < 3 THEN engineering queue | Engineering queue |
| R5 | IF issue_type = bug THEN engineering queue | Engineering queue |
| R6 | IF issue_type = feature THEN product backlog | Product backlog |
| R7 | IF issue_type = how_to THEN support with help article | Support |
| R8 | IF issue_type = needs_review THEN coordinator review | Coordinator review |
| R9 | IF renewal_days <= 90 THEN also copy the account manager | Adds "Account manager" to cc; does not choose a route |
| R10 | IF R3 fired THEN page engineering on-call now; the Head of Customer Success confirms in parallel | Adds the Sev1 page and checkpoint, even when another route wins |
| R11 | ELSE (no routing rule fired) | Coordinator review |

Each rule is a pure function returning `{result, ruleId, explanation}`. R1 runs first; when it fires, no other rule runs and rules_fired is ["R1"]. Routing rules are R2 through R8; R11 fires only when none of them fired. R9 and R10 never choose the route. Conflict resolution: the most restrictive result wins, with every possible result ranked Privacy officer > Sev1: page engineering on-call > Coordinator review > Engineering queue > Product backlog > Support. Record every rule that fired, not only the winning one, and list the rule IDs in ascending numeric order (R2 before R10). Next step by result: Privacy officer: Privacy officer reviews the same day and decides whether families or the district must be told. Sev1: page engineering on-call: Engineering on-call is paged now; the Head of Customer Success confirms in parallel. Coordinator review: A CS coordinator reads the item and routes it by hand. Engineering queue: Engineering triages in the next daily standup. Product backlog: Product adds it to the backlog and tags the district. Support: Support replies with the matching help article within one business day. When R10 fired and the result is not Sev1, append " Engineering on-call is also paged now (R10)." to the next step. When R9 fired, add "Copy: Account manager".

## Test Scenarios (render as clickable links; never a dropdown)
Each scenario stores a value for every input field and its expected result. The scenarios store the field values, so Self-Test never calls the AI.
Sample requests, written in the user's own words (links that paste the text into "Paste the request"; not part of Self-Test): **Clean request** (Training notes, Lincoln Middle: 3 teachers couldn't log in during this morning's session; the whole site was down. No student data involved. District renewal is 200 days out.; expected Sev1: page engineering on-call as test T2) · **Missing Days to district renewal** (Focus group, Westfield USD: 2 teachers asked for a way to export reading logs to parents. No student records involved.). **Sample reply** (a link under "Paste the reply" that pastes it): Westfield renews in 45 days.
1. **T1 How-to question**: issue_type how_to, student_data no, teachers_affected 1, renewal_days 200. Expected **Support** via R7.
2. **T2 Outage at threshold**: issue_type outage, student_data no, teachers_affected 3, renewal_days 200. Expected **Sev1: page engineering on-call** via R3, R10.
3. **T3 Privacy filed as a feature (worst case)**: issue_type feature, student_data yes, teachers_affected 1, renewal_days 400. Expected **Privacy officer** via R2, R6.
4. **T4 Feature near renewal**: issue_type feature, student_data no, teachers_affected 2, renewal_days 45. Expected **Product backlog** via R6, R9.
5. **T5 AI unsure of type**: issue_type needs_review, student_data no, teachers_affected 1, renewal_days 200. Expected **Coordinator review** via R8.
6. **T6 Small outage**: issue_type outage, student_data no, teachers_affected 2, renewal_days 200. Expected **Engineering queue** via R4.
7. **T7 Bug**: issue_type bug, student_data no, teachers_affected 5, renewal_days 300. Expected **Engineering queue** via R5.
8. **T8 Other**: issue_type other, student_data no, teachers_affected 1, renewal_days 200. Expected **Coordinator review** via R11.
9. **T9 Test-day outage, privacy unsure**: issue_type outage, student_data unsure, teachers_affected 4, renewal_days 30. Expected **Privacy officer** via R2, R3, R9, R10.
10. **T10 Bug with student data**: issue_type bug, student_data yes, teachers_affected 2, renewal_days 200. Expected **Privacy officer** via R2, R5.
11. **M1 Malformed teachers**: issue_type bug, student_data no, teachers_affected "1e3", renewal_days 200. Expected **Coordinator review** via R1.
12. **M2 Malformed renewal**: issue_type bug, student_data no, teachers_affected 5, renewal_days "12.5". Expected **Coordinator review** via R1.

## Validation (read each field once)
- One function turns the raw form values into typed values, or reports which field is invalid. Rules never read raw form text, and nothing else parses a field.
- Whole-number fields: trim, then accept only if the text matches `^[0-9]+$` and the number is inside its range (Teachers affected 1 to 10000; Days to district renewal 0 to 1095); convert with `Number()`. Never use `parseInt` or `parseFloat`.
- Choice fields: trim, then accept only the exact listed options. Issue type is an AI-DECIDES field: its options are its allowed outcomes plus `needs_review`; `needs_review` is valid input (it passes validation and reaches R8), and only values outside the list fail validation.
- Pass the Python module the raw trimmed text for each field (not a pre-converted number), so it validates independently.

## Draft Checks (deterministic code, never the model)
One pure TypeScript function `checkDraft(summary, typedValues, result)` returns a Pass or Fail, with a reason, for each:
- D1 Route named: `summary` starts with "Route: " and the result label exactly as the rules returned it.
- D2 Numbers match: every number in `summary` is a typed field value or one of these thresholds: 3, 90. Find numbers with `/(?<![A-Za-z0-9.])\$?\d[\d,]*(\.\d+)?[kK]?(?![A-Za-z0-9])/g`; remove "$" and ","; multiply by 1000 when it ends in k or K. Rule IDs such as "R3" are not numbers.
- D3 No decision language: after removing the result label, `summary` has none of these whole words, any case: approve, approved, approving, reject, rejected, deny, denied, guaranteed.
- D4 Length: `summary` is 60 words or fewer.

## Question Checks
One pure function `checkQuestion(question, failingLabels)`: Q1 the question contains every failing field's label (case-insensitive); Q2 it has none of the D3 words; Q3 it is 40 words or fewer.

## Self-Test
A "Run Self-Test" button runs every scenario's field values through both engines without calling the AI, compares both the result and the rule IDs, and shows "Python X / Y · JavaScript X / Y · Engines agree X / Y", listing expected vs. actual for any failure. Also show the Python module's own `self_test()` count.

## Stress Test
A "Run Stress Test" button generates 500 inputs from a fixed seed (so every run is the same): each field mostly valid, about 3% blank, and whole-number fields 30% of the time drawn from this list: "", "0", "1", "99", "100", "101", "1000000", "1000001", "-5", "1e3", "0x64", "100.0", "12.5", " 100 ", "007", "abc", "+100", "1,000". It runs every input through both engines and shows "500 inputs · D disagreements", listing the first 10 with both results.

## Python Rules Module
- Store the Appendix's Python source verbatim as a string constant `RULES_PY` (in `src/rulesPy.ts`), keeping its indentation exactly. Write it as a `String.raw` template literal so every backslash survives, and escape any backtick or `${` inside it. Never edit the Python, not even its regular expressions. The same source is also in `rules.py` in the project folder: copy it from there exactly.
- Self-Test counts "Engines agree" only for scenarios both engines actually ran. If Python raises an error, show "Python did not run:" with the error's last line, and count Python as 0. Run it with Pyodide once at start.
- Call `decide` with a dict of the raw trimmed field values; convert results with `.toJs({ dict_converter: Object.fromEntries })`.
- On every submit run both engines. Once Python has loaded, render Python's result, rule IDs, explanations, and next step, with the badge "Decided by: Python rules module · JavaScript agrees". If they disagree, show "Engine mismatch" in `rule-escalate`, show both results, route to Coordinator review, and show its human checkpoint (not the checkpoint of either engine's result).
- Until Python loads, or if it fails, use the TypeScript engine with the badge "Decided by: JavaScript rules (Python loading)".
- Never show a result for a run that did not happen: if an engine is unavailable, say so.

## Rules Module view
A third view, linked from the top bar and from "How this was decided" under every result. Its H1 is "Determinism + Probabilism", in this order:
- First, **"Same request, 3 runs"**: the two sample request links above a "Run this request 3 times" button (`primary`), with "Uses up to 12 AI calls" in `text-muted` beside it. Each run is the whole pipeline (the AI read, the field check, the AI's issue-type call, the route, the AI draft, the draft check). One table, a row per run: Run · AI read (the field values) · Field check · Route and rule IDs · AI draft (first 20 words) · Draft check. A run whose fields go to the requester or a person shows "Waiting for the requester" for the route and draft. Above it, in large type, computed from the runs: "3 runs · N different drafts · M route(s) · checks passed P / Q". Caption: "AI reads and writes, and decides only the issue type, which a person can reverse, and its words vary from run to run. Your rules check every AI output and make every decision, so the route never varies. A person approves the high-stakes calls. Every miss becomes a test."
- Under the caption, in `text-muted`: "Autonomy: low by design. Code sets the order of the steps; AI reads, asks, and drafts; your rules check and decide; a person approves. Raise autonomy only as the checks earn trust."
- One line: "Rules alone, run 25 times" (a secondary button that calls `determinism_check`) and its result, "25 runs · 1 distinct result".
- "The check loop": a row of counts from the read log (passed first time · passed after one retry · asked the requester · sent to a person) and one from the draft log (passed first time · passed after one retry · sent to a person), and the last 10 entries.
- **"Your business rules, in plain English"** (for the person who owns the rules; no code), with the id `rules-readout`: the line "Rules version 1.0 · owned by the Customer Success operations lead · 11 rules · 12 tests"; the thresholds as a short list; one table with a row per rule, copied word for word from the Deterministic Rules table (never paraphrased): ID · Rule (IF … THEN …) · Result · Tested by (the names of the scenarios whose expected rule IDs include it, computed from the scenarios; "Not tested" in `rule-escalate` if none); then the conflict line and the next step for each result. Under it, in `text-muted`: "To change a rule, tell the Copilot its ID and the change. It updates the rule, its tests, and the code together, and Self-Test checks them." A secondary "Print the rules" button prints only this section on one page.
- "Your expert rules, extracted into code": the Python source with line numbers, Copy, and Download rules.py.
- "Parity": the Stress Test and a per-scenario table (Scenario, Expected, Python, JavaScript, Match).

## Executive Readout view
A fourth view for a leader, linked from the top bar, that prints on one page:
- The problem statement and "Recommendation: Set in the business case."
- Conservative and Base annual value and payback months, read live from the ROI Panel, with the payback colored as the ROI Panel colors it.
- What has to be true: the adoption needed for a 12-month payback at the Conservative minutes saved, computed live as ((B + R ÷ 4) ÷ 9 × 12 + R) ÷ (N × weeks × minutes saved ÷ 60 × C), shown as a percentage beside Conservative's 16%.
- Quality bar: Explainable (the rule trace); Tested (a live Self-Test badge with the count computed from the scenarios: green only when every scenario passes in both engines, red when any fails); Reviewed ("not yet" in the first build; the Readout update sets it); Priced (the Conservative payback).
- Top risks: Set in the business case. The ask: Set in the business case. Show these placeholder words exactly and nothing after them: never write a recommendation, risks, or an ask of your own. The words arrive later, in a Readout update from the business case.
- No claims beyond this spec.

## Human Checkpoints
When a rule routes to a person (Privacy officer, Sev1, Coordinator review), show the badge "A person decides" and "Needs approval:" followed by the role the rule names ("Needs approval: Privacy officer", "Needs approval: Head of Customer Success (on-call already paged)", "Needs approval: CS coordinator") with Approve and Return buttons (simulated) and the rule trace that caused it. Above the buttons, show "Check before you approve:" with the rule that fired and the input value that decided it. When R10 fired under a Privacy officer result, show both checkpoints.

## AI Decision
Show the AI's issue-type call with the badge "Decided by AI · low-stakes · reversible", its confidence, and an "Override" dropdown of the allowed outcomes (how_to, bug, feature, outage, other) that re-runs the rules with the chosen value and marks the result "Overridden by a person." Keep a session log table (time, inputs, AI decision, confidence, overridden or not) under the output, so a person can sample it.

## Loading State
Display "Reading the request...", "Writing a question...", "Drafting the routing note...", or "Checking the draft..." in `accent` with three pulsing dots, only while that step runs. The rules run when the coordinator confirms the fields; if the AI read fails, the issue type stays blank or is set to needs_review, and the case goes to a person. The rule result appears immediately on submit and does not wait for the draft.

## Output Panel (`bg-card`)
Each part carries a small badge naming its decider, so the reader sees who did what:
1. **How this request ran**: six steps, each with a 3px top border in its decider's color and one status word: (1) AI read the request and named the issue type (with its confidence), or "Entered by the coordinator" (badged "a person") when nothing was read; (2) Rules checked the fields: Pass, Passed after one retry, Asked the requester, or Sent to a person; (3) Rules decided the route: the result and rule IDs; (4) AI drafted the note; (5) Rules checked the draft: Pass with D1–D4, or the failed check; (6) A person decides: the approver, or "No person needed". A step that did not run shows "Skipped".
2. **Decision**: large, colored by status token (Support → rule-approve · Product backlog → rule-approve · Engineering queue → rule-review · Coordinator review → rule-review · Sev1: page engineering on-call → rule-escalate · Privacy officer → rule-escalate), with the badge "Decided by your rules". Show "Copy: Account manager" under it when R9 fired.
3. **Why this result**: the rule IDs that fired, in plain English, with the input values that triggered them. After any routing rule whose route did not win, add "(route not used: [winning rule ID] wins)".
4. **AI draft**: with the badge "Drafted by AI · wording varies", and under it "Checked by your rules:" with D1–D4 and Pass or Fail for each. If the fields came from an AI read, show above the decision "Fields read by AI, checked by your rules, confirmed by you"; show "Check this draft" when `needs_review` is true.
5. **Next step and owner**, from the "Next step by result" line.
6. **Footer** (monospace): `RULES v1.0 · 11 RULES · SYNTHETIC DATA · PROTOTYPE`

## ROI Panel
Inputs (pre-filled): instances per week 150, minutes each today 20, loaded cost per hour 55, working weeks 48, one-time cost 1650, annual run cost 1200. Toggle: Conservative (16% adoption, 8 minutes saved) / Base (50%, 10 minutes saved) / Stretch (84%, 12 minutes saved); the toggle sets adoption and minutes saved together, and both stay editable. Outputs: annual hours saved = N × weeks × minutes saved ÷ 60 × adoption; annual value = hours × C; payback months = 3 + (B + R ÷ 4) ÷ ((annual value − R) ÷ 12), or "no payback" if that monthly net is zero or less. Label all defaults "assumption; edit me". Color the payback months by value: 12 or fewer `rule-approve`, 13–24 `rule-review`, over 24 or no payback `rule-escalate`. If loaded cost per hour is 1 (hours only), show values in hours, not dollars.

## Action Buttons (below the output)
- "Copy Result"
- "Print or Save as PDF" (calls `window.print()`)
- "Reset"

---

# AI Configuration (AI steps only)

## Persona / System Instruction
Use everything in this Persona section (the paragraph, Tone, Vocabulary, and Never) verbatim as the `system` prompt for the draft call. Do not summarize or paraphrase.

You are the routing-note writer for an ed tech Customer Success team. Your narrow job is to write a short internal note that tells the receiving team what a teacher or district reported and where the business rules sent it. You never decide outcomes that belong to business rules; those are decided by business rules and by people.

### Tone
Plain, calm, and specific, like a coordinator handing off to a colleague.

### Vocabulary to use
teacher, district, school, classroom, routed to, reported, affected, next step, privacy officer, on-call

### Vocabulary to avoid
approved, rejected, denied, guaranteed, urgent!!!, ASAP, unfortunately, we apologize

### Never
Decide outcomes that belong to business rules; decide anything outside your allowed outcomes; invent facts, names, or numbers; fill a missing field with a guess (return `needs_review: true` instead).

## AI Reads Instruction
Use as the `system` prompt for the read call: "You read one teacher or district escalation (a support ticket, focus-group notes, or teacher-training notes) and propose values for these fields: issue_type (one of how_to, bug, feature, outage, other; how_to is a question about using the product, bug is something broken for a few users, feature is a request for something new, outage is people unable to use the product at all, other is anything else), student_data (yes if the text mentions student records, grades, names, or information shown to the wrong person; unsure if it might; no only if clearly not), teachers_affected (whole number), and renewal_days (whole number of days until the district renews). Copy numbers exactly as written; never guess a missing value, and never use 0 for an unknown: leave it null and list it in `missing`. You decide the issue type; when you are not confident, give it a low confidence. You propose; the business rules check your values and a person confirms them. Reply with only a JSON object."
AI Reads Schema: `fields` (one key per input field, value or null), `confidence` (one integer 1 to 10 per field), `missing` (array of field names).

## Requester Question Instruction
Use as the `system` prompt for the question call: "You write one short, polite question to the person who submitted this teacher or district item, asking for the details it is missing. Name each missing field exactly as given. Do not guess values, do not repeat numbers from the request, and never say whether it will be approved. Reply with only a JSON object."
Schema: `question` (string, 40 words or fewer).

## Output Schema
One schema per AI call: this one is for the draft call; the read call uses the AI Reads Schema above (its issue_type is the AI-DECIDES call). Return ONLY valid JSON matching:
- `summary`: string, 60 words or fewer. It starts with "Route: " and the result label exactly as given, uses no numbers except the field values and thresholds it was sent, and never uses the D3 words.
- `needs_review`: boolean
- `confidence`: integer 1 to 10

---

# Mobile Responsive
At 768px viewport: inputs stack vertically, tables scroll horizontally, the ROI panel stacks.

---

# Build Rules
- Follow the Audience, Look, Layout System, Labels, and Never sections exactly; they decide how the app looks.
- The AI reads step only proposes values: the evidence checks, validation, and the user's confirmation come before any rule decides.
- Every AI output passes a deterministic check before anything uses it: the fields (E1, E2, and validation), the question (Q1–Q3), and the draft (D1–D4). Code sets the order of the steps; the AI never chooses them.
- Implement every rule in the Deterministic Rules table exactly; never delegate a business rule to the model. The AI decides only the call in the AI Decision section, and its value enters the rules as an input field.
- Read each input field once, in the Validation step; never use `parseInt` or `parseFloat`; rules read only typed values
- Never display a test, stress, or determinism result for a run that did not happen
- No marketing claims the spec doesn't make; the Overview states the problem, not benefits
- Render all test scenarios as separate clickable links, not a dropdown
- Apply the design tokens exactly as specified; do not improvise alternatives
- Use the Persona section content as the `system` prompt; do not summarize or paraphrase it
- The API key lives only in `.env` on the server; never in the browser bundle, the code, or any committed file
- No testimonials, no invented customers or statistics; label the app "Prototype · synthetic data"

Build the app now per all sections above. Run `npm run build` to confirm it compiles, then confirm when complete and give the run commands.

---

# Appendix: rules.py (store verbatim as RULES_PY)

```python
"""Escalation Router rules v1.0 (prototype, synthetic data).

Routes teacher and district escalations. Pure, deterministic, standard library only.
Every decision returns {result, rules_fired, explanation, next_step, cc}.
"""
import re

FIELDS = ("issue_type", "student_data", "teachers_affected", "renewal_days")
ISSUE_TYPES = ("how_to", "bug", "feature", "outage", "other", "needs_review")
STUDENT_DATA = ("yes", "no", "unsure")
RANGES = {"teachers_affected": (1, 10000), "renewal_days": (0, 1095)}
SEV1_TEACHERS = 3
RENEWAL_WINDOW_DAYS = 90

PRIVACY = "Privacy officer"
SEV1 = "Sev1: page engineering on-call"
COORD = "Coordinator review"
ENG = "Engineering queue"
PRODUCT = "Product backlog"
SUPPORT = "Support"

RANK = (PRIVACY, SEV1, COORD, ENG, PRODUCT, SUPPORT)

NEXT_STEP = {
    PRIVACY: "Privacy officer reviews the same day and decides whether families or the district must be told.",
    SEV1: "Engineering on-call is paged now; the Head of Customer Success confirms in parallel.",
    COORD: "A CS coordinator reads the item and routes it by hand.",
    ENG: "Engineering triages in the next daily standup.",
    PRODUCT: "Product adds it to the backlog and tags the district.",
    SUPPORT: "Support replies with the matching help article within one business day.",
}

_DIGITS = re.compile(r"[0-9]+")


def _whole(raw, lo, hi):
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        value = raw
    elif isinstance(raw, str):
        text = raw.strip()
        if not _DIGITS.fullmatch(text):
            return None
        value = int(text)
    else:
        return None
    return value if lo <= value <= hi else None


def validate(raw):
    """Turn raw field text into typed values. Returns (typed, errors)."""
    typed, errors = {}, []
    for name, options in (("issue_type", ISSUE_TYPES), ("student_data", STUDENT_DATA)):
        value = raw.get(name)
        value = value.strip() if isinstance(value, str) else value
        if value in options:
            typed[name] = value
        else:
            errors.append(name)
    for name, (lo, hi) in RANGES.items():
        value = _whole(raw.get(name), lo, hi)
        if value is None:
            errors.append(name)
        else:
            typed[name] = value
    return typed, errors


def _rule_num(rule_id):
    return int(rule_id[1:])


def decide(raw):
    typed, errors = validate(raw)
    if errors:
        return {
            "result": COORD,
            "rules_fired": ["R1"],
            "explanation": ["R1 fired: missing or invalid " + ", ".join(errors) + " → Coordinator review."],
            "next_step": NEXT_STEP[COORD],
            "cc": [],
        }

    t = typed["issue_type"]
    s = typed["student_data"]
    n = typed["teachers_affected"]
    d = typed["renewal_days"]
    routes, notes = {}, {}

    if s in ("yes", "unsure"):
        routes["R2"] = PRIVACY
        notes["R2"] = "R2 fired: student data = " + s + " → Privacy officer, same day."
    if t == "outage" and n >= SEV1_TEACHERS:
        routes["R3"] = SEV1
        notes["R3"] = "R3 fired: outage affecting " + str(n) + " teachers ≥ " + str(SEV1_TEACHERS) + " → Sev1."
    if t == "outage" and n < SEV1_TEACHERS:
        routes["R4"] = ENG
        notes["R4"] = "R4 fired: outage affecting " + str(n) + " teachers < " + str(SEV1_TEACHERS) + " → Engineering queue."
    if t == "bug":
        routes["R5"] = ENG
        notes["R5"] = "R5 fired: issue type bug → Engineering queue."
    if t == "feature":
        routes["R6"] = PRODUCT
        notes["R6"] = "R6 fired: issue type feature → Product backlog."
    if t == "how_to":
        routes["R7"] = SUPPORT
        notes["R7"] = "R7 fired: issue type how_to → Support with help article."
    if t == "needs_review":
        routes["R8"] = COORD
        notes["R8"] = "R8 fired: AI was unsure of the issue type → Coordinator review."
    if not routes:
        routes["R11"] = COORD
        notes["R11"] = "R11 fired: no routing rule fired (issue type " + t + ") → Coordinator review."

    result = min(routes.values(), key=RANK.index)
    fired = list(routes.keys())
    cc = []
    if d <= RENEWAL_WINDOW_DAYS:
        fired.append("R9")
        notes["R9"] = "R9 fired: renewal in " + str(d) + " days ≤ " + str(RENEWAL_WINDOW_DAYS) + " → copy the account manager."
        cc.append("Account manager")
    next_step = NEXT_STEP[result]
    if "R3" in routes:
        fired.append("R10")
        notes["R10"] = "R10 fired: Sev1 outage → page on-call now; Head of CS confirms in parallel."
        if result != SEV1:
            next_step = next_step + " Engineering on-call is also paged now (R10)."
    fired.sort(key=_rule_num)
    return {
        "result": result,
        "rules_fired": fired,
        "explanation": [notes[r] for r in fired],
        "next_step": next_step,
        "cc": cc,
    }


SCENARIOS = [
    ("T1", {"issue_type": "how_to", "student_data": "no", "teachers_affected": "1", "renewal_days": "200"}, SUPPORT, ["R7"]),
    ("T2", {"issue_type": "outage", "student_data": "no", "teachers_affected": "3", "renewal_days": "200"}, SEV1, ["R3", "R10"]),
    ("T3", {"issue_type": "feature", "student_data": "yes", "teachers_affected": "1", "renewal_days": "400"}, PRIVACY, ["R2", "R6"]),
    ("T4", {"issue_type": "feature", "student_data": "no", "teachers_affected": "2", "renewal_days": "45"}, PRODUCT, ["R6", "R9"]),
    ("T5", {"issue_type": "needs_review", "student_data": "no", "teachers_affected": "1", "renewal_days": "200"}, COORD, ["R8"]),
    ("T6", {"issue_type": "outage", "student_data": "no", "teachers_affected": "2", "renewal_days": "200"}, ENG, ["R4"]),
    ("T7", {"issue_type": "bug", "student_data": "no", "teachers_affected": "5", "renewal_days": "300"}, ENG, ["R5"]),
    ("T8", {"issue_type": "other", "student_data": "no", "teachers_affected": "1", "renewal_days": "200"}, COORD, ["R11"]),
    ("T9", {"issue_type": "outage", "student_data": "unsure", "teachers_affected": "4", "renewal_days": "30"}, PRIVACY, ["R2", "R3", "R9", "R10"]),
    ("T10", {"issue_type": "bug", "student_data": "yes", "teachers_affected": "2", "renewal_days": "200"}, PRIVACY, ["R2", "R5"]),
    ("M1", {"issue_type": "bug", "student_data": "no", "teachers_affected": "1e3", "renewal_days": "200"}, COORD, ["R1"]),
    ("M2", {"issue_type": "bug", "student_data": "no", "teachers_affected": "5", "renewal_days": "12.5"}, COORD, ["R1"]),
]


def self_test():
    passed, failures = 0, []
    for test_id, inputs, expected, expected_rules in SCENARIOS:
        out = decide(inputs)
        if out["result"] == expected and out["rules_fired"] == expected_rules:
            passed += 1
        else:
            failures.append((test_id, expected, expected_rules, out["result"], out["rules_fired"]))
    return {"passed": passed, "total": len(SCENARIOS), "failures": failures}


def determinism_check(inputs, runs=25):
    seen = set()
    for _ in range(runs):
        out = decide(inputs)
        seen.add((out["result"], tuple(out["rules_fired"])))
    return len(seen)
```
