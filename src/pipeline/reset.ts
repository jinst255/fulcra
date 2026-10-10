// "Reset Fulcra": back to a fresh install. Runs in the service worker so it can stop
// what's running there (alarms, batches at OpenAI) before the data goes.
import { deleteEverything } from '../store/export';
import { defaultStatus } from '../store/settings';
import { applyBadge } from './badge';
import { cancelAllRemote } from './halfprice';

export async function hardReset(): Promise<void> {
  // Needs the key, so it goes before the data.
  await cancelAllRemote().catch(() => undefined);
  await chrome.alarms.clearAll();
  await deleteEverything();
  await applyBadge(defaultStatus());
}
