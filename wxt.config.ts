import { defineConfig } from 'wxt';

// Manifest fields, permissions, and entrypoints. Blueprint sections 8, 15, and 18.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  // No web-ext: it's MPL-licensed and pulls in vulnerable dev dependencies.
  // Dev mode still hot-reloads; load .output/chrome-mv3-dev once as an unpacked extension.
  webExt: { disabled: true },
  manifest: {
    name: '__MSG_appName__',
    description: '__MSG_appShortDescription__',
    default_locale: 'en',
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    action: {
      default_title: '__MSG_appName__',
      default_icon: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png' },
    },
    permissions: [
      'storage',
      'unlimitedStorage',
      'alarms',
      'tabs',
      // A collapsed "Fulcra" group holds the inbox tab while an email check runs.
      'tabGroups',
      'scripting',
      'activeTab',
      'contextMenus',
      'notifications',
      // Away from the computer: bulk scoring waits for OpenAI's half-price batch.
      'idle',
    ],
    // Asked for one site at a time, only when you paste a link from a site not listed below.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    host_permissions: [
      'https://www.linkedin.com/*',
      'https://app.joinhandshake.com/*',
      'https://*.joinhandshake.com/*',
      'https://www.indeed.com/*',
      'https://mail.google.com/*',
      'https://outlook.live.com/*',
      'https://outlook.office.com/*',
      'https://outlook.cloud.microsoft/*',
      'https://api.openai.com/*',
    ],
    commands: {
      'score-page': {
        suggested_key: { default: 'Alt+Shift+F' },
        description: '__MSG_command_score__',
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'; connect-src 'self' https://api.openai.com",
    },
  },
});
