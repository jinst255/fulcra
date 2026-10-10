// Calibration check against the real API: scores varied listings for one person and reports how
// spread out the scores are and how many facts come back blank. Skipped without FULCRA_KEY_FILE.
// About $0.01 per run on Standard.
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultDimensions, modelDimensions } from '../../src/core/dimensions';
import { costPerCall } from '../../src/llm/cost';
import { OpenAIProvider } from '../../src/llm/openai';
import { SAMPLE_ABOUT } from '../../src/dev/sample';

const keyFile = process.env.FULCRA_KEY_FILE;
const key = keyFile ? readFileSync(keyFile, 'utf8').trim() : '';

/** Short ones are what an alert email gives; the rest are full postings from different fields. */
export const CALIBRATION_LISTINGS: { id: string; preliminary: boolean; text: string }[] = [
  {
    id: 'email-swe',
    preliminary: true,
    text: 'Software Engineer I\nAcme Robotics\nDenver, CO (Hybrid)\n$95K-$120K / year\nPosting: https://www.linkedin.com/jobs/view/4400000001/',
  },
  {
    id: 'email-clinic',
    preliminary: true,
    text: 'Patient Access Coordinator\nOhioHealth\nColumbus, OH (On-site)\n$19-$22 / hour\nPosting: https://www.linkedin.com/jobs/view/4400000002/',
  },
  {
    id: 'email-warehouse',
    preliminary: true,
    text: 'Warehouse Associate - Night Shift\nValley Distribution\nGrove City, OH\nPosting: https://www.linkedin.com/jobs/view/4400000003/',
  },
  {
    id: 'support-remote',
    preliminary: false,
    text: `Customer Support Specialist (Part-time, Remote)
Brightline Software · Remote (US)
$16/hour · 20 hours per week, flexible schedule
You'll answer chat and email questions from small-business customers, write help articles, and flag bugs to engineering. Training is paid and fully online. Requirements: clear written English, comfort with software, a quiet place to work. No phone calls. Ongoing role; many people stay for years.`,
  },
  {
    id: 'sales-summer',
    preliminary: false,
    text: `Summer Sales Representative — Earn $30K+ this summer!
Summit Pest Solutions · Dallas, TX (relocation required, housing provided at cost)
May to August. Door-to-door residential sales, six days a week, 10-12 hour days. 100% commission; top reps earn $30,000+, average first-year reps earn $8,000-$15,000. No experience needed. Must be willing to relocate to Texas for the summer.`,
  },
  {
    id: 'hospital-tech',
    preliminary: false,
    text: `Patient Care Technician — Nights
Riverside Methodist Hospital · Columbus, OH · On-site
$19.50/hour plus $3/hour night differential, full time, 3 x 12-hour shifts per week.
Help nurses with vital signs, patient mobility, and hygiene on a busy medical-surgical unit. Tuition reimbursement for healthcare degrees, and a path into unit operations roles after one year. Requires BLS certification (we'll pay for it) and the ability to lift 50 lbs. Spanish speakers encouraged to apply.`,
  },
  {
    id: 'ml-senior',
    preliminary: false,
    text: `Senior Machine Learning Engineer
Quantix Capital · New York, NY · On-site 5 days
$200,000-$250,000 base + bonus. Build trading signal models in Python and C++. Requires 7+ years of production ML experience, a graduate degree in a quantitative field, and on-call rotation. Fast-paced, long hours during market events.`,
  },
  {
    id: 'nonprofit-coord',
    preliminary: false,
    text: `Program Coordinator, Community Health
Mid-Ohio Food Collective · Grove City, OH · Hybrid (2 days in office)
$48,000/year, full benefits, 40 hours/week.
Coordinate mobile food pantry and health screening events across central Ohio: schedule volunteers, track supplies, and report outcomes to partner clinics. Some weekend events (about one a month). Bilingual Spanish/English a plus.`,
  },
];

/** Similar alerts, the hard case: entry-level software jobs that differ only in the details. */
export const SIMILAR_LISTINGS: { id: string; preliminary: boolean; text: string }[] = [
  ['acme-denver', 'Software Engineer I\nAcme Robotics\nDenver, CO (Hybrid)\n$95K-$120K / year'],
  ['birch-austin', 'Junior Backend Developer\nBirch Health\nAustin, TX'],
  [
    'northwind-sf',
    'Software Engineer, New Grad\nNorthwind Payments\nSan Francisco, CA (On-site)\n$140K-$165K / year',
  ],
  [
    'contoso-remote',
    'Associate Software Engineer\nContoso Insurance\nColumbus, OH (Remote)\n$70K-$85K / year',
  ],
  [
    'fabrikam-contract',
    'Entry Level Python Developer (6-month contract)\nFabrikam Staffing\nUnited States (Remote)\n$25-$30 / hour',
  ],
  ['lumen-intern', 'Software Engineer Intern - AI Platform\nLumen AI\nSeattle, WA (Hybrid)\n$45 / hour'],
  ['tailspin-qa', 'QA Automation Engineer I\nTailspin Toys\nDallas, TX (On-site)'],
  ['litware-ai', 'Junior AI Tools Developer\nLitware Labs\nColumbus, OH (Hybrid)\n$80K-$95K / year'],
].map(([id, text]) => ({
  id: id!,
  preliminary: true,
  text: `${text}\nPosting: https://www.linkedin.com/jobs/view/44000000${id!.length}/`,
}));

const DEV_ABOUT = {
  ...SAMPLE_ABOUT,
  targetWork: 'Software engineering, ideally building AI tools',
  enjoys: 'Building software and solving hard technical problems',
  communityImportance: 'somewhat' as const,
};

describe.skipIf(!key)('scoring calibration (live)', () => {
  it('spreads scores and fills facts across different kinds of jobs', async () => {
    await calibrate('varied', CALIBRATION_LISTINGS, SAMPLE_ABOUT);
  });
  it('tells similar alerts apart', async () => {
    await calibrate('similar', SIMILAR_LISTINGS, DEV_ABOUT);
  });
});

async function calibrate(
  label: string,
  listings: { id: string; preliminary: boolean; text: string }[],
  about: typeof SAMPLE_ABOUT,
): Promise<void> {
  {
    const p = new OpenAIProvider();
    const dims = modelDimensions(defaultDimensions());
    const rows: {
      id: string;
      scores: Record<string, number>;
      facts: Record<string, unknown>;
      reasons: string[];
    }[] = [];
    let spent = 0;
    const results = await Promise.all(
      listings.map((l) =>
        p.score(key, {
          model: 'standard',
          about,
          dims: defaultDimensions(),
          listing: l.text,
          preliminary: l.preliminary,
        }),
      ),
    );
    results.forEach((r, i) => {
      spent += costPerCall('standard', { in: r.usage.inputTokens, out: r.usage.outputTokens });
      const f = r.output.facts!;
      rows.push({
        id: listings[i]!.id,
        scores: Object.fromEntries(dims.map((d) => [d.id, r.output.scores[d.id]!.score])),
        facts: {
          remote: f.remote,
          reloc: f.relocation_required,
          langs: f.languages_required.join('/') || '-',
          hours: f.hours_per_week,
          weeks: f.duration_weeks,
          type: f.job_type,
          flags: r.output.flags.join(','),
        },
        reasons: dims.map((d) => r.output.scores[d.id]!.reason),
      });
    });
    const lines = rows.map(
      (r) =>
        `${r.id.padEnd(16)} ${dims.map((d) => String(r.scores[d.id]).padStart(3)).join('')}  ${JSON.stringify(r.facts)}`,
    );
    const sd = dims.map((d) => {
      const v = rows.map((r) => r.scores[d.id]!);
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    });
    const all = rows.flatMap((r) => Object.values(r.scores));
    const middle = all.filter((s) => s >= 5 && s <= 7).length / all.length;
    const blanks = rows.reduce(
      (n, r) =>
        n +
        (r.facts.remote === 'unknown' ? 1 : 0) +
        (r.facts.reloc === 'unknown' ? 1 : 0) +
        (r.facts.langs === '-' ? 1 : 0),
      0,
    );
    const report = [
      `${''.padEnd(16)} ${dims.map((d) => d.id.slice(0, 3).padStart(3)).join('')}`,
      ...lines,
      `stdev per dimension: ${sd.map((x) => x.toFixed(1)).join(' ')}  (mean ${(sd.reduce((a, b) => a + b, 0) / sd.length).toFixed(2)})`,
      `share of scores in 5-7: ${(middle * 100).toFixed(0)}%`,
      `unknown remote/relocation/languages: ${blanks} of ${rows.length * 3}`,
      `cost ~$${spent.toFixed(4)}`,
      '',
      ...rows.map((r) => `${r.id}: ${r.reasons.join(' | ')}`),
    ].join('\n');
    console.warn(report);
    if (process.env.CALIBRATION_OUT) writeFileSync(`${process.env.CALIBRATION_OUT}-${label}.txt`, report);
    expect(rows).toHaveLength(listings.length);
  }
}
