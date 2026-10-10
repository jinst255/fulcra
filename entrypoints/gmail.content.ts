// Runs only in the background check window, injected by the service worker. Blueprint section 9.4.
import { defineContentScript } from 'wxt/utils/define-content-script';
import { readAlerts, signInCheck } from '@/src/readers/gmail';

export default defineContentScript({
  matches: ['https://mail.google.com/*'],
  registration: 'runtime',
  main() {
    const args = window.__fulcraMail;
    if (!args) return null;
    return args.mode === 'signin' ? signInCheck(args) : readAlerts(args);
  },
});
