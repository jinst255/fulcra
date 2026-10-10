// Runs only in the background check window, injected by the service worker. Blueprint section 9.4.
import { defineContentScript } from 'wxt/utils/define-content-script';
import { outlookReadAlerts, outlookSignInCheck } from '@/src/readers/outlook';

export default defineContentScript({
  matches: ['https://outlook.live.com/*', 'https://outlook.office.com/*'],
  registration: 'runtime',
  main() {
    const args = window.__fulcraMail;
    if (!args) return null;
    return args.mode === 'signin'
      ? outlookSignInCheck()
      : outlookReadAlerts({
          query: args.query ?? '',
          senders: args.senders ?? [],
          seen: args.seen ?? [],
          max: args.max ?? 40,
        });
  },
});
