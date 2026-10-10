# Fulcra privacy policy

_Last updated: October 10, 2026 (half-price scoring added)_

Fulcra is a browser extension that scores job postings. It has no servers, no accounts, and no analytics. This page explains exactly what it does with your data.

## What leaves your computer

Only one thing, and only when a job is scored: Fulcra sends the job listing text, your answers from "About you" (the work you're aiming for, what you enjoy, your home base, your languages, and whether you're open to remote work or relocating), and the definitions of what you've chosen to score to **OpenAI's API at `api.openai.com`**, using your own OpenAI API key. OpenAI's handling of that data is covered by [OpenAI's policies](https://openai.com/policies). Fulcra asks OpenAI not to store responses (`store: false`).

**Half-price scoring.** If you choose Half price for a large batch, Fulcra sends the same information through OpenAI's Batch API: it uploads the requests as a file to your OpenAI account, and OpenAI returns the results as another file. Fulcra deletes both files once the results are in (or, if you cancel, once the cancel completes).

Fulcra sends nothing else, to anyone, ever. It has no analytics, crash reporting, or telemetry, and it loads no remote code or fonts.

## What stays on your computer

- **Jobs:** listing text, extracted facts, scores, and your own scores, in the extension's IndexedDB.
- **Settings and your API key:** in `chrome.storage.local`. They never sync to your Google account (`chrome.storage.sync` is never used).
- **A local log** of the last 500 events (time, a code, and a short note). It never contains your key, job text, or email content.

**Your API key is not encrypted at rest.** Chrome's extension storage is not encrypted, so anyone who can access your browser profile could read it. Set a monthly spend limit in your OpenAI account, and delete the key there if your computer is lost.

## Job alert emails

If you connect Gmail or Outlook (one inbox or several), Fulcra opens each inbox in turn in a background tab, tucked into a collapsed tab group named Fulcra, on the schedule you choose, searches only for emails from the alert senders listed in Settings (LinkedIn and Handshake by default), reads the job cards in those emails, marks them unread again, and closes the tab. It reads no other email: in Outlook, Fulcra checks that each message it opens shows an alert sender's address and stops if one doesn't. It uses your existing signed-in session in Chrome and never sees your password. Email content is not sent anywhere; only the job title, company, location, and pay from each alert are sent to OpenAI for a preliminary score.

## Job pages

Fulcra reads a page only when you ask it to (the popup, the right-click menu, or the keyboard shortcut), or, on LinkedIn, Handshake, and Indeed, to update a job you've already saved or to auto-score if you turned that on. It never fetches LinkedIn pages in the background.

## Deleting your data

- **Settings > Your data > Reset Fulcra** removes all jobs, settings, inboxes, the log, and your key from Fulcra, cancels any half-price batch still at OpenAI and deletes its files, and starts setup again.
- **Removing the extension** makes Chrome delete all of Fulcra's storage.
- **Your key still exists in your OpenAI account** after either one. Delete it at [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

Fulcra keeps jobs for 90 days after you last saw them by default (Settings > Your data).

## Permissions

| Permission                       | Why                                                                               |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `storage`, `unlimitedStorage`    | Save your jobs and settings on this computer                                      |
| `alarms`                         | Run scheduled email checks and retry scoring                                      |
| `tabs`, `scripting`, `activeTab` | Read the job page you ask Fulcra to score, and run email checks                   |
| `tabGroups`                      | Keep the email-check tab in a collapsed "Fulcra" group instead of among your tabs |
| `contextMenus`                   | "Score this job with Fulcra" on right-click                                       |
| `notifications`                  | Tell you about strong matches from email checks                                   |
| LinkedIn, Handshake, Indeed      | Read job postings on these sites                                                  |
| Gmail, Outlook                   | Read job alert emails, if you connect an inbox                                    |
| `api.openai.com`                 | Score jobs with your key                                                          |
| Other sites (optional)           | Asked one site at a time, only when you paste a link from a site not listed above |

## Contact

Questions or problems: [github.com/jinst255/fulcra/issues](https://github.com/jinst255/fulcra/issues).
