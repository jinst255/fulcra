// Is the person using Fulcra right now? Decides how bulk scoring runs: direct calls when they're
// here and want results, OpenAI's half-price Batch API when they're away and can wait.
// Runs in the service worker. Fulcra's pages report in while they're showing (see usePresence).

const SEEN_KEY = 'presenceSeenAt';
/** Pages report every 30 seconds while visible; allow for a missed beat. */
const FRESH_MS = 90 * 1000;
/** No keyboard or mouse input for this long counts as away, even with Fulcra on screen. */
const IDLE_SECONDS = 5 * 60;

let seenAt = 0;

/** A Fulcra page is showing. */
export async function markPresent(now = Date.now()): Promise<void> {
  seenAt = now;
  // Survives the service worker restarting while the page stays open.
  await chrome.storage.session?.set({ [SEEN_KEY]: now }).catch(() => undefined);
}

async function lastSeen(): Promise<number> {
  if (seenAt) return seenAt;
  try {
    return ((await chrome.storage.session.get(SEEN_KEY))[SEEN_KEY] as number | undefined) ?? 0;
  } catch {
    return 0;
  }
}

async function computerActive(): Promise<boolean> {
  try {
    return (await chrome.idle.queryState(IDLE_SECONDS)) === 'active';
  } catch {
    return true;
  }
}

/** True when a Fulcra page was showing in the last 90 seconds and the computer isn't idle or locked. */
export async function isPresent(now = Date.now()): Promise<boolean> {
  if (now - (await lastSeen()) > FRESH_MS) return false;
  return computerActive();
}

export function resetPresenceForTests(): void {
  seenAt = 0;
}
