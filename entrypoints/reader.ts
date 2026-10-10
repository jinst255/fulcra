// Injected on demand (activeTab or host permission) to read the current page.
// executeScript returns main()'s value.
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { readPage } from '@/src/readers/generic';

export default defineUnlistedScript(() => readPage(document, location.href));
