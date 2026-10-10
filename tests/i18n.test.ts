import { describe, expect, it } from 'vitest';
import messages from '../public/_locales/en/messages.json';
import { t } from '../src/i18n/t';

describe('i18n', () => {
  it('fills {app} from appName', () => {
    expect(t('setup.key.later')).toBe("I'll add it later");
    expect(t('setup.key.laterNote')).toBe("Without a key, Fulcra saves jobs but can't score them yet.");
  });
  it('fills named placeholders and unescapes dollars', () => {
    expect(t('popup.rank', { rank: 2, total: 14 })).toBe('Rank #2 of 14');
    expect(t('popup.score.cost')).toBe('About $0.001');
  });
  it('uses only Chrome-safe keys and declares every placeholder', () => {
    for (const [key, entry] of Object.entries(
      messages as Record<string, { message: string; placeholders?: object }>,
    )) {
      expect(key).toMatch(/^[A-Za-z0-9_]+$/);
      const used = [...entry.message.matchAll(/\$([A-Za-z0-9_]+)\$/g)].map((m) => m[1]!.toLowerCase());
      const declared = Object.keys(entry.placeholders ?? {});
      expect(new Set(used)).toEqual(new Set(declared));
    }
  });
});
