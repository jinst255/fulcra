import 'fake-indexeddb/auto';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { beforeEach } from 'vitest';

// Code under test uses the global `chrome`, as the extension does in Chrome.
(globalThis as unknown as { chrome: unknown }).chrome = fakeBrowser;

function stubI18n() {
  // Empty means "not found", so t() formats from the bundled en messages.
  (fakeBrowser.i18n as unknown as { getMessage: () => string }).getMessage = () => '';
}
stubI18n();

beforeEach(() => {
  fakeBrowser.reset();
  stubI18n();
});
