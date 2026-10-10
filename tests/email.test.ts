// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildQuery, mailUrl } from '../src/email/run';
import { parseAlert } from '../src/readers/alerts';
import { unwrapLink } from '../src/readers/alerts/common';
import { threadIdOf } from '../src/readers/gmail';

const body = (name: string) =>
  new DOMParser().parseFromString(readFileSync(resolve('tests/fixtures', name), 'utf8'), 'text/html').body;

describe('alert email parsers', () => {
  it('reads LinkedIn alert cards, unwrapping Gmail links', () => {
    const cards = parseAlert(body('alert-linkedin.html'));
    expect(cards).toEqual([
      {
        title: 'Software Development Intern',
        company: 'Clearwater Analytics',
        location: 'Boise, ID',
        pay: '$25/hr',
        url: 'https://www.linkedin.com/jobs/view/4459584288/',
        site: 'linkedin',
        siteJobId: '4459584288',
      },
      {
        title: 'Intern - AI Engineering Team',
        company: 'Micron Technology',
        location: 'Boise, ID (On-site)',
        pay: null,
        url: 'https://www.linkedin.com/jobs/view/4474959082/',
        site: 'linkedin',
        siteJobId: '4474959082',
      },
    ]);
  });

  it('reads Handshake alert cards, with or without a job id', () => {
    const cards = parseAlert(body('alert-handshake.html'));
    expect(cards.map((c) => [c.title, c.company, c.location, c.siteJobId, c.pay])).toEqual([
      ['Math Teaching Assistant', 'State University', 'Boise, ID', '9876543', null],
      ['Data Analyst Intern', 'Teton Analytics', 'Idaho Falls, ID', null, '$20/hr'],
    ]);
  });

  it('unwraps redirect links', () => {
    expect(unwrapLink('https://www.google.com/url?q=https://x.com/a&sa=D')).toBe('https://x.com/a');
    expect(
      unwrapLink('https://nam12.safelinks.protection.outlook.com/?url=https%3A%2F%2Fy.com%2Fb&data=1'),
    ).toBe('https://y.com/b');
  });
});

describe('mail queries and ids', () => {
  it('builds Gmail and Outlook searches', () => {
    expect(buildQuery('gmail', ['a@x.com', 'b@y.com'], 2)).toBe('from:(a@x.com OR b@y.com) newer_than:2d');
    expect(buildQuery('gmail', ['a@x.com'], null)).toBe('from:(a@x.com)');
    expect(buildQuery('outlook', ['a@x.com', 'b@y.com'], 30)).toBe('from:a@x.com OR from:b@y.com');
    expect(mailUrl('gmail', 1)).toBe('https://mail.google.com/mail/u/1/#inbox');
  });

  it('reads Gmail thread ids from either attribute', () => {
    const row = document.createElement('tr');
    row.innerHTML = '<span data-thread-id="#thread-f:1789012345678901234"></span>';
    expect(threadIdOf(row)).toBe(BigInt('1789012345678901234').toString(16));
    row.innerHTML = '<span data-legacy-thread-id="18d3a1b2c3d4e5f6"></span>';
    expect(threadIdOf(row)).toBe('18d3a1b2c3d4e5f6');
  });
});
