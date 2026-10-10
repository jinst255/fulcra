// Reads Linkedin job pages as you browse them, for preliminary-score upgrades and auto-scoring.
import { defineContentScript } from 'wxt/utils/define-content-script';
import { watchJobPages } from '@/src/readers/watch';

export default defineContentScript({
  // All of LinkedIn: it's a single-page app, so you can reach a job without a page load.
  matches: ['https://www.linkedin.com/*'],
  runAt: 'document_idle',
  main(ctx) {
    watchJobPages(ctx);
  },
});
