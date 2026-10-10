# Changelog

## 0.1.0 (October 10, 2026)

The first release of Fulcra.

### Scoring

- Score any job posting on LinkedIn, Handshake, Indeed, or any other site, or paste a link or the text of an offer. Use the popup, the right-click menu, or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>.
- Seven dimensions to start with: pay, enjoyment, impact, career leverage, life cost, risk, and location and social. Rename or remove them, or add up to 12 of your own. Each built-in one gives the AI a rubric, and every score comes with a one-line reason.
- Pay and the overall score are worked out by Fulcra, not the AI. Pay can be compared over a time frame or as a rate, with your goal and minimum per hour, per year, or in total. Impossible pay units, like "$110,000 an hour", are fixed, with an Undo.
- Scores are spread across your jobs, so the best and weakest on each dimension are easy to see. You can turn this off.
- Disagree with a score? Type your own. If you keep correcting the same thing, Fulcra offers to change that weight.

### Comparing

- A ranked list that reorders as you move the sliders in What matters most, with starting profiles, a breakdown of what makes up each score, and arrows showing how far each job moved.
- A radar that compares any number of jobs. Click a dimension to sort by it.
- Filters for job type, remote or hybrid, no relocating, languages, lowest pay, and most hours. Jobs that miss a must-have are set aside, not deleted.
- Closed postings and anything that isn't a job fold away at the bottom.
- Light and dark mode.

### Job alert emails

- Fulcra reads job alerts from Gmail and Outlook on the web, from any mix of inboxes, on a schedule you choose. It works in a background tab inside a collapsed Fulcra tab group.
- LinkedIn and Handshake alerts, including Handshake's weekly round-up, are read by their layout. Alerts from any other sender you add (Indeed, a company's careers site, or a friend who forwards jobs) are read from links that look like jobs.
- Only emails from your alert senders are read, and they stay marked unread.
- Import past alerts from the last 7, 30, or 90 days, or everything, with an estimate of the jobs and cost first.
- Every check says what it found. If it found nothing new, it says why: no job listings in the emails, or only jobs you already have.

### Cost and your OpenAI key

- Scoring uses your own OpenAI key: about $1.20 per 1,000 jobs on Standard, or $4.50 on Sharper.
- Jobs found while you're away, like from an overnight email check, are scored at half price through OpenAI's Batch API. When you come back, Score now finishes them right away and shows the price.
- Fulcra tests your key before saving it, ignores stray spaces and invisible characters picked up when copying, and always says plainly when a key doesn't work. A job added while the key is broken is saved and scored once it's fixed.

### Privacy

- No accounts, servers, or analytics. Only the job text, your About you answers, and your dimension definitions are sent, and only to OpenAI.
- Settings > Your data > Reset Fulcra deletes everything and starts over. Copy diagnostics helps report a problem without sharing your key, jobs, or emails.
