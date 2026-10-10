# Changelog

## 0.1.0 (unreleased)

First build of Fulcra.

- Score job postings on LinkedIn, Handshake, Indeed, and any other page, or from pasted text and links, with your own OpenAI key.
- Seven dimensions by default (pay, enjoyment, impact, career leverage, life cost, risk, location and social), up to 12 of your own, with versioned re-scoring.
- Pay and the overall score computed by Fulcra, with pay-unit correction and undo.
- Ranked list with breakdown bars, live sliders and starting profiles, dealbreakers, and a job detail drawer with your own scores.
- Radar comparing up to three jobs, with "What stands out."
- First-run setup, full settings, export, and delete everything.
- Job alert emails from Gmail and Outlook with preliminary scores, scheduled checks, and strong-match notifications.
- Right-click menu, Alt+Shift+F shortcut, and toolbar badge.
- Half-price scoring through OpenAI's Batch API for jobs found while you're away, with a Score now button (and its price) for when you're back; six scoring requests at once otherwise.
- Scores spread across your jobs, a stricter scoring prompt, and facts (remote, relocation, languages) filled in instead of left blank. Re-score all.
- Edit a score in place; pages of 10 to 100 jobs; closed postings and non-job emails fold away; the radar compares any number of jobs, with missing scores in red.
- Email checks report what happened, read past imports in full, pick the Gmail account, and switch between Gmail and Outlook directly.
- Dark mode.
- Several inboxes at once (say, a Gmail and an Outlook), checked in a collapsed "Fulcra" tab group instead of a minimized window.
- Outlook reading copes with more layouts (folded search box, newer message list and body markup, the outlook.cloud.microsoft address), and Copy diagnostics says which step of an email check failed.
- Pay: a "No set time frame" choice, and a pay goal and minimum per hour, per year, or in total. Impossible pay units ("$110,000 an hour") are fixed.
- A job type filter on the ranked list and radar, instead of a "job types to skip" dealbreaker.
- The radar opens a job when you click its name and highlights it when you hover.
- Setup: Skip this step skips one step; the priority sliders explain each dimension and what 0 and 10 mean.
- Setup is four steps: Continue tests the key (and a saved key can be replaced), priorities and dealbreakers moved to the ranked list, at least one inbox is required, and Change links on the summary come straight back.
- Filters above the ranked list and radar: job type plus remote, relocating, languages, lowest pay, and most hours. Dealbreakers are now called filters.
- An Edit button on What matters most opens Settings > Priorities.
- Reset Fulcra: a hard reset back to a fresh install.
- No more Score now / Half price / Later question: Fulcra scores right away while you're using it and at half price while you're away, and nothing is left unscored.
