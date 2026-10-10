// Default settings for a new install.
import { defaultDimensions } from './dimensions';
import { presetWeights } from './presets';
import type { Settings } from './types';

export const DEFAULT_SENDERS = [
  'jobalerts-noreply@linkedin.com',
  // Confirmed from a real Handshake job alert (Oct 10, 2026).
  'handshake@g.joinhandshake.com',
];

export const INTERVALS = { daily: 1440, sixHours: 360, hourly: 60, fiveMinutes: 5, thirtySeconds: 0.5 };

export function defaultSettings(): Settings {
  const dimensions = defaultDimensions();
  return {
    model: 'standard',
    weights: presetWeights('balanced', dimensions),
    profileId: 'balanced',
    dimensions,
    about: {
      targetWork: '',
      enjoys: '',
      homeBase: '',
      communityImportance: 'somewhat',
      remote: 'maybe',
      relocate: 'maybe',
      languages: [{ name: 'English', level: 'native' }],
      windowWeeks: 52,
      payUnit: 'hour',
      payGoal: null,
    },
    dealbreakers: {
      minTakeHome: null,
      maxHours: null,
      mustRemote: false,
      noRelocation: false,
      languageGap: true,
    },
    email: {
      accounts: [],
      intervalMinutes: INTERVALS.daily,
      senders: DEFAULT_SENDERS.slice(),
      lastCheck: null,
      importDays: 30,
    },
    scoring: { autoScore: false, upgradeOnVisit: true, notify: true, notifyThreshold: 8, spread: true },
    ui: {
      showOutsideDealbreakers: null,
      baselineOrder: [],
      lastOpenedAt: 0,
      setupSkipped: false,
      learnSuppressed: {},
      pageSize: 20,
      theme: 'system',
      jobTypes: [],
      breakdown: false,
    },
    retentionDays: 90,
    developerMode: false,
    verboseLog: false,
    showRawOutput: false,
  };
}
