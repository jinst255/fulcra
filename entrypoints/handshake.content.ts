// Reads Handshake job pages as you browse them, for preliminary-score upgrades and auto-scoring.
import { defineContentScript } from 'wxt/utils/define-content-script';
import { watchJobPages } from '@/src/readers/watch';

export default defineContentScript({
  matches: ['https://app.joinhandshake.com/*', 'https://*.joinhandshake.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    watchJobPages(ctx);
  },
});
