# Fulcra: project blueprint

**Version 1.3, October 10, 2026.** Owner: Justin. Audience: the AI coding agent working in the Fulcra repository.

> **Read this first, agent.** The work happens in two phases, and you must not skip ahead.
>
> **Phase A, demos (section 23):** build two working demo apps in **Claude Design** using sample data. These are not a Chrome extension. Justin reviews them, leaves comments, and you revise until he approves.
>
> **Phase B, the real extension (sections 1 to 22):** only when Justin explicitly tells you to start Phase B. The approved demos win over this document for layout, visuals, and wording. Before writing extension code, update section 19 (Complete UI text) to match the approved demos and bump this file to v1.1 with a changelog note.
>
> Items tagged **[Unverified]** are facts that were not confirmed at writing time. Check each one when you reach it, and tell Justin if reality differs.

## Changelog

- **v1.3 (October 10, 2026, first feedback round):** changes after Justin used the build. Where this list and an older section disagree, this list wins.
  - **Email (12.3):** Gmail selectors checked against live Gmail (the Back button is a `title` attribute; counts can read "of many"). Imports split date ranges until each fits one page, so they read past the newest 50 emails; scheduled checks look back to the last good check (2 to 30 days). Checks report their result to the page and never fail silently; switching Gmail/Outlook doesn't need a disconnect; the Gmail account is picked in the email settings. Outlook tries outlook.live.com then outlook.office.com and must pass two guards (the search changes the list; each opened message shows an alert sender). The Handshake sender is `handshake@g.joinhandshake.com`. LinkedIn alerts hold about 6 jobs each. Promotional link text is never read as a job, and the model's `not_a_job` flag folds non-jobs away.
  - **Scoring (5.7, 5.9):** scores are spread across the person's open jobs per dimension by default (`scoring.spread`), from 3 jobs and a 1-point range up; overrides aren't stretched. The prompt has one 1-10 scale, treats every detail as evidence, asks for the reason before the score, allows half points, and works out remote, relocation (against home base), languages, and job type. Zero pay counts as missing. `tests/live/calibration.live.test.ts` measures spread and blank facts.
  - **Cost (5.2):** six requests in flight. Large batches offer Score now, Half price (OpenAI Batch API, files deleted afterwards), or Later; Re-score all uses the same banner.
  - **UI (9, 10):** ranked list pages (10 to 100 or all) with closed postings and non-jobs in folded groups; the radar takes any number of jobs and draws missing scores in red; scores are edited in place with a pencil; "Compare pay over" became "How far ahead are you planning?" in months; setup's last step summarizes the setup; full dark mode with a header toggle and Settings > Appearance.
  - **Sample data (23):** the sample person is now neutral (Columbus, healthcare operations) with the same scores, so the worked examples still hold; demo/sample-data.json is the source of truth over the copy in section 23.
- **v1.2 (October 10, 2026, Phase B build):** the extension is built (sections 1 to 22). Things the build settled or changed:
  - **Models (5.2):** both model IDs are confirmed in the live API model list. These models reject reasoning effort `minimal`, so Fulcra uses `none`. Prices are still unverified. The list also shows a `gpt-6-luna` model, not evaluated.
  - **Ranking (9.2):** jobs with no scores yet are not ranked; the list shows them in their own "Not scored yet" group. Ties keep the older job first.
  - **Outdated scores (5.7 vs 12.4):** these disagreed. Outdated scores stay in the overall score until the new score lands, as 12.4 and the demo say; only missing ("pending") scores are left out.
  - **Storage (12.1, 12.2):** IndexedDB has a fourth store, `queue`, for the persistent scoring queue. `JobRecord` gains `preliminary`, `scoring` (scored, not scored, queued, failed), `scoreError`, `knownCosts`, and `rawOutput`. `Settings.ui` gains `setupSkipped` and `learnSuppressed`, and `Settings.email` gains `importDays`.
  - **Pasted links (4.1, 15):** links from LinkedIn, Handshake, and Indeed are read in a background tab. Links from other sites ask for that one site's permission through `optional_host_permissions`, since there's no `<all_urls>`.
  - **Email (12.3):** each new alert thread is read from Gmail's print view inside the check window, falling back to opening it, then unread state is restored. Read thread ids are remembered so checks don't repeat. The import estimate counts alert emails and assumes 4 jobs per alert. The Handshake sender defaults to `notifications@joinhandshake.com`, still unverified.
  - **Dev tooling (15, 16):** `web-ext` is not installed. It is MPL-licensed and pulled in 7 audit findings, so `npm run dev` hot-reloads without launching a browser; load `.output/chrome-mv3-dev` once by hand. Dev-only additions: `jsdom`, `globals`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `@types/node`, `vite`. `npm run test:live` runs an opt-in smoke test against the real API.
  - **Manifest description:** Chrome limits it to 132 characters, so the manifest uses a shorter `appShortDescription`; the full description is for the store listing.
  - **Copy (19.8):** four strings added during the build, and the two job type keys renamed to `jobType.fullTime` and `jobType.partTime` so every key converts cleanly to Chrome's format.
- **v1.1 (October 10, 2026):** Phase A demos approved (canvas "Fulcra demo": Onboarding, Full-page app, and Popup artboards). Section 19 now matches the demos and is no longer a draft; copy the demos added is listed in 19.8. Behavior the demos settled is written into sections 9 to 11: the popup shows no rank for a job that fails dealbreakers, the popup's "Add your OpenAI key" opens setup, the job detail lists its facts and override controls explicitly, settings show removed dimensions with "Add back," and the developer interval list includes the normal presets. Fixes: the breakdown example in 9.2 now matches the sample data (its second item was career leverage 0.6; it is enjoyment 0.2), the learning-card button in 12.6 matches `learn.yes`, the email estimate example in 10 is $0.14, and the `Settings` type in 12.2 gains the Gmail account number, the sticky "outside your dealbreakers" choice, and the last-opened time used by the badge. The file moved to `docs/blueprint.md` as section 14 says.
- **v1.0:** first full blueprint. Supersedes the October 9 handoff document. Changes from the handoff: OpenAI API key is the only scoring engine (on-device and manual scoring removed), the name is Fulcra, the popup and full-page app are the two surfaces (no side panel), the ranked list is the home screen, there are no analytics, email is read through a scheduled background window, pay scores are computed by the app, and pay-unit outliers are checked by the model.

---

## 1. Project overview

Fulcra is a free, open-source browser extension that scores jobs on what matters to you, not just pay. It reads job postings you open and your LinkedIn and Handshake job alert emails, sends each listing to OpenAI using your own API key, and gets back structured scores on seven dimensions: pay, enjoyment, impact, career leverage, life cost, risk, and location and social cost. Fulcra then ranks every job by your priorities and charts them. Moving a priority slider reorders the list instantly. Everything is stored on your computer. There are no accounts, no servers, and no analytics.

**Approved store description:** "It's a free browser extension that scores job offers on what matters to you, not just pay. It reads the postings you open and your job alert emails, then ranks and charts every job by your priorities."

---

## 2. App name

**Name: Fulcra** (Justin's choice). Display as "Fulcra", package and folder name `fulcra`.

**Conflict warning (found October 10, 2026):** Fulcra Dynamics, a US company, ships a product called **Fulcra**: a user-owned "context lake" for AI agents with an MCP server, Python SDK, CLI, and an iPhone app called "Context by Fulcra." It is not a job tool, but it is in the same AI-tools space and uses the identical name, so a trademark complaint or store confusion is possible. **Not checked:** USPTO trademark records, Chrome Web Store, GitHub, npm. Justin decides whether to keep the name; do not block on it.

**Rename safety (required):** the product name appears in exactly one place in code, the `appName` key in `public/_locales/en/messages.json`. Every UI string references it. The manifest name uses `__MSG_appName__`. A rename must take under five minutes.

**Fallbacks** (from earlier shortlists, not cleared): Weighpoint, Whichjob.

---

## 3. Licensing and distribution

- **License:** MIT. `LICENSE` file at the repo root, copyright "2026 Justin [last name] and Fulcra contributors" (Justin fills in his last name).
- **Distribution:** Chrome Web Store (primary), plus a zip attached to each GitHub release for manual install.
- **Browsers:** build with WXT, which targets Chrome, Edge, and Firefox from one codebase. Only Chrome is tested and labeled supported. Other browsers are "may work."
- **Dependencies:** all are MIT, Apache-2.0, ISC, or BSD-licensed (section 15). Do not add a GPL dependency.
- **API key safety rules:**
  1. The key is stored only in `chrome.storage.local`, never in `chrome.storage.sync`, so it never syncs to Google.
  2. The key is only ever sent to `https://api.openai.com`.
  3. The key never appears in logs, diagnostics, exports, error messages, or the console.
  4. The settings screen shows only the last four characters.
  5. The UI recommends setting a monthly spend limit in the OpenAI dashboard.
  6. `chrome.storage.local` is not encrypted. Say so plainly in the privacy note and README.
- **What leaves the device:** only the job listing text plus the user's profile facts and dimension definitions, sent to OpenAI for scoring. Nothing else, ever.

---

## 4. Core user flow

### 4.1 The six stages

1. **First-run setup** (full-page app opens automatically on install): API key, about you, priorities, dealbreakers, job alert emails.
2. **Jobs come in** three ways:
   - **A job page you open.** Click the toolbar icon, then "Score this job."
   - **Job alert emails.** A scheduled check reads new LinkedIn and Handshake alerts from Gmail or Outlook.
   - **Paste a link or text** in the popup. Pasted text covers gigs with no posting, like a friend's offer or a text message.
3. **Job record:** extract facts, check pay units, dedupe, check whether the job is still open, store the listing text.
4. **Scoring:** OpenAI returns JSON only. The app computes the pay score and the overall score.
5. **Views:** ranked list (home) and radar, in the full-page app. The popup shows a quick verdict.
6. **Learning:** when the user overrides a score, Fulcra may suggest a weight change, which the user approves or declines.

### 4.2 Flow diagram

```mermaid
flowchart TD
  A[Job page opened] -->|Score this job| E[Extract listing text]
  B[Daily email check] --> C[Parse alert emails] --> D[Preliminary job records]
  P[Paste link or text] --> E
  E --> F[Job record: facts + listing]
  D --> F
  F --> G{Pay unit looks wrong?}
  G -->|yes| H[Model checks unit] --> I
  G -->|no| I[Dedupe + open/closed check]
  I --> J[OpenAI scoring, JSON only]
  J --> K[App computes pay score + overall score]
  K --> L[Ranked list / radar / popup verdict]
  L -->|user overrides a score| M[Suggest weight change]
```

### 4.3 Two-tier scoring

Alert emails carry only the title, company, location, and sometimes pay. Jobs from email get a **preliminary** score from that snippet, labeled "Preliminary." When the user later opens that job's posting, Fulcra recognizes it by its job ID and upgrades it to a full score automatically (setting: "Update preliminary scores when I open the posting," on by default). Fulcra never fetches LinkedIn pages in the background.

---

## 5. Backend: scoring engine

### 5.1 One engine

The OpenAI API with the user's own key is the only engine. With no key, Fulcra still saves jobs, but they wait as "Not scored yet" until a key is added. Then they're scored automatically, with the confirm-first rule from section 12.4 for large batches.

The provider layer is an interface (`src/llm/provider.ts`) so another provider can be added later. Only `openai.ts` ships in v1.

### 5.2 Models

| Friendly name in UI | Technical name | Price per 1M tokens (in / out) | About per 1,000 jobs | Use |
|---|---|---|---|---|
| Standard (recommended) | GPT-5.6 Luna | $0.20 / $1.20 | $1.20 | Default for all scoring |
| Sharper | GPT-5.4 Mini | $0.75 / $4.50 | $4.50 | Optional, if Standard feels noisy |

- Prices come from a third-party guide checked October 6, 2026. **[Unverified]** Confirm prices and exact API model IDs on OpenAI's pricing page before shipping. Keep model IDs and prices in one constants file, `src/llm/models.ts`.
- Set reasoning effort to the lowest available. Reasoning tokens bill as output.
- Use the Responses API with structured output (JSON schema, strict). **[Unverified]** Confirm strict JSON-schema support for these models. Validate every response with zod regardless.
- Cost estimate per job assumes 3,000 input and 500 output tokens:

$$\text{cost per job} = \frac{t_{in}\,p_{in} + t_{out}\,p_{out}}{10^6} = \frac{3000 \times 0.20 + 500 \times 1.20}{10^6} \approx \$0.0012$$

- Re-scoring a single dimension returns one score, about \$0.0007 per job.
- Batch API (50% cheaper, 24-hour window) is **not** used in v1.

### 5.3 What the model does and doesn't do

- **Model:** extracts facts, scores every dimension except Pay on a 1 to 10 scale (10 is best), writes a one-line reason per score (15 words or fewer), detects closed postings, and checks flagged pay units.
- **App:** computes take-home pay, the pay score, the overall score, dealbreakers, dedupe, ranking, and every chart. Dealbreakers are evaluated on extracted facts, never on model opinions.

### 5.4 Dimensions (default seven, all scored so 10 is best)

These definitions are sent in the prompt. They live in `src/core/dimensions.ts` as data, not code, so users can add, edit, or remove dimensions.

| id | Name | Definition sent to the model | 1 means | 10 means |
|---|---|---|---|---|
| `pay` | Pay | Computed by the app, not the model | | |
| `enjoyment` | Enjoyment | How much this person would enjoy the day-to-day work, given their stated interests | Dreaded daily | Work they'd do for fun |
| `impact` | Impact | How much the work actually helps real people | No one is helped, or some are harmed | Clear, direct help to people |
| `career` | Career leverage | How much this job moves the person toward their stated target work | Unrelated | Direct experience in the target work |
| `life` | Life cost | Hours, stress, and room left for life outside work (high score = low cost) | Consumes everything | Plenty of time and energy left |
| `risk` | Risk | Income stability, commitment length, and ease of starting (high score = low risk) | Unpredictable, hard to start | Stable, easy to start |
| `location` | Location and social cost | How well the job lets them live where and near whom they want | Requires leaving their community | Fully compatible |

Profile facts from setup feed the prompt: target work (for career leverage), home base and community (for location), languages and level, remote or relocation openness, and interests (for enjoyment).

**Language:** postings requiring a language the user doesn't speak get a `language_gap` flag and a lower career and risk score. Bilingual premiums count as upside.

**Custom dimensions:** up to 12 dimensions total. Each has an id, name, definition, and anchors for 1 and 10, and is versioned (section 12.4).

### 5.5 Pay math (app)

The model extracts `pay.min`, `pay.max`, `pay.period`, `hours_per_week`, and `duration_weeks`. The app uses the midpoint $r = (\text{min} + \text{max})/2$ and converts it to weekly pay $p_w$:

| period | $p_w$ |
|---|---|
| hour | $r \times h$ (hours per week; default 40 if unknown, marked estimate) |
| week | $r$ |
| month | $r \times 12 / 52$ |
| year | $r / 52$ |
| total | $r / d$ (job duration in weeks) |

Take-home over the user's time window of $W$ weeks (set in About you, default 52):

$$T = p_w \times \min(d, W) - c$$

Here $d$ is the job duration in weeks (defaults to $W$ if unknown or ongoing), and $c$ is known costs such as relocation (default 0). Taxes are not modeled; the UI says "before tax."

Pay score, with $G$ the user's pay goal over the window:

$$s_{\text{pay}} = 1 + 9 \cdot \min\!\left(1,\ \max\!\left(0,\ \frac{T}{G}\right)\right)$$

If no goal is set, $G$ is the largest $T$ among the user's open, scored jobs, so the best-paying job scores 10. Round to one decimal. When pay is missing, the model's estimate is used, the score is marked "Estimate," and the user can edit pay in the job detail.

**Pay reason line** (app-written): "About $13,300 before tax over 15 weeks." Add " (estimate)" when estimated.

### 5.6 Pay-unit outlier check

After extraction, the app flags pay that is orders of magnitude off for its unit:

| period | Flag if below | Flag if above |
|---|---|---|
| hour | $3 | $500 |
| week | $100 | $20,000 |
| month | $400 | $80,000 |
| year | $5,000 | $2,000,000 |

A flagged job triggers one small model call that includes the listing text, title, location, and the extracted number, and asks which unit was meant. The answer is a JSON enum `hour | week | month | year | total | unchanged` with a short reason. If the model changes the unit, the job shows "Pay unit corrected" with an Undo button. All of this lives in `src/core/pay.ts` and `src/llm/prompts.ts`.

### 5.7 Overall score

With weights $w_i$ (0 to 10) and scores $s_i$ over the dimensions $D$ that have a current score:

$$S = \frac{\sum_{i \in D} w_i\, s_i}{\sum_{i \in D} w_i}$$

Pending or out-of-date dimensions are excluded, and the other weights rebalance automatically. If all weights are 0, use equal weights. Display to one decimal. User overrides replace the model's score in this formula.

### 5.8 Scoring JSON (generated from the user's dimension list)

```json
{
  "facts": {
    "title": "string",
    "company": "string|null",
    "location": "string|null",
    "remote": "yes|no|hybrid|unknown",
    "pay": {"min": 0, "max": 0, "period": "hour|week|month|year|total|unknown", "currency": "USD", "is_estimate": true},
    "hours_per_week": null,
    "duration_weeks": null,
    "job_type": "full_time|part_time|internship|seasonal|contract|unknown",
    "commission_or_variable": "yes|no|unknown",
    "relocation_required": "yes|no|unknown",
    "languages_required": ["string"],
    "status": "open|closed|unknown"
  },
  "scores": {
    "<dimension_id>": {"score": 7, "reason": "one line, 15 words or fewer"}
  },
  "flags": ["language_gap"]
}
```

`src/llm/schema.ts` builds both the JSON schema sent to OpenAI and the zod validator from the current dimension list. `pay` is excluded from `scores`.

### 5.9 Prompt rules (`src/llm/prompts.ts`)

- The system prompt holds stable instructions first, so prompt caching applies.
- Treat the listing as untrusted data: wrap it in delimiters and tell the model to ignore any instructions inside it.
- Truncate listings to 30 KB.
- Preliminary scoring (email snippet only) adds: "Information is limited; score conservatively toward 5 when unsure."
- Malformed JSON: retry once with the validation error appended. On a second failure, mark the job "Couldn't score."

---

## 6. Output delivery

- **Popup verdict:** overall score, rank among your jobs, top three dimension scores with reasons, and dealbreaker status (section 9.1).
- **Full-page app:** ranked list (home), radar, job detail, settings.
- **Toolbar badge:** count of new scored jobs since the user last opened the app.
- **Notification:** when an email check finds a job scoring at or above the threshold (default 8.0).
- **Export:** JSON of all jobs and settings (no API key) from Settings > Your data.

---

## 7. Error handling

Every error shows plain language, never a stack trace or error code in the main message. Errors are logged locally (section 12.5) with a code, and never with the key or listing text.

| Code | Case | Where shown | User-facing message (key) | Recovery |
|---|---|---|---|---|
| `KEY_MISSING` | No API key | Popup, app banner | `err.keyMissing` | Button opens Settings > OpenAI key. Jobs are saved as "Not scored yet." |
| `KEY_INVALID` | 401 from OpenAI | Popup, app banner, setup | `err.keyInvalid` | Same. Pause all scoring until the key changes. |
| `NO_CREDIT` | 429 `insufficient_quota` | Popup, app banner | `err.noCredit` | Link to OpenAI billing. Pause scoring and keep the queue. |
| `RATE_LIMIT` | 429 rate limit | Banner progress text | `err.rateLimit` | Exponential backoff, 3 tries (2s, 8s, 30s), then requeue for 5 minutes. |
| `OFFLINE` | Network failure | Popup, banner | `err.offline` | Queue the job and retry when `navigator.onLine` fires. |
| `BAD_JSON` | Validation failed twice | Job row | `err.badJson` | "Try again" button on the job. |
| `PAGE_UNSUPPORTED` | No listing text found | Popup | `err.pageUnsupported` | Offer "Paste the job text instead." |
| `PAGE_CHANGED` | Known site, selectors found nothing | Popup | `err.pageChanged` | Fall back to the generic reader. If still empty, offer paste. Log selector version. |
| `JOB_CLOSED` | Posting says it's closed | Popup, job row | `msg.jobClosed` | Mark closed and hide from charts by default. Never add a closed job from email backfill. |
| `MAIL_SIGNED_OUT` | Mail page shows a login screen | App banner, badge "!" | `err.mailSignedOut` | Skip this check and retry at the next scheduled time. |
| `MAIL_CHANGED` | Mail layout not recognized | App banner | `err.mailChanged` | Skip, log, and suggest updating Fulcra. |
| `MISSED_CHECK` | Chrome was closed at check time | None | None | Run a catch-up check 2 minutes after the next browser start if the last check is over 24 hours old. |
| `STORAGE_FULL` | IndexedDB write fails | App banner | `err.storageFull` | Offer "Delete closed jobs" and "Export and delete old jobs." |
| `PAY_UNIT` | Pay outlier (section 5.6) | Job row, detail | `msg.payUnitCorrected` | Undo button. |
| `UNKNOWN` | Anything else | Toast | `err.unknown` | "Copy diagnostics" button. |

---

## 8. Triggers

| Trigger | Default | How to change |
|---|---|---|
| Click toolbar icon | Opens popup | None |
| "Score this job" in popup | Scores the current tab | None |
| Keyboard shortcut | `Alt+Shift+F` scores the current tab | `chrome://extensions/shortcuts`, linked from Settings |
| Right-click a page or link | "Score this job with Fulcra" | None |
| Auto-score supported job pages | Off | Settings > Scoring |
| Email check | Once a day | Settings > Job alert emails |
| Upgrade preliminary scores on visit | On | Settings > Scoring |

Conflict detection: Chrome handles shortcut conflicts. If `Alt+Shift+F` is taken, Chrome leaves it unassigned; Settings shows "Not set" with a link to fix it.

---

## 9. UI components

Two surfaces. All copy is in section 19, keyed. Copy and layout were approved through the Phase A demos (v1.1); where this section and the demos differ, the demos win.

**Visual language** (carry over from the existing design canvas):
- Background `#F6F5F1`, cards `#FFFFFF` with border `#DAD7CE`, radius 12px.
- Text `#1E2226`, secondary `#5A6068`, accent teal `#0F6B5F`, light teal `#E6F3EF`, dark teal text `#0B5247`.
- Warning amber background `#FBEFD9` with text `#4A2E05`. Error red `#B42318`.
- Fonts: IBM Plex Sans and IBM Plex Mono (bundled locally as woff2, no Google Fonts requests).
- Touch targets at least 44px. Text contrast at least 4.5:1.
- Dealbreaker failure marker: red dashed circle with an X. Nothing relies on color alone: shapes, dashes, and text labels too.
- Dimension colors: pay `#0F6B5F`, enjoyment `#E0A040`, impact `#3E6FB0`, career `#8C5BB0`, life `#9CC9BC`, risk `#C2562F`, location `#6B7280`. Custom dimensions cycle through `#7A8F3A`, `#B0527E`, `#3A8FA0`, `#8A6D3B`, `#5C5CA8`.
- Light theme only in v1.

### 9.1 Popup (380 × 580 px, Chrome's maximum is 800 × 600)

States, in priority order:
1. **No key:** message plus "Add your OpenAI key" button that opens setup (the full-page app at step 1 if setup isn't finished, otherwise Settings > OpenAI key).
2. **On a job page, not scored:** job title detected, "Score this job" (primary), cost hint "About $0.001."
3. **Scoring:** spinner, "Reading the posting…", then "Scoring…"
4. **Scored:** overall score (large, mono), "Rank #2 of 14," "Best fit" tag if #1. A job that fails a dealbreaker shows no rank, since ranks count only passing open jobs. Dealbreaker status: "Passes your dealbreakers" or a red marker with "Fails: minimum take-home." Top three dimensions by weighted contribution under the heading "Biggest factors," each with score and reason. "Preliminary" tag and the preliminary note if applicable. "Already scored 2 days ago" when the job was scored before. Buttons: "See full comparison" (opens app focused on this job), "Rescore."
5. **Not a job page:** "Your top jobs" (3 rows: name, score, mini bar), a "Paste a link or job text" box with "Add job," and an "Open Fulcra" button.
6. **Error states:** from section 7.

Footer on every state: "Emails checked 3 hours ago" (or "Email checks off") and a settings gear.

### 9.2 Full-page app (`options` page, opens in a tab)

Layout: top bar with Fulcra wordmark, tabs **Ranked list** | **Radar**, and a gear for **Settings**. Fluid layout from 360px to 1440px; at phone widths the slider panel stacks under the list.

**Ranked list (home):**
- Best-fit callout: "Best fit if pay is your priority" (wording adapts to the top weights, using the logic in the canvas), job name, "Scores 6.6 of 10. Weakest on life cost (2) and location and social (2)."
- Breakdown switch, "Show what makes up each score," **off by default.** On: stacked bars, one colored segment per dimension (score × weight ÷ total weight), ordered by weight, legend with weights, and a text line naming the two largest pieces, for example "Most from pay 5.6, enjoyment 0.2" (Summer sales rep under Max money).
- One row per passing job: rank, name, company and location, bar, score, movement since the user last picked a starting profile ("Up 3"), and tags: "Closed," "Preliminary," "Estimate," "Pay unit corrected," "Updating," "Not scored yet."
- "Outside your dealbreakers" section: if fewer than 5 jobs pass, failing jobs show automatically; with 5 or more they're hidden until the switch is flipped. A manual choice sticks. Unknown facts never fail ("Can't tell").
- Right panel "What matters most": profile menu (Max money, Balanced, Build my future, Do good, Life first, Custom), one slider per dimension (0 to 10), live reorder.
- Filters above the list: search box, "Show closed jobs" switch (off).
- Re-score banner (section 12.4).
- Empty state: "No jobs yet" with three ways to add jobs.
- Clicking a row (or the best-fit callout) opens **Job detail** in a right drawer (full screen on phones): title, company and location, overall score with rank, dealbreaker status, link to posting (not for pasted jobs), a Pay card (rate, take-home line, "Pay unit corrected" note with Undo, and "Edit pay" with Lowest, Highest, Per, Hours per week, Weeks), a Details card (Hours per week, Length, Job type, Remote, Relocation needed, Languages, Status), every dimension score and reason with "Use my own score" (then − and + buttons and "Use Fulcra's score"), source, added date, and buttons "Rescore," "Mark as closed," "Delete job." With developer mode and "Show raw model output" on, the raw JSON shows at the bottom.
- When the user skipped setup, a "Finish setting up Fulcra" card sits above the list. The learning card (12.6) also sits above the list.
- When no key is saved, a red banner says `err.keyMissing` with an "Add your OpenAI key" button that opens Settings > OpenAI key.

**Radar:** as in the canvas. Seven axes (or the user's count), rings every 2 points labeled 2 to 10, up to three jobs with distinct line dash and marker shapes. Tappable dimension names show each picked job's score and reason. Each axis shows the user's weight. Job picker shows overall scores and dealbreaker markers. "What stands out" is computed from scores with no AI call.

**Settings:** section 11.

**First-run setup:** section 10, shown in the same page when `setupComplete` is false.

### 9.3 Notifications

`chrome.notifications`, basic type, Fulcra icon. Only for strong matches from email checks (one notification per check, summarizing the count if more than one). Clicking opens the app on that job.

### 9.4 Background email window

A minimized, unfocused Chrome window (`chrome.windows.create({state: "minimized", focused: false})`) loads the mail search page, so no tab appears in the user's current window. If minimized windows aren't allowed, use an inactive tab in the current window and close it when done. The badge shows "…" during a check.

---

## 10. First-run setup

Opens automatically on install (`runtime.onInstalled`, reason `install`). There is a progress indicator ("Step 2 of 6"). From step 2 on, a small plain-text "Skip for now" link sits at the bottom left: readable, keyboard reachable, not styled as a button. Skipping applies Balanced weights and no dealbreakers, and shows a "Finish setup" card on the ranked list.

| Step | Screen | Required? |
|---|---|---|
| 0 | Welcome | Yes |
| 1 | Connect OpenAI | Yes, with an "I'll add it later" link |
| 2 | About you | Skippable |
| 3 | What matters most | Skippable |
| 4 | Dealbreakers | Skippable |
| 5 | Job alert emails | Skippable |
| 6 | Done | Yes |

**Step 1 details:**
- Password-type key field with a show/hide toggle.
- "What's an API key?" expandable: it's a password that lets Fulcra use OpenAI on your account, and OpenAI bills you directly.
- "How to get one" expandable: numbered steps for platform.openai.com.
- Cost line, spend-limit tip, and privacy line.
- "Test key" makes a minimal API call (list models or a 1-token request), with a result line.
- Continue is disabled until the test passes.

**Step 2, About you:**
- "What work are you aiming for?" (text area)
- "What do you enjoy doing?" (text area)
- "Where's home base?" (text) and "Is staying near your community important?" (Very / Somewhat / Not really)
- "Open to remote work?" and "Open to relocating?" (Yes / Maybe / No)
- Languages (chips with level: Native, Fluent, Conversational)
- Time window ("Compare pay over": This summer: 22 weeks / A year: 52 weeks / Custom weeks)
- Pay goal over that window (optional, number)

**Step 3, What matters most:** profile cards with a one-line description each, then sliders. Optional "Describe it in your own words" box: one model call returns suggested weight changes and up to three proposed new dimensions. Each proposal shows Approve and Decline. Nothing changes without approval.

**Step 4, Dealbreakers:**
- Minimum take-home over your window (number)
- Maximum hours per week (number)
- Must allow remote (switch)
- No relocation (switch)
- Job types to exclude (multi-select)
- Languages I don't speak (switch, on by default)

**Step 5, Job alert emails:**
- Provider buttons: Gmail, Outlook, Not now.
- After picking one: sign-in check (opens the mail page briefly to confirm it's signed in), "How often" (Once a day default; Every 6 hours; Every hour), "Import past alerts" (Last 7 days, Last 30 days default, Last 90 days, Everything), with a live cost estimate "About 120 jobs, about $0.14."
- Explanation of the background window and that emails stay unread.

**Step 6, Done:** pin-the-icon tip with a small illustration, how to score a page, and "See my ranked list."

Full copy: section 19.2.

---

## 11. Settings

Settings sections, in this order, as a left list on desktop and a stacked list on phones:

1. **OpenAI key:** masked key ("Key ending in 7Qx2"), Change, Test, Remove key (with confirmation), model choice (Standard / Sharper, as radio cards), "Set a spend limit on OpenAI" link and the spend-limit tip. With no key, the key field and "Test key" from setup step 1 show instead; a key is saved only after its test passes.
2. **About you:** same fields as setup step 2.
3. **Priorities:** profile cards, sliders, "Describe it in your own words," then "What Fulcra scores": the dimension list (move up and down, Edit, Remove; pay can't be edited), a "Removed" list with "Add back," "Add something to score," the 12-dimension limit note, and "Reset to Balanced."
4. **Dealbreakers:** same fields as setup step 4.
5. **Job alert emails:** provider, connection status, how often, last check time and result, "Check now," "Import past alerts" with the estimate, senders list (editable; defaults in section 12.3) with "Add sender," the background-window explanation, and "Turn off email checks."
6. **Scoring:** auto-score supported job pages (off), update preliminary scores on visit (on), notify me about strong matches (on) with threshold (default 8.0), keyboard shortcut status.
7. **Your data:** keep jobs for (30 / 90 default / 365 days / forever), "Export everything," "Delete closed jobs," "Delete everything."
8. **Help and diagnostics:** version, "Copy diagnostics," "Report a problem" (opens GitHub issues), "View the log."
9. **Developer (hidden until "Developer mode" is switched on at the bottom of Help):** email check interval (the normal presets plus every 5 minutes and every 30 seconds; 30 seconds is Chrome's minimum alarm period **[Unverified]**, believed to be 30 seconds since Chrome 120), detailed logging, "Show raw model output on jobs," Gmail account number (default 0), "Load sample data," "Clear sample data."

All settings save instantly, with a small "Saved" confirmation. No Save button.

---

## 12. History and data

### 12.1 Storage

- **IndexedDB** via `idb`, database `fulcra`, version 1. The manifest includes the `unlimitedStorage` permission. **[Unverified]** Confirm IndexedDB in extension pages is covered by `unlimitedStorage`.
- **`chrome.storage.local`:** API key, settings, `setupComplete`, last email check info.
- No `chrome.storage.sync` anywhere.

### 12.2 Schema (`src/core/types.ts`)

```ts
type Source = "page" | "email" | "paste";
type JobStatus = "open" | "closed" | "unknown";
type ScoreState = "current" | "pending" | "outdated" | "preliminary";

interface JobRecord {
  id: string;                    // uuid
  dedupeKey: string;             // site:jobId, else normalized company|title|location
  source: Source;
  sourceUrl: string | null;
  siteJobId: string | null;      // LinkedIn/Handshake/Indeed id when known
  listingText: string;           // trimmed, max 30 KB
  facts: Facts;                  // section 5.8
  payUnitCorrection: { from: string; to: string; reason: string } | null;
  scores: Record<string, {
    score: number; reason: string;
    dimVersion: number;          // version of the dimension definition used
    state: ScoreState;
    override: number | null;     // user's own score
  }>;
  status: JobStatus;
  addedAt: number; updatedAt: number; lastSeenAt: number;
  flags: string[];
}

interface Dimension {
  id: string; name: string; definition: string;
  anchorLow: string; anchorHigh: string;
  version: number; active: boolean; color: string;
  computedByApp: boolean;        // true only for pay
}

interface Settings {
  model: "standard" | "sharper";
  weights: Record<string, number>;
  profileId: "money" | "balanced" | "future" | "good" | "life" | "custom";
  dimensions: Dimension[];
  about: { targetWork: string; enjoys: string; homeBase: string;
           communityImportance: "very" | "somewhat" | "not";
           remote: "yes" | "maybe" | "no"; relocate: "yes" | "maybe" | "no";
           languages: { name: string; level: "native" | "fluent" | "conversational" }[];
           windowWeeks: number; payGoal: number | null };
  dealbreakers: { minTakeHome: number | null; maxHours: number | null;
                  mustRemote: boolean; noRelocation: boolean;
                  excludeTypes: string[]; languageGap: boolean };
  email: { provider: "gmail" | "outlook" | null; intervalMinutes: number;
           senders: string[]; lastCheck: { at: number; result: string } | null;
           accountIndex: number };       // Gmail u/N, developer setting, default 0
  scoring: { autoScore: boolean; upgradeOnVisit: boolean;
             notify: boolean; notifyThreshold: number };
  ui: { showOutsideDealbreakers: boolean | null;  // null = automatic (fewer than 5 pass)
        baselineOrder: string[];                  // passing job ids when a profile was last picked
        lastOpenedAt: number };                   // for the toolbar badge count
  retentionDays: number | null;
  developerMode: boolean;
  verboseLog: boolean;
  showRawOutput: boolean;
}
```

Object stores: `jobs` (keyPath `id`, indexes `dedupeKey`, `status`, `addedAt`), `log` (auto-increment), `overrides` (history for learning).

**Presets** (weights in order pay, enjoyment, impact, career, life, risk, location):

| Profile | Weights |
|---|---|
| Balanced | 5, 5, 5, 5, 5, 5, 5 |
| Max money | 10, 1, 1, 1, 1, 1, 1 |
| Build my future | 5, 4, 4, 10, 3, 3, 2 |
| Do good | 4, 5, 10, 4, 4, 2, 3 |
| Life first | 4, 7, 3, 2, 10, 4, 7 |

Custom dimensions get weight 5 under every preset.

### 12.3 Dedupe, status, and email parsing

- **Dedupe:** the same site job ID merges. Otherwise, the same normalized company + title + location merges (lowercase, punctuation stripped). A merge keeps the richer listing and the full score over a preliminary one.
- **Status:** content scripts detect closed postings (for example, LinkedIn's "No longer accepting applications"). Closed jobs are skipped during email backfill when known, hidden from charts by default, and still kept for retention.
- **Default alert senders:** `jobalerts-noreply@linkedin.com` and Handshake's alert sender. **[Unverified]** Confirm Handshake's address from a real alert email; both are editable in settings.
- **Gmail check:** open `https://mail.google.com/mail/u/0/#search/` with a query like `from:(senders) newer_than:2d` (or the backfill range). Read each unread result, extract job cards (title, company, location, link, pay if shown), then restore unread state with the toolbar "Mark as unread" control (found by aria-label). **[Unverified]** Gmail DOM selectors: keep them all in `src/readers/gmail.ts` with a version constant.
- **Outlook check:** same approach on `outlook.live.com` (personal) or `outlook.office.com` (work). **[Unverified]** Search deep-link format and selectors.
- **Multiple Google accounts:** v1 uses account `u/0` only. The account index is a developer setting.

### 12.4 Re-scoring rules

- **Weight changes:** instant, no API calls.
- **New dimension:** score only that dimension from stored listings. Until done, jobs show "pending" and averages skip it.
- **Edited dimension meaning:** the version is incremented. Old scores are marked "outdated," stay in use for ranking until the new score lands, and show a small "updating" marker.
- **Removed dimension:** scores are hidden, not deleted. Re-adding the same id and version restores them.
- **Small batches** (under 10 jobs and under $0.25 estimated): run automatically with a slim banner showing progress and a Pause button.
- **Large batches:** ask first, with job count, time estimate, cost estimate, and buttons "Start now" and "Later."
- **Closed jobs** re-score from stored text. Email-only jobs stay "preliminary."
- **Concurrency:** 3 parallel requests. The queue persists across browser restarts.

### 12.5 Retention, privacy, and log

- Jobs older than the retention setting (by `lastSeenAt`) are deleted daily. The default is 90 days.
- **Log:** ring buffer of the last 500 entries with timestamp, code, surface, and short detail. Never the key, listing text, or email content.
- **"Copy diagnostics":** extension version, Chrome version, OS, model choice, email provider, counts (jobs, by status), and the last 50 log codes.
- **Export:** JSON `{version, exportedAt, settings (no key), dimensions, jobs}`. Import is not in v1.
- **"Delete everything":** clears IndexedDB and `chrome.storage.local` including the key after a confirmation dialog, then reminds the user they can also delete the key on OpenAI's site.

### 12.6 Learning from overrides

When the user overrides a score, store `{jobId, dimensionId, modelScore, userScore, at}`. After 5 overrides on one dimension that are all in the same direction by at least 2 points, show a one-time card: "You keep rating Impact higher than Fulcra does. Want Fulcra to weigh impact more?" with buttons "Change the impact weight by 2" and "No thanks." (The lower-direction card lowers the weight by 2.) Declining suppresses the card for that dimension for 30 days. Overrides never retrain the model or change other jobs' scores.

**Not in v1:** after-the-job ratings ("How did this job turn out?"). Listed in known limitations.

---

## 13. Visual feedback

| Signal | Meaning |
|---|---|
| Toolbar badge number (teal) | New scored jobs since the app was last opened |
| Badge "…" (gray) | Email check or batch scoring running |
| Badge "!" (red) | Needs attention: bad key, no credit, or mail signed out |
| Popup spinner | Reading or scoring the current page |
| Slim amber banner in app | Re-scoring progress with Pause |
| "Saved" text | Setting saved |
| Notification | Strong match found by email check |

No sounds.

---

## 14. File structure

```
fulcra/
├── wxt.config.ts                 WXT config: manifest fields, permissions, entrypoints
├── package.json                  Scripts and exact-pinned dependencies
├── tsconfig.json                 Strict TypeScript
├── LICENSE                       MIT
├── README.md                     User and developer docs (section 21)
├── PRIVACY.md                    What leaves the device, where data lives
├── CHANGELOG.md                  Release notes
├── docs/
│   └── blueprint.md              This file
├── demo/
│   └── sample-data.json          Sample jobs shared by Claude Design demos, dev mode, and tests (section 23.4)
├── public/
│   ├── _locales/en/messages.json All UI strings (section 19)
│   ├── icons/                    16, 32, 48, 128 px PNGs
│   └── fonts/                    IBM Plex Sans and Mono woff2 (400, 500)
├── entrypoints/
│   ├── background.ts             Service worker: queue, alarms, email checks, badge, notifications, context menu, commands
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── Popup.tsx             Popup states (section 9.1)
│   ├── options/
│   │   ├── index.html            Full-page app, opens in a tab
│   │   ├── main.tsx
│   │   └── App.tsx               Router: setup, ranked list, radar, settings
│   ├── linkedin.content.ts       Reads LinkedIn job pages
│   ├── handshake.content.ts      Reads Handshake job pages
│   ├── indeed.content.ts         Reads Indeed job pages
│   ├── gmail.content.ts          Runs only in the background check window
│   └── outlook.content.ts        Same, for Outlook
├── src/
│   ├── core/
│   │   ├── types.ts              Interfaces (section 12.2)
│   │   ├── dimensions.ts         Default dimensions and versioning
│   │   ├── presets.ts            Profile weights
│   │   ├── pay.ts                Take-home, pay score, outlier check (5.5, 5.6)
│   │   ├── overall.ts            Weighted overall score (5.7)
│   │   ├── dealbreakers.ts       Evaluate dealbreakers on facts
│   │   ├── dedupe.ts             Dedupe keys and merging
│   │   ├── rescore.ts            Re-scoring planner and queue (12.4)
│   │   ├── learning.ts           Override suggestions (12.6)
│   │   └── standouts.ts          "What stands out" and best-fit wording
│   ├── llm/
│   │   ├── provider.ts           Provider interface
│   │   ├── openai.ts             Responses API client, retries, error mapping
│   │   ├── models.ts             Model IDs and prices (one place)
│   │   ├── prompts.ts            Scoring, preliminary, pay-unit, and describe-it prompts
│   │   ├── schema.ts             JSON schema + zod built from dimensions
│   │   └── cost.ts               Estimates
│   ├── store/
│   │   ├── db.ts                 idb setup and migrations
│   │   ├── jobs.ts               CRUD, retention cleanup
│   │   ├── settings.ts           chrome.storage.local wrapper
│   │   ├── log.ts                Ring buffer, diagnostics
│   │   └── export.ts             Export JSON, delete everything
│   ├── readers/
│   │   ├── extract.ts            Shared page-text extraction
│   │   ├── generic.ts            Readability fallback for any page (activeTab)
│   │   ├── linkedin.ts           Selectors + closed detection (versioned)
│   │   ├── handshake.ts          Same
│   │   ├── indeed.ts             Same
│   │   ├── gmail.ts              Mail selectors, unread restore (versioned)
│   │   ├── outlook.ts            Same
│   │   └── alerts/
│   │       ├── linkedinAlert.ts  Parse LinkedIn alert email body to job cards
│   │       └── handshakeAlert.ts Parse Handshake alert email body
│   ├── email/
│   │   ├── scheduler.ts          chrome.alarms setup, catch-up on startup
│   │   └── run.ts                One check: open window, collect, close, enqueue
│   ├── i18n/t.ts                 Typed wrapper over chrome.i18n.getMessage
│   └── ui/
│       ├── theme.css             Tokens (section 9), font-face
│       ├── RankedList.tsx
│       ├── BreakdownBar.tsx
│       ├── WeightPanel.tsx
│       ├── Radar.tsx             Hand-drawn SVG, no chart library
│       ├── JobDetail.tsx
│       ├── Setup/                One component per setup step
│       ├── Settings/             One component per settings section
│       ├── Banner.tsx, Switch.tsx, DealbreakerMark.tsx, Toast.tsx, Dialog.tsx
└── tests/
    ├── pay.test.ts, overall.test.ts, dealbreakers.test.ts, dedupe.test.ts,
    ├── schema.test.ts, rescore.test.ts, standouts.test.ts
    └── fixtures/                 Saved HTML of job pages and alert emails (with personal info removed)
```

---

## 15. Dependencies

Pin every version exactly (no `^` or `~`). Pick versions at least two weeks old. Run `npm audit` before each release.

| Package | Purpose | License |
|---|---|---|
| `wxt` | Extension framework, MV3 manifest, cross-browser builds, dev reload | MIT |
| `react`, `react-dom` | UI | MIT |
| `idb` | IndexedDB wrapper | ISC |
| `zod` | Validate model JSON | MIT |
| `@mozilla/readability` | Generic page text extraction | Apache-2.0 |

**Dev only:** `typescript`, `@wxt-dev/module-react`, `vitest`, `@types/chrome`, `eslint`, `prettier`, `fake-indexeddb` (tests).

**Not allowed:** chart libraries (charts are hand-drawn SVG), analytics SDKs, remote fonts or scripts, and anything that phones home.

**Manifest permissions:** `storage`, `unlimitedStorage`, `alarms`, `tabs`, `scripting`, `activeTab`, `contextMenus`, `notifications`.

**Host permissions:** `https://www.linkedin.com/*`, `https://app.joinhandshake.com/*`, `https://*.joinhandshake.com/*`, `https://www.indeed.com/*`, `https://mail.google.com/*`, `https://outlook.live.com/*`, `https://outlook.office.com/*`, `https://api.openai.com/*`.

No `<all_urls>`. Other sites work through `activeTab` when the user clicks.

---

## 16. Build and distribution

- `npm run dev`: WXT dev mode with hot reload in a fresh Chrome profile.
- `npm run build`: production build to `.output/chrome-mv3/`.
- `npm run zip`: store-ready zip.
- `npm test`: vitest.
- **GitHub Actions:**
  - `ci.yml` on every push and PR: install, typecheck, lint, test, build.
  - `release.yml` on a `v*` tag: build, zip, attach the zip to the GitHub release.
- **Chrome Web Store** (manual upload by Justin): needs the privacy policy URL (link to `PRIVACY.md` on GitHub), a single-purpose description, a justification for each permission, and data-use disclosures. **[Unverified]** Check current listing requirements before first submission.
- **Versioning:** semver. `0.x` until the store launch.

---

## 17. Install and uninstall

- **Install from the store:** one click. Setup opens in a new tab.
- **Developer install:** `npm run build`, then `chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3/`.
- **Uninstall:** Chrome's "Remove from Chrome." Chrome deletes the extension's IndexedDB and `chrome.storage` automatically. Nothing is left on disk by Fulcra.
- **Left behind on purpose:** the user's OpenAI key still exists on OpenAI's side. README and "Delete everything" both explain how to delete it there.
- No uninstall survey URL (no servers, no analytics).

---

## 18. Internationalization

- English only in v1.
- Every string goes through `chrome.i18n` (`public/_locales/en/messages.json`), wrapped by `src/i18n/t.ts`. No hard-coded UI text anywhere.
- Keys are dotted in this document (`popup.score.button`). In `messages.json`, replace dots with underscores, since Chrome keys allow only letters, digits, and underscores.
- `{name}`-style placeholders in this document become Chrome `$NAME$` placeholders.
- `{app}` always means the `appName` message.
- **To add a language later:** add `public/_locales/<code>/messages.json`. Keep `default_locale` as `en`. The model's reasons stay in English unless a later version passes a language to the prompt.

---

## 19. Complete UI text

**Status: approved through the Phase A demos (v1.1, October 10, 2026).** Strings the demos added are in 19.8. `{app}` = "Fulcra".

### 19.1 General

| Key | Text |
|---|---|
| `appName` | Fulcra |
| `appDescription` | It's a free browser extension that scores job offers on what matters to you, not just pay. It reads the postings you open and your job alert emails, then ranks and charts every job by your priorities. |
| `common.saved` | Saved |
| `common.cancel` | Cancel |
| `common.continue` | Continue |
| `common.back` | Back |
| `common.skip` | Skip for now |
| `common.undo` | Undo |
| `common.tryAgain` | Try again |
| `common.close` | Close |
| `common.delete` | Delete |
| `common.beforeTax` | before tax |
| `common.estimate` | Estimate |
| `common.preliminary` | Preliminary |
| `common.preliminaryHelp` | Scored from the alert email only. Open the posting for a full score. |
| `common.cantTell` | Can't tell |
| `common.outOf10` | {score} of 10 |
| `contextMenu.score` | Score this job with {app} |
| `command.score` | Score the job on this page |

### 19.2 First-run setup

| Key | Text |
|---|---|
| `setup.progress` | Step {n} of 6 |
| `setup.welcome.title` | Compare jobs on what matters to you |
| `setup.welcome.body` | {app} scores every job on pay, enjoyment, impact, career growth, time for life, risk, and location. Then it ranks them by what you care about most. |
| `setup.welcome.footer` | Free and open source. Your jobs stay on this computer. |
| `setup.welcome.button` | Get started |
| `setup.key.title` | Connect OpenAI |
| `setup.key.body` | {app} uses OpenAI to read and score jobs. You'll need your own OpenAI API key. |
| `setup.key.whatIs` | What's an API key? |
| `setup.key.whatIsBody` | It's like a password that lets {app} use OpenAI on your account. OpenAI bills you directly for what you use. {app} never sees your payment details. |
| `setup.key.howTo` | How to get one |
| `setup.key.howToSteps` | 1. Go to platform.openai.com and sign in or create an account. 2. Add a payment method under Billing. A ChatGPT subscription doesn't include this. 3. Open API keys and select Create new secret key. 4. Copy the key and paste it below. |
| `setup.key.label` | OpenAI API key |
| `setup.key.placeholder` | Starts with sk- |
| `setup.key.show` | Show |
| `setup.key.hide` | Hide |
| `setup.key.test` | Test key |
| `setup.key.testing` | Checking… |
| `setup.key.ok` | Key works. |
| `setup.key.bad` | That key didn't work. Check that you copied all of it and try again. |
| `setup.key.noCredit` | That key works, but your OpenAI account has no credit. Add some under Billing, then test again. |
| `setup.key.cost` | Scoring costs about $1.20 per 1,000 jobs. Most people spend under $1 a month. |
| `setup.key.limitTip` | Tip: set a monthly spend limit in your OpenAI account so costs can never surprise you. |
| `setup.key.privacy` | Your key stays on this computer and is only sent to OpenAI. Job text you score is sent to OpenAI to be read. |
| `setup.key.later` | I'll add it later |
| `setup.key.laterNote` | Without a key, {app} saves jobs but can't score them yet. |
| `setup.about.title` | About you |
| `setup.about.body` | This helps {app} judge each job for you, not for an average person. |
| `setup.about.target` | What work are you aiming for? |
| `setup.about.targetHint` | Example: applied AI, helping businesses automate work |
| `setup.about.enjoys` | What do you enjoy doing? |
| `setup.about.enjoysHint` | Example: building software, explaining things to people |
| `setup.about.home` | Where's home base? |
| `setup.about.community` | How important is staying near your community? |
| `setup.about.community.very` | Very |
| `setup.about.community.somewhat` | Somewhat |
| `setup.about.community.not` | Not really |
| `setup.about.remote` | Open to remote work? |
| `setup.about.relocate` | Open to relocating? |
| `setup.about.yes` | Yes |
| `setup.about.maybe` | Maybe |
| `setup.about.no` | No |
| `setup.about.languages` | Languages you speak |
| `setup.about.addLanguage` | Add a language |
| `setup.about.level.native` | Native |
| `setup.about.level.fluent` | Fluent |
| `setup.about.level.conversational` | Conversational |
| `setup.about.window` | Compare pay over |
| `setup.about.window.summer` | This summer (22 weeks) |
| `setup.about.window.year` | A year (52 weeks) |
| `setup.about.window.custom` | Custom |
| `setup.about.weeks` | weeks |
| `setup.about.goal` | Pay goal over that time (optional) |
| `setup.about.goalHint` | A job that reaches your goal gets a 10 for pay. |
| `setup.priorities.title` | What matters most? |
| `setup.priorities.body` | Pick a starting point. You can fine-tune it anytime, and the rankings update as you go. |
| `profile.balanced` | Balanced |
| `profile.balanced.desc` | Everything counts the same. |
| `profile.money` | Max money |
| `profile.money.desc` | Pay first, the rest barely counts. |
| `profile.future` | Build my future |
| `profile.future.desc` | Jobs that move you toward the work you want. |
| `profile.good` | Do good |
| `profile.good.desc` | Jobs that genuinely help people. |
| `profile.life` | Life first |
| `profile.life.desc` | Time, energy, and staying close to home. |
| `profile.custom` | Custom |
| `setup.priorities.describe` | Describe it in your own words (optional) |
| `setup.priorities.describeHint` | Example: Pay matters most, but I don't want a long commute or weekend shifts. |
| `setup.priorities.describeButton` | Suggest changes |
| `setup.priorities.suggesting` | Thinking… |
| `setup.priorities.suggestWeight` | Raise {dimension} from {from} to {to} |
| `setup.priorities.suggestDimension` | New thing to score: {name}. {definition} |
| `setup.priorities.approve` | Approve |
| `setup.priorities.decline` | Decline |
| `setup.deal.title` | Any dealbreakers? |
| `setup.deal.body` | Jobs that fail these are set aside, not deleted. If {app} can't tell, the job is not counted as failing. |
| `setup.deal.minPay` | Minimum take-home over your time window |
| `setup.deal.maxHours` | Maximum hours per week |
| `setup.deal.mustRemote` | Must allow remote work |
| `setup.deal.noRelocation` | No relocating |
| `setup.deal.excludeTypes` | Job types to skip |
| `setup.deal.languageGap` | Skip jobs that need a language I don't speak |
| `setup.deal.none` | No dealbreakers |
| `setup.email.title` | Watch your job alert emails? |
| `setup.email.body` | {app} can read new LinkedIn and Handshake job alerts from your inbox and score them for you. |
| `setup.email.how` | Once a day, {app} opens your inbox in a minimized window, reads new job alerts, and closes it. Your emails stay marked unread. Nothing else in your inbox is read. |
| `setup.email.gmail` | Gmail |
| `setup.email.outlook` | Outlook |
| `setup.email.notNow` | Not now |
| `setup.email.checking` | Checking that you're signed in… |
| `setup.email.signedIn` | Signed in. You're all set. |
| `setup.email.signedOut` | You're not signed in to {provider} in this browser. Sign in, then try again. |
| `setup.email.frequency` | How often |
| `setup.email.daily` | Once a day |
| `setup.email.sixHours` | Every 6 hours |
| `setup.email.hourly` | Every hour |
| `setup.email.import` | Import past alerts |
| `setup.email.import7` | Last 7 days |
| `setup.email.import30` | Last 30 days |
| `setup.email.import90` | Last 90 days |
| `setup.email.importAll` | Everything |
| `setup.email.estimate` | About {count} jobs, about {cost} |
| `setup.email.chromeOpen` | Chrome needs to be open for checks. A missed check runs the next time Chrome starts. |
| `setup.done.title` | You're set |
| `setup.done.pin` | Pin {app} to your toolbar: select the puzzle piece icon, then the pin next to {app}. |
| `setup.done.how` | Open any job posting, select the {app} icon, then Score this job. |
| `setup.done.button` | See my ranked list |
| `setup.finishCard.title` | Finish setting up {app} |
| `setup.finishCard.body` | A few answers make every score more accurate. |
| `setup.finishCard.button` | Finish setup |

### 19.3 Popup

| Key | Text |
|---|---|
| `popup.noKey.title` | Add your OpenAI key to start scoring |
| `popup.noKey.button` | Add your OpenAI key |
| `popup.detected` | Job found on this page |
| `popup.score.button` | Score this job |
| `popup.score.cost` | About $0.001 |
| `popup.reading` | Reading the posting… |
| `popup.scoring` | Scoring… |
| `popup.overall` | Overall |
| `popup.rank` | Rank #{rank} of {total} |
| `popup.bestFit` | Best fit |
| `popup.passes` | Passes your dealbreakers |
| `popup.fails` | Fails: {reasons} |
| `popup.topReasons` | Biggest factors |
| `popup.seeAll` | See full comparison |
| `popup.rescore` | Rescore |
| `popup.already` | Already scored {when} |
| `popup.topJobs` | Your top jobs |
| `popup.noJobs` | No jobs scored yet. Open a job posting to start. |
| `popup.paste.label` | Paste a link or job text |
| `popup.paste.hint` | Works for offers with no posting too, like a text from a friend. |
| `popup.paste.button` | Add job |
| `popup.open` | Open {app} |
| `popup.emailStatus` | Emails checked {when} |
| `popup.emailOff` | Email checks off |
| `popup.settings` | Settings |

### 19.4 Full-page app

| Key | Text |
|---|---|
| `app.tab.ranked` | Ranked list |
| `app.tab.radar` | Radar |
| `app.settings` | Settings |
| `ranked.bestFit.single` | Best fit if {dimension} is your priority |
| `ranked.bestFit.multi` | Best fit if {dimensions} are your priorities |
| `ranked.bestFit.equal` | Best fit with everything weighted the same |
| `ranked.bestFit.many` | Best fit for your current priorities |
| `ranked.bestFit.detail` | Scores {score} of 10. Weakest on {weakest}. |
| `ranked.breakdown.label` | Show what makes up each score |
| `ranked.breakdown.on` | Each colored piece is one thing you care about |
| `ranked.breakdown.off` | One bar per job |
| `ranked.breakdown.top` | Most from {items} |
| `ranked.move.up` | Up {n} |
| `ranked.move.down` | Down {n} |
| `ranked.move.same` | Same |
| `ranked.outside.title` | Outside your dealbreakers |
| `ranked.outside.shownFew` | Shown, since few jobs pass |
| `ranked.outside.shown` | Shown |
| `ranked.outside.hidden` | Hidden |
| `ranked.outside.toggle` | Show jobs outside my dealbreakers |
| `ranked.fails` | Fails: {reasons} |
| `ranked.search` | Search jobs |
| `ranked.showClosed` | Show closed jobs |
| `ranked.empty.title` | No jobs yet |
| `ranked.empty.body` | Add jobs any of these ways: open a job posting and select the {app} icon, turn on job alert emails in Settings, or paste a link or text in the popup. |
| `ranked.notScored` | Not scored yet |
| `ranked.couldntScore` | Couldn't score |
| `weights.title` | What matters most |
| `weights.hint` | Drag a slider and the list reorders. |
| `weights.profile` | Starting profile |
| `weights.movement` | Arrows show movement since you picked a starting profile. |
| `weights.local` | Saved on this computer only. |
| `dim.pay` | Pay |
| `dim.enjoyment` | Enjoyment |
| `dim.impact` | Impact |
| `dim.career` | Career leverage |
| `dim.life` | Life cost |
| `dim.risk` | Risk |
| `dim.location` | Location and social |
| `radar.title` | Radar |
| `radar.subtitle` | The shape of each job across everything you care about, up to three at once |
| `radar.pick.title` | Jobs to compare |
| `radar.pick.hint` | Pick up to three. Lines differ by dash and marker, not just color. |
| `radar.pick.full` | Three picked. Uncheck one to swap in another. |
| `radar.weight` | weight {n} |
| `radar.axisMeta` | Your weight {n} of 10 |
| `radar.rings` | Rings are every 2 points. The outer ring is 10, the best. Tap a name to read each job's reason. |
| `radar.overallNote` | Numbers on the right are overall scores with your current priorities, same as the ranked list. |
| `radar.standout.title` | What stands out |
| `radar.standout.leads` | {job} leads on {dimension} ({score}) |
| `radar.standout.trails` | but trails on {dimension} ({score}) |
| `radar.standout.none` | {job} doesn't lead on anything here. |
| `radar.standout.differ` | They differ most on {dimension}, from {low} to {high}. |
| `radar.standout.pickMore` | Pick one more job to see where they differ. |
| `radar.standout.pickAny` | Pick up to three jobs to compare their shapes. |
| `radar.standout.note` | Worked out from the scores, with no extra AI cost. |
| `detail.openPosting` | Open posting |
| `detail.facts` | Details |
| `detail.pay` | Pay |
| `detail.payLine` | About {amount} before tax over {weeks} weeks |
| `detail.editPay` | Edit pay |
| `detail.payUnit` | Pay unit corrected from per {from} to per {to}. {reason} |
| `detail.scores` | Scores |
| `detail.override` | Use my own score |
| `detail.overrideNote` | Your score |
| `detail.resetOverride` | Use {app}'s score |
| `detail.source.page` | Added from a job page |
| `detail.source.email` | Added from a job alert email |
| `detail.source.paste` | Added from pasted text |
| `detail.added` | Added {date} |
| `detail.rescore` | Rescore |
| `detail.markClosed` | Mark as closed |
| `detail.closed` | No longer accepting applications |
| `detail.delete` | Delete job |
| `detail.deleteConfirm` | Delete this job? This can't be undone. |
| `learn.card` | You keep rating {dimension} higher than {app} does. Want {app} to weigh {dimension} more? |
| `learn.cardLower` | You keep rating {dimension} lower than {app} does. Want {app} to weigh {dimension} less? |
| `learn.yes` | Change the {dimension} weight by {n} |
| `learn.no` | No thanks |

### 19.5 Banners, toasts, and notifications

| Key | Text |
|---|---|
| `banner.rescoreSmall` | Re-scoring {dimension} after you changed it: {done} of {total} done, under {cost}. |
| `banner.rescoreNew` | Scoring {dimension} for your saved jobs: {done} of {total} done. |
| `banner.pause` | Pause |
| `banner.resume` | Resume |
| `banner.ask.title` | Re-score {count} jobs? |
| `banner.ask.body` | This takes about {time} and costs about {cost}. |
| `banner.ask.start` | Start now |
| `banner.ask.later` | Later |
| `banner.waiting` | {count} jobs are waiting for your OpenAI key. |
| `banner.emailRunning` | Checking your job alerts… |
| `notify.strongMatch.title` | Strong match: {score} |
| `notify.strongMatch.body` | {title} at {company} |
| `notify.many.title` | {count} strong matches found |
| `notify.many.body` | Top: {title} at {company}, {score} |
| `badge.attention` | {app} needs your attention. Open {app} to see why. |

### 19.6 Errors and messages

| Key | Text |
|---|---|
| `err.keyMissing` | Add your OpenAI key to score jobs. |
| `err.keyInvalid` | Your OpenAI key stopped working. It may have been deleted or changed. Add a new one to keep scoring. |
| `err.noCredit` | Your OpenAI account is out of credit. Add credit on OpenAI's site, then scoring picks up where it left off. |
| `err.noCreditLink` | Open OpenAI billing |
| `err.rateLimit` | OpenAI is busy. {app} will try again in a moment. |
| `err.offline` | You're offline. {app} will score this when you're back online. |
| `err.badJson` | {app} couldn't read OpenAI's answer for this job. |
| `err.pageUnsupported` | {app} couldn't find a job on this page. |
| `err.pastePrompt` | Paste the job text instead |
| `err.pageChanged` | This site changed its layout, so {app} couldn't read it. Paste the job text instead, or update {app}. |
| `msg.jobClosed` | This job is no longer accepting applications. |
| `err.mailSignedOut` | Couldn't check your job alerts because you're signed out of {provider}. Sign in and {app} will try again at the next check. |
| `err.mailChanged` | {provider} changed its layout, so {app} couldn't read your job alerts. An update to {app} should fix this. |
| `err.storageFull` | Your computer is low on space for {app}. Delete closed or old jobs to make room. |
| `msg.payUnitCorrected` | Pay unit corrected |
| `err.unknown` | Something went wrong. |
| `err.copyDiagnostics` | Copy diagnostics |

### 19.7 Settings

| Key | Text |
|---|---|
| `settings.title` | Settings |
| `settings.key` | OpenAI key |
| `settings.key.current` | Key ending in {last4} |
| `settings.key.change` | Change |
| `settings.key.remove` | Remove key |
| `settings.key.removeConfirm` | Remove your key? {app} will stop scoring until you add one. |
| `settings.key.model` | Scoring quality |
| `settings.key.standard` | Standard (recommended): about $1.20 per 1,000 jobs |
| `settings.key.sharper` | Sharper: about $4.50 per 1,000 jobs |
| `settings.key.limit` | Set a spend limit on OpenAI |
| `settings.about` | About you |
| `settings.priorities` | Priorities |
| `settings.dims.title` | What {app} scores |
| `settings.dims.add` | Add something to score |
| `settings.dims.name` | Name |
| `settings.dims.definition` | What it means |
| `settings.dims.low` | A 1 means |
| `settings.dims.high` | A 10 means |
| `settings.dims.edit` | Edit |
| `settings.dims.remove` | Remove |
| `settings.dims.removeNote` | Scores are hidden, not deleted. Add it back to restore them. |
| `settings.dims.max` | You can score up to 12 things. Remove one to add another. |
| `settings.dims.payNote` | {app} works out pay itself from the numbers in the posting. |
| `settings.priorities.reset` | Reset to Balanced |
| `settings.deal` | Dealbreakers |
| `settings.email` | Job alert emails |
| `settings.email.status.on` | Connected to {provider} |
| `settings.email.status.off` | Not connected |
| `settings.email.last` | Last checked {when}: {result} |
| `settings.email.resultNew` | {count} new jobs |
| `settings.email.resultNone` | no new jobs |
| `settings.email.checkNow` | Check now |
| `settings.email.senders` | Alert senders |
| `settings.email.sendersHint` | {app} only reads emails from these addresses. |
| `settings.email.disconnect` | Turn off email checks |
| `settings.scoring` | Scoring |
| `settings.scoring.auto` | Score job pages automatically when I open them |
| `settings.scoring.autoHint` | Uses a little OpenAI credit for every job page you visit. |
| `settings.scoring.upgrade` | Update preliminary scores when I open the posting |
| `settings.scoring.notify` | Notify me about strong matches |
| `settings.scoring.threshold` | Strong match means a score of at least |
| `settings.scoring.shortcut` | Keyboard shortcut |
| `settings.scoring.shortcutNone` | Not set |
| `settings.scoring.shortcutChange` | Change shortcut |
| `settings.data` | Your data |
| `settings.data.where` | Everything is stored on this computer. Job text is sent to OpenAI only when it's scored. |
| `settings.data.keep` | Keep jobs for |
| `settings.data.30` | 30 days |
| `settings.data.90` | 90 days |
| `settings.data.365` | 1 year |
| `settings.data.forever` | Forever |
| `settings.data.export` | Export everything |
| `settings.data.exportNote` | A file with all your jobs and settings. Your OpenAI key is never included. |
| `settings.data.deleteClosed` | Delete closed jobs |
| `settings.data.deleteAll` | Delete everything |
| `settings.data.deleteAllConfirm` | Delete all jobs, settings, and your saved key from {app}? This can't be undone. |
| `settings.data.deleteAllDone` | Everything is deleted. Your key still exists in your OpenAI account; you can delete it there. |
| `settings.help` | Help and diagnostics |
| `settings.help.version` | Version {version} |
| `settings.help.copy` | Copy diagnostics |
| `settings.help.copied` | Copied. Paste it into your problem report. |
| `settings.help.report` | Report a problem |
| `settings.help.log` | View the log |
| `settings.help.developer` | Developer mode |
| `settings.dev.title` | Developer |
| `settings.dev.interval` | Email check interval |
| `settings.dev.interval30s` | Every 30 seconds |
| `settings.dev.interval5m` | Every 5 minutes |
| `settings.dev.verbose` | Detailed logging |
| `settings.dev.raw` | Show raw model output on jobs |
| `settings.dev.sample` | Load sample data |
| `settings.dev.clearSample` | Clear sample data |
| `settings.dev.account` | Gmail account number |

### 19.8 Added from the demos

| Key | Text |
|---|---|
| `common.overall` | Overall |
| `common.saveChanges` | Save changes |
| `common.on` | On |
| `common.off` | Off |
| `tag.closed` | Closed |
| `tag.updating` | Updating |
| `tag.yourScore` | Your score |
| `fail.minPay` | minimum take-home |
| `fail.maxHours` | maximum hours |
| `fail.remote` | remote work |
| `fail.relocation` | relocating |
| `fail.jobType` | job type |
| `fail.language` | language |
| `jobType.fullTime` | Full time |
| `jobType.partTime` | Part time |
| `jobType.internship` | Internship |
| `jobType.seasonal` | Seasonal |
| `jobType.contract` | Contract |
| `remote.yes` | Yes |
| `remote.no` | No |
| `remote.hybrid` | Hybrid |
| `period.hour` | Hour |
| `period.week` | Week |
| `period.month` | Month |
| `period.year` | Year |
| `period.total` | Whole job |
| `rate.hour` | {amount} an hour |
| `rate.week` | {amount} a week |
| `rate.month` | {amount} a month |
| `rate.year` | {amount} a year |
| `rate.total` | {amount} total |
| `detail.hours` | Hours per week |
| `detail.length` | Length |
| `detail.weeks` | {n} weeks |
| `detail.jobType` | Job type |
| `detail.remote` | Remote |
| `detail.relocation` | Relocation needed |
| `detail.languages` | Languages |
| `detail.status` | Status |
| `detail.statusOpen` | Open |
| `detail.payMin` | Lowest |
| `detail.payMax` | Highest |
| `detail.payPer` | Per |
| `detail.payWeeks` | Weeks |
| `detail.closePay` | Close |
| `detail.raise` | Raise your {dimension} score |
| `detail.lower` | Lower your {dimension} score |
| `detail.rescoring` | Scoring… |
| `ranked.outside.one` | 1 job |
| `ranked.outside.count` | {count} jobs |
| `ranked.noMatch` | No jobs match your search. |
| `ranked.nonePass` | No open jobs pass your dealbreakers yet. |
| `ranked.reasonNotScored` | Not scored yet |
| `profile.custom.desc` | Your own mix of weights. |
| `setup.priorities.approved` | Approved |
| `setup.priorities.declined` | Declined |
| `setup.about.languageName` | Language |
| `setup.about.level` | Level |
| `setup.about.customWeeks` | Custom weeks |
| `setup.about.removeLanguage` | Remove {name} |
| `setup.about.levelOf` | {name} level |
| `setup.done.illustration` | Chrome toolbar with the puzzle piece icon and {app} pinned beside it |
| `settings.key.test` | Test |
| `settings.dims.removed` | Removed |
| `settings.dims.restore` | Add back |
| `settings.dims.moveUp` | Move {name} up |
| `settings.dims.moveDown` | Move {name} down |
| `settings.email.addSender` | Add sender |
| `settings.email.senderLabel` | Sender address |
| `settings.email.removeSender` | Remove {address} |
| `settings.data.closedDeleted` | Closed jobs deleted. |
| `settings.dev.sampleLoaded` | Sample data loaded. |
| `settings.dev.sampleCleared` | Sample data cleared. |
| `banner.exportDeleteOld` | Export and delete old jobs |
| `radar.axisAria` | {dimension}, your weight {n}. Show each job's reason. |
| `radar.chartAria` | Radar chart of {jobs} across {count} things you care about. |
| `radar.emptyAria` | Empty radar chart. No jobs picked. |
| `ranked.breakdownLegend` | Breakdown colors, largest weight first |
| `ranked.barAria` | {job} scores {score}. {top}. |
| `ranked.segment` | {dimension}: {score}, adds {part} |
| `popup.pasted` | Pasted job |
| `email.checkedNow` | just now |
| `appShortDescription` | It's a free browser extension that scores job offers on what matters to you, not just pay. |
| `common.estimateParen` | (estimate) |
| `popup.emailNotYet` | Emails not checked yet |
| `setup.priorities.suggestLower` | Lower {dimension} from {from} to {to} |

---

## 20. Recommended build order (Phase B)

Each step ends with passing tests and a working build. Steps 3, 4, and 6 can run in parallel if you have subagents.

1. **Skeleton:** WXT + React + TypeScript project, manifest, permissions, i18n wrapper with all section 19 keys in `messages.json`, theme tokens, bundled fonts, CI workflow.
2. **Core logic with tests:** types, dimensions, presets, pay math, outlier check, overall score, dealbreakers, dedupe, standouts and best-fit wording. Use `demo/sample-data.json` as fixtures. The tests must reproduce the sample data's pay scores exactly.
3. **Storage:** idb setup, jobs CRUD, settings, log, export, delete everything, retention cleanup.
4. **OpenAI client:** models file, schema builder, prompts, Responses API calls, retries, error mapping, cost estimates, key test call.
5. **Scoring pipeline:** queue in the service worker (persisted, 3 concurrent), pay-unit check, score, save, badge.
6. **Page readers:** LinkedIn, Handshake, Indeed, generic Readability fallback, closed detection, paste input. Save HTML fixtures for tests.
7. **Popup:** every state in section 9.1, wired to the pipeline.
8. **Full-page app:** ranked list with breakdown switch, weights panel, job detail, radar, matching the approved demo.
9. **First-run setup.**
10. **Settings,** including dimension editing and the describe-it call.
11. **Re-scoring engine:** pending, outdated, banners, confirm-first for large batches.
12. **Email checks:** scheduler, background window, Gmail reader, alert parsers, unread restore, backfill, then Outlook.
13. **Notifications, context menu, keyboard command, learning-from-overrides card.**
14. **Polish:** empty states, every error in section 7, accessibility pass (keyboard, screen reader labels, contrast), and phone-width layout of the app page.
15. **Release prep:** README, PRIVACY.md, CHANGELOG, store assets, `release.yml`.

**Definition of done for Phase B:** Justin can install the build, finish setup, score a LinkedIn posting, see it ranked, move sliders, compare three jobs on the radar, connect Gmail, receive scored alerts the next day, and delete everything, with no console errors.

---

## 21. README checklist

The README must cover:
- What Fulcra is (the approved description) and a screenshot of the ranked list.
- Install from the Chrome Web Store, and developer install from source.
- Getting an OpenAI API key, what it costs (with the per-1,000-jobs figure), and setting a spend limit.
- How to score a job (popup, shortcut, right-click), paste text, and email checks.
- What the seven dimensions mean and how the overall score and pay score are calculated (the formulas from 5.5 and 5.7).
- Privacy: what's sent to OpenAI, what stays local, that the key isn't encrypted at rest, no analytics, how to delete everything and delete the key on OpenAI's side.
- Supported browsers (Chrome tested, others may work) and supported job sites.
- Known limitations (section 22).
- Reporting problems with "Copy diagnostics."
- Contributing: dev setup, tests, where site selectors live and how to update them when a site changes.
- MIT license, and a note that Fulcra is not affiliated with LinkedIn, Handshake, Indeed, Google, Microsoft, or OpenAI.

---

## 22. Known limitations

- Requires a paid OpenAI API account. There is no free scoring option in v1.
- Scores are a model's judgment from the posting text and can be wrong. Reasons are shown so users can judge, and overrides are always available.
- Pay ignores taxes, benefits, and equity unless the posting states a total. Estimated pay is labeled.
- Email checks need Chrome to be open and the user signed in to Gmail or Outlook in the same browser profile. Only the first Gmail account (`u/0`) is checked by default.
- Email reading depends on Gmail's and Outlook's page layouts, which can change without notice and break checks until Fulcra is updated.
- Jobs from alert emails get only a preliminary score until the posting is opened. Fulcra can't always tell from an email that a job has closed.
- LinkedIn, Handshake, and Indeed layouts can change and break page reading. Pasting text always works.
- A brief minimized window appears in the taskbar during email checks.
- The API key is stored unencrypted in the browser's extension storage.
- Only Chrome is tested. Edge and Firefox builds may work but aren't supported.
- English only.
- No after-the-job ratings, no import, no sync between computers, no mobile app.
- The name "Fulcra" is also used by Fulcra Dynamics' AI context product (section 2).

---

## 23. Phase A: build the demos in Claude Design

**Goal:** two working, clickable demo apps that look and behave like the real extension, using sample data only, so Justin can approve layout, flow, and wording before any extension code exists.

### 23.1 Ground rules

1. Use Claude Design: the **Artifact tool** with the **Design** artifact type. List artifact types (`action: "list"`, `scope: "types"`), then read the Design type (`action: "read"` with its `type_url`) and follow its own instructions and reference files exactly. Its rules override anything here about the file format.
2. **If you don't have the Artifact tool or the Design type, stop and tell Justin.** Do not substitute HTML files, a React app, or a mock extension.
3. Before choosing fonts or colors, check for a Design System as the type's instructions describe. If none is set as default, use the look in section 9.
4. Read the previous canvas at `https://claude.ai/artifact/UMyAbdUUEjkXsGkCHzoxdE` (files `project/RankedBars.dc.html` and `project/Radar.dc.html`). Reuse their logic and visual language: the breakdown bars, live sliders, presets, dealbreaker section, tappable radar axes, and "What stands out." **Do not edit that canvas.** If you can't read it, rebuild from section 9.
5. Create **one new canvas** titled **"Fulcra demo"** with two interactive artboards:
   - `Main.dc.html`: the **full-page app**. Treat it as a PAGE: `expand: "fill"`, fluid layout, width 1280, height about 900, works at phone width.
   - `Popup.dc.html`: the **popup**, fixed 380 × 580.
   - Mark both `is_interactive: true`.
6. Each app is **one artboard** with its screens switched by internal state, because artboards don't share state.
7. **No network or AI calls.** Every "AI" result is canned from the sample data. The demo must work offline.
8. Use the wording in section 19 exactly. Don't invent new copy unless a screen needs text section 19 doesn't have; list any additions for Justin.
9. Follow the type's rule about not verifying or screenshotting your own work unless Justin asks.

### 23.2 What to build in `Main.dc.html` (full-page app)

- **Top bar:** Fulcra wordmark, tabs Ranked list | Radar, Settings gear. All navigation works.
- **First-run setup:** all seven screens in section 10, with working Back, Continue, and Skip for now. Fake behaviors:
  - **Test key:** any value starting `sk-` with 20 or more characters → "Key works." `sk-bad` → invalid message. `sk-empty` → no-credit message. Anything else → invalid.
  - **Describe it in your own words:** after 1 second, show two canned suggestions: "Raise Location and social from 5 to 8" and a new dimension "Commute: how long and costly the daily trip to work is," each with Approve and Decline that actually change the sliders and dimension list.
  - **Email provider:** "Checking that you're signed in…" for 1.5 seconds, then "Signed in." The backfill estimate updates with the range: 7 days → 12 jobs, 30 days → 48 jobs, 90 days → 130 jobs, Everything → 210 jobs, each at $0.0012 per job.
  - Finishing setup lands on the ranked list.
- **Ranked list:** everything in section 9.2. Breakdown switch off by default, live sliders and profiles, movement arrows, best-fit callout, dealbreaker section with the "fewer than 5 pass" rule, preliminary and estimate tags, search, Show closed jobs, the "Finish setup" card when setup was skipped, the learning card (show it once after the user overrides Impact on any job), and the empty state.
- **Job detail drawer:** opens from any row. Shows facts, pay line, every score and reason, override controls that immediately change the ranking, Rescore (fake 1.5-second spinner), Mark as closed, and Delete with confirmation. The warehouse job shows the "Pay unit corrected" note with a working Undo.
- **Radar:** as in the old canvas, plus overall scores matching the ranked list under the current weights. Weights must be shared with the ranked list, since it's one artboard.
- **Settings:** every section in section 11 with working controls. "Delete everything" shows the confirm dialog and then the empty state. Developer mode reveals the Developer section. "Copy diagnostics" shows the "Copied" message.
- **Banners:** all of section 19.5's in-app banners reachable through the demo controls below.

**Demo controls** (declared as Design tweaks in `data-props`, not as widgets on screen):
- `startScreen`: `setup` | `ranked` | `radar` | `settings` (default `ranked`)
- `jobSet`: `empty` | `few` (Dev internship, Contract AI work, Summer sales rep, Tutoring, so fewer than 5 pass and the failing job shows automatically) | `all` (default `all`)
- `banner`: `none` | `rescoreSmall` | `askLarge` | `waitingForKey` | `noCredit` | `keyInvalid` | `mailSignedOut` | `mailChanged` | `storageFull` (default `none`)

### 23.3 What to build in `Popup.dc.html`

Every popup state in section 9.1, using the sample data.
- "Score this job" runs "Reading the posting…" for 1.5 seconds and "Scoring…" for 1.5 seconds, then shows the Dev internship result: Rank #1 of 5 under the Balanced profile, with its top three factors.
- "Add job" with any pasted text runs the same sequence and shows a new job, "Pasted job," with the Contract AI work scores.
- "See full comparison" and "Open Fulcra" link to `Main.dc.html`.

**Demo control** `scenario`: `noKey` | `jobPage` | `scoring` | `scored` | `scoredFails` (Tutoring) | `preliminary` (Junior data analyst) | `notJobPage` | `noCredit` | `pageUnsupported` | `offline` (default `jobPage`).

### 23.4 Sample data (`demo/sample-data.json`)

Use this exact data in both artboards, and commit it to the repo as `demo/sample-data.json` for Phase B tests. The time window is 22 weeks, the pay goal is $30,000, and the minimum take-home dealbreaker is $8,000. Pay scores follow section 5.5:

$$s_{\text{pay}} = 1 + 9 \cdot \min\!\left(1, \frac{T}{30000}\right)$$

Score order is pay, enjoyment, impact, career, life, risk, location.

```json
{
  "about": {
    "targetWork": "Applied AI and developer tools",
    "enjoys": "Building software and explaining things to people",
    "homeBase": "Boise, Idaho",
    "communityImportance": "very",
    "remote": "yes", "relocate": "maybe",
    "languages": [{"name": "English", "level": "native"}, {"name": "Spanish", "level": "fluent"}],
    "windowWeeks": 22, "payGoal": 30000
  },
  "dealbreakers": {"minTakeHome": 8000, "maxHours": null, "mustRemote": false, "noRelocation": false, "excludeTypes": [], "languageGap": true},
  "jobs": [
    {"id": "dev", "title": "Software dev internship", "company": "Northbeam Software", "location": "Salt Lake City, UT (hybrid)", "source": "page", "status": "open",
     "pay": {"min": 24, "max": 24, "period": "hour", "is_estimate": false}, "hours": 37, "weeks": 15, "takeHome": 13320,
     "scores": [5.0, 8, 6, 10, 7, 8, 7],
     "reasons": ["About $13,300 before tax over 15 weeks.", "Building software is the kind of work you enjoy most.", "Internal tools help coworkers more than end users.", "Direct experience in applied AI and developer tools.", "Forty hours a week, evenings mostly free.", "Fixed pay for a set fifteen-week term.", "Hybrid; a few weeks away from your community."]},
    {"id": "contract", "title": "Contract AI work", "company": "Remote AI training platform", "location": "Remote", "source": "page", "status": "open",
     "pay": {"min": 20, "max": 30, "period": "hour", "is_estimate": false}, "hours": 20, "weeks": 20, "takeHome": 10000,
     "scores": [4.0, 6, 5, 7, 8, 6, 10],
     "reasons": ["About $10,000 before tax over 20 weeks.", "Interesting tasks, with repetitive review some weeks.", "Improves AI models; the benefit to people is indirect.", "Hands-on with frontier models, though not engineering work.", "Set your own hours and work from home.", "Task supply can dry up without notice.", "Fully remote, so you stay where you are."]},
    {"id": "sales", "title": "Summer sales rep", "company": "Summit Pest Solutions", "location": "Dallas, TX", "source": "email", "status": "open",
     "pay": {"min": 26700, "max": 26700, "period": "total", "is_estimate": true}, "hours": 65, "weeks": 16, "takeHome": 26700,
     "scores": [9.0, 3, 3, 3, 2, 3, 2],
     "reasons": ["About $26,700 before tax over 16 weeks (estimate).", "Long days of door-to-door pitching.", "Product helps some buyers; pressure selling hurts others.", "Sales skills transfer a little to consulting work.", "Six-day weeks with long hours all summer.", "Mostly commission, so income swings week to week.", "Requires moving out of state for the summer."]},
    {"id": "warehouse", "title": "Warehouse associate", "company": "Valley Distribution", "location": "Nampa, ID", "source": "email", "status": "open",
     "pay": {"min": 16, "max": 16, "period": "hour", "is_estimate": false}, "hours": 40, "weeks": 21, "takeHome": 13440,
     "payUnitCorrection": {"from": "year", "to": "hour", "reason": "The posting said $16 a year, which only makes sense as hourly."},
     "scores": [5.0, 3, 3, 2, 4, 6, 2],
     "reasons": ["About $13,400 before tax over 21 weeks.", "Repetitive physical work on your feet.", "Keeps orders moving; little direct effect on people.", "Little connection to software or AI work.", "Rotating shifts make a routine hard to keep.", "Easy to start, but shifts can be cut.", "Long commute to the site most days."]},
    {"id": "tutor", "title": "Math and coding tutor", "company": "Independent", "location": "Boise, ID or online", "source": "paste", "status": "open",
     "pay": {"min": 25, "max": 25, "period": "hour", "is_estimate": false}, "hours": 12, "weeks": 22, "takeHome": 6600,
     "scores": [3.0, 7, 8, 5, 8, 7, 9],
     "reasons": ["About $6,600 before tax over 22 weeks.", "One-on-one teaching is rewarding.", "Clear, direct help for each student.", "Builds explaining skills, little technical growth.", "You set the schedule.", "Easy to start; demand dips in summer.", "Local or online, near your community."]},
    {"id": "ta", "title": "Math teaching assistant", "company": "State university", "location": "Boise, ID", "source": "page", "status": "open",
     "pay": {"min": 15, "max": 15, "period": "hour", "is_estimate": false}, "hours": 20, "weeks": 22, "takeHome": 6600,
     "scores": [3.0, 6, 7, 6, 7, 8, 6],
     "reasons": ["About $6,600 before tax over 22 weeks.", "Explaining math is engaging; grading is tedious.", "Helps students pass a class they find hard.", "Teaching sharpens communication for client-facing work.", "Hours fit around classes.", "Campus job with steady, guaranteed hours.", "On campus, but only during the term."]},
    {"id": "analyst", "title": "Junior data analyst", "company": "Teton Analytics", "location": "Idaho Falls, ID", "source": "email", "status": "unknown", "preliminary": true,
     "pay": {"min": 20, "max": 20, "period": "hour", "is_estimate": true}, "hours": 40, "weeks": 22, "takeHome": 17600,
     "scores": [6.3, 6, 5, 7, 6, 6, 5],
     "reasons": ["About $17,600 before tax over 22 weeks (estimate).", "Data work is close to what you enjoy.", "Unclear who the analysis helps.", "Data skills lead toward applied AI work.", "Likely a standard full-time schedule.", "Little detail on stability from the alert.", "A few hours from home base."]},
    {"id": "helpdesk", "title": "IT help desk technician", "company": "Gem County Schools", "location": "Emmett, ID", "source": "email", "status": "closed",
     "pay": {"min": 18, "max": 18, "period": "hour", "is_estimate": false}, "hours": 40, "weeks": 22, "takeHome": 15840,
     "scores": [5.8, 5, 6, 4, 6, 7, 6],
     "reasons": ["About $15,800 before tax over 22 weeks.", "Troubleshooting is fine, but repetitive.", "Keeps teachers and students working.", "Some technical growth, little AI work.", "School hours with summers lighter.", "Stable public employer.", "Short drive from home base."]}
  ]
}
```

With these numbers, Tutoring and the TA job fail the $8,000 minimum, five jobs pass (the closed help-desk job is hidden by default), and the dealbreaker section starts hidden because five or more pass. Under Balanced weights the order is Dev internship (7.3), Contract AI work (6.6), Junior data analyst (5.9), then Summer sales rep and Warehouse associate (3.6 each). The demo starts on the Balanced profile.

### 23.5 Review loop

1. Publish the canvas and give Justin the link with a short list of what's faked.
2. Justin comments on the canvas. Read the comments with the Artifact tool, make the changes, reply in each thread saying what you changed, and resolve threads you fully addressed.
3. Repeat until Justin says the demos are approved.
4. After approval, update section 19 and any changed behavior in sections 9 to 11 to match the demos, bump this file to v1.1 with a changelog entry, commit it, and wait for Justin to say "start Phase B."

---

## Appendix: decisions log (October 10, 2026)

| Decision | Choice |
|---|---|
| Scoring engine | OpenAI API key only. Manual scoring and Chrome on-device AI removed. |
| Pasted text | Kept. It replaces the old structured "no posting" form. |
| Surfaces | Popup and full-page app. No side panel. Setup lives in the full-page app. |
| Home screen | Ranked list. |
| Analytics | None. "Copy diagnostics" instead. |
| Email route | Read the Gmail or Outlook web page in a scheduled background window. No mail APIs. |
| Email frequency | Daily by default. Developer mode allows down to 30 seconds. |
| Unread state | Restored after reading. |
| Pay score | Computed by the app from extracted facts. |
| Pay-unit mistakes | App flags outliers, the model decides the intended unit, the user can undo. |
| Breakdown bars | Switch off by default. |
| After-the-job ratings | Not in v1. |
| Name | Fulcra, with a known conflict (section 2). |
