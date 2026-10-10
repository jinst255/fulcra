// Live smoke test against the real OpenAI API. Skipped unless FULCRA_KEY_FILE points to a file
// holding a key (keep it outside the repo). Costs well under a cent per run.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultDimensions } from '../../src/core/dimensions';
import { costPerCall } from '../../src/llm/cost';
import { OpenAIProvider } from '../../src/llm/openai';
import { SAMPLE_ABOUT } from '../../src/dev/sample';

const keyFile = process.env.FULCRA_KEY_FILE;
const key = keyFile ? readFileSync(keyFile, 'utf8').trim() : '';
const listing = readFileSync(new URL('../fixtures/listing-dev.txt', import.meta.url), 'utf8');

let spent = 0;
function track(label: string, u: { inputTokens: number; outputTokens: number; cachedTokens: number }) {
  const c = costPerCall('standard', { in: u.inputTokens, out: u.outputTokens });
  spent += c;
  console.warn(
    `${label}: in ${u.inputTokens} (cached ${u.cachedTokens}), out ${u.outputTokens}, ~$${c.toFixed(5)}; total ~$${spent.toFixed(5)}`,
  );
}

describe.skipIf(!key)('OpenAI live', () => {
  const p = new OpenAIProvider();

  it('tests the key', async () => {
    expect(await p.testKey(key)).toBe('ok');
    expect(await p.testKey('sk-not-a-real-key-000000000000')).toBe('bad');
  }, 60000);

  it('scores a listing with valid structured output and ignores injected instructions', async () => {
    const r = await p.score(key, {
      model: 'standard',
      about: SAMPLE_ABOUT,
      dims: defaultDimensions(),
      listing,
      preliminary: false,
    });
    track('score', r.usage);
    console.warn(r.raw);
    const f = r.output.facts!;
    expect(f.pay.period).toBe('hour');
    expect(f.pay.min).toBe(24);
    expect(f.duration_weeks).toBe(15);
    expect(Object.keys(r.output.scores).sort()).toEqual([
      'career',
      'enjoyment',
      'impact',
      'life',
      'location',
      'risk',
    ]);
    const all10 = Object.values(r.output.scores).every((s) => s.score === 10);
    expect(all10).toBe(false);
  }, 120000);
});
