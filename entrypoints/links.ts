// Injected on demand (activeTab) to list the jobs the current page links to.
// executeScript returns main()'s value.
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { findJobLinks } from '@/src/readers/links';

export default defineUnlistedScript(() => findJobLinks(document, location.href));
