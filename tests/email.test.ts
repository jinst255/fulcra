// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildQuery, checkWindowDays, mailUrl, mailUrls, splitWindow } from '../src/email/run';
import { parseAlert } from '../src/readers/alerts';
import { looksLikeJobTitle, unwrapLink } from '../src/readers/alerts/common';
import { countFrom, threadIdOf } from '../src/readers/gmail';
import {
  fromAlertSender,
  isOutlookHost,
  layoutHint,
  noResultsShown,
  rowAddress,
} from '../src/readers/outlook';
import { withDefaults } from '../src/store/settings';

const body = (name: string) =>
  new DOMParser().parseFromString(readFileSync(resolve('tests/fixtures', name), 'utf8'), 'text/html').body;

describe('alert email parsers', () => {
  it('reads LinkedIn alert cards, unwrapping Gmail links', () => {
    const cards = parseAlert(body('alert-linkedin.html'));
    expect(cards).toEqual([
      {
        title: 'Software Development Intern',
        company: 'Northwind Analytics',
        location: 'Columbus, OH',
        pay: '$25/hr',
        url: 'https://www.linkedin.com/jobs/view/4459584288/',
        site: 'linkedin',
        siteJobId: '4459584288',
      },
      {
        title: 'Intern - AI Engineering Team',
        company: 'Contoso Devices',
        location: 'Columbus, OH (On-site)',
        pay: null,
        url: 'https://www.linkedin.com/jobs/view/4474959082/',
        site: 'linkedin',
        siteJobId: '4474959082',
      },
    ]);
  });

  it('reads the 2026 LinkedIn layout, where one link wraps the whole card', () => {
    const cards = parseAlert(body('alert-linkedin-2026.html'));
    expect(cards.map((c) => [c.title, c.company, c.location, c.pay, c.siteJobId])).toEqual([
      ['Software Engineer I', 'Acme Robotics', 'Denver, CO (Hybrid)', '$95K-$120K / year', '4400000001'],
      ['Junior Backend Developer', 'Birch Health', 'Austin, TX', null, '4400000002'],
    ]);
  });

  it('reads Handshake alert cards, with or without a job id', () => {
    const cards = parseAlert(body('alert-handshake.html'));
    expect(cards.map((c) => [c.title, c.company, c.location, c.siteJobId, c.pay])).toEqual([
      ['Math Teaching Assistant', 'Riverside University', 'Columbus, OH', '9876543', null],
      ['Data Analyst Intern', 'Fabrikam Analytics', 'Dayton, OH', null, '$20/hr'],
    ]);
  });

  it('keeps promotions and account emails out of the job list', () => {
    for (const promo of [
      'Last chance to subscribe',
      'Try Premium for free',
      'Unsubscribe',
      'Manage your alerts',
      'Save 50% off your first month',
      'Sign up for our webinar',
      "Don't miss out!",
    ])
      expect(looksLikeJobTitle(promo), promo).toBe(false);
    for (const job of [
      'Event Coordinator',
      'Premium Account Manager',
      'Survey Technician',
      'Software Engineer I',
    ])
      expect(looksLikeJobTitle(job), job).toBe(true);
    const doc = new DOMParser().parseFromString(
      `<table><tr><td><a href="https://click.joinhandshake.com/ls/click?upn=a">Last chance to subscribe to Handshake Premium</a></td></tr></table>
       <table><tr><td><a href="https://click.joinhandshake.com/ls/click?upn=b">Spring career fair</a></td></tr></table>`,
      'text/html',
    );
    expect(parseAlert(doc.body)).toEqual([]);
  });

  it('reads job alerts from senders it has no layout for', () => {
    const html = (h: string) => new DOMParser().parseFromString(h, 'text/html').body;
    // Indeed-style: tracked job links, company and place under each title.
    const indeed = parseAlert(
      html(`<p>Jobs for you</p>
       <table><tr><td><a href="https://www.indeed.com/rc/clk?jk=abc123">Patient Access Representative</a>
         <div>OhioHealth</div><div>Columbus, OH 43215</div><div>$17 - $20 an hour</div></td></tr></table>
       <table><tr><td><a href="https://www.indeed.com/rc/clk?jk=def456">Medical Scheduler</a>
         <div>Mount Carmel</div><div>Remote</div></td></tr></table>
       <p><a href="https://www.indeed.com/jobs?q=healthcare">See more jobs</a> ·
         <a href="https://www.indeed.com/unsubscribe">Unsubscribe</a> · <a href="https://www.indeed.com/legal">Privacy</a></p>`),
    );
    expect(indeed.map((c) => [c.title, c.company, c.location, c.pay, c.site])).toEqual([
      ['Patient Access Representative', 'OhioHealth', 'Columbus, OH 43215', '$17 - $20 an hour', null],
      ['Medical Scheduler', 'Mount Carmel', 'Remote', null, null],
    ]);
    // A company's own alert: no job words in the links, but role names beside a place.
    const careers = parseAlert(
      html(`<ul><li><a href="https://acme.example/r/8812">Warehouse Associate</a><br>Grove City, OH</li>
       <li><a href="https://acme.example/r/8813">Forklift Operator</a><br>Grove City, OH</li></ul>`),
    );
    expect(careers.map((c) => c.title)).toEqual(['Warehouse Associate', 'Forklift Operator']);
    // A LinkedIn alert forwarded inline still reads with the LinkedIn layout.
    const fwd = parseAlert(
      html(`<p>---------- Forwarded message ---------<br>From: LinkedIn Job Alerts &lt;jobalerts-noreply@linkedin.com&gt;</p>
       <table><tr><td><a href="https://www.linkedin.com/comm/jobs/view/4400000009/">Clinic Coordinator</a>
       <div>Riverside Health · Columbus, OH</div></td></tr></table>`),
    );
    expect(fwd.map((c) => [c.title, c.site])).toEqual([['Clinic Coordinator', 'linkedin']]);
  });

  it('finds no jobs in ordinary mail with links', () => {
    const html = (h: string) => new DOMParser().parseFromString(h, 'text/html').body;
    expect(
      parseAlert(
        html(`<p>Hey! Photos from Saturday are <a href="https://photos.example/a">here</a>.
         Also this article: <a href="https://news.example/story">Why cities are getting hotter</a></p>`),
      ),
    ).toEqual([]);
    expect(
      parseAlert(
        html(`<h1>Weekly digest</h1><p><a href="https://blog.example/p/1">Five tips for better sleep</a></p>
         <p><a href="https://blog.example/p/2">Our spring sale starts now</a></p>
         <p><a href="https://blog.example/settings">Manage your preferences</a> <a href="https://x.com/blog">Twitter</a></p>`),
      ),
    ).toEqual([]);
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
    expect(buildQuery('outlook', ['a@x.com', 'b@y.com'], 30)).toBe('from:a@x.com\nfrom:b@y.com');
    expect(mailUrl('gmail', 1)).toBe('https://mail.google.com/mail/u/1/#inbox');
    expect(buildQuery('gmail', ['a@x.com'], 30, 15)).toBe('from:(a@x.com) older_than:15d newer_than:30d');
    expect(mailUrls('outlook', 0)).toEqual([
      'https://outlook.live.com/mail/0/',
      'https://outlook.office.com/mail/',
    ]);
  });

  it('looks back to the last good check, 2 to 30 days', () => {
    const day = 86400000;
    const now = 100 * day;
    expect(checkWindowDays(null, now)).toBe(2);
    expect(checkWindowDays(now - day / 2, now)).toBe(2);
    expect(checkWindowDays(now - 6.5 * day, now)).toBe(8);
    expect(checkWindowDays(now - 90 * day, now)).toBe(30);
  });

  it('splits ranges with more than a page of results, newer half first', () => {
    expect(splitWindow({ older: 0, newer: 30 })).toEqual([
      { older: 0, newer: 15 },
      { older: 15, newer: 30 },
    ]);
    expect(splitWindow({ older: 4, newer: 5 })).toBeNull();
    expect(splitWindow({ older: 0, newer: null })).toEqual([
      { older: 0, newer: 30 },
      { older: 30, newer: null },
    ]);
    expect(splitWindow({ older: 60, newer: null })).toEqual([
      { older: 60, newer: 120 },
      { older: 120, newer: null },
    ]);
  });

  it('only reads an Outlook message that shows an alert sender', () => {
    const pane = document.createElement('div');
    pane.innerHTML = '<span title="jobalerts-noreply@linkedin.com">LinkedIn</span>';
    expect(fromAlertSender(pane, ['jobalerts-noreply@linkedin.com'])).toBe(true);
    pane.innerHTML = '<span title="friend@example.com">A friend</span><p>jobalerts-noreply@linkedin.com</p>';
    expect(fromAlertSender(pane, ['handshake@g.joinhandshake.com'])).toBe(false);
  });

  it("tells Outlook's no-results note and other people's rows apart from alerts", () => {
    const doc = new DOMParser().parseFromString(
      `<div aria-label="Message list"><div><span>No results found for from:a@x.com</span></div>
       <div role="option" data-convid="a"><span title="Friend@Example.com">Friend</span> No results yet</div></div>`,
      'text/html',
    );
    expect(noResultsShown(doc)).toBe(true);
    expect(noResultsShown(doc, 'from:a@x.com')).toBe(true);
    expect(noResultsShown(doc, 'from:b@y.com')).toBe(false);
    expect(rowAddress(doc.querySelector('[role="option"]')!)).toBe('friend@example.com');
    doc.querySelector('span')!.remove();
    // Text inside a message row is never taken as Outlook's note.
    expect(noResultsShown(doc)).toBe(false);
    const bare = doc.createElement('div');
    bare.innerHTML = '<span title="Friend">Friend</span>';
    expect(rowAddress(bare)).toBe(null);
  });

  it('knows every Outlook mail address, including the cloud.microsoft move', () => {
    expect(['outlook.live.com', 'outlook.office.com', 'outlook.cloud.microsoft'].every(isOutlookHost)).toBe(
      true,
    );
    expect(isOutlookHost('www.microsoft.com')).toBe(false);
    expect(isOutlookHost('outlook.cloud.microsoft.evil.com')).toBe(false);
  });

  it('describes the Outlook page with counts, never its text', () => {
    const doc = new DOMParser().parseFromString(
      `<div aria-label="Message list"><div role="option" data-convid="a">Secret subject</div>
       <div role="option" data-convid="b">Another</div></div><input id="topSearchInput">`,
      'text/html',
    );
    const hint = layoutHint(doc);
    expect(hint).toContain('box=1 list=1 opt=2 conv=2 item=0 body=0');
    expect(hint).not.toMatch(/Secret|Another/);
  });

  it('replaces the old guessed Handshake sender', () => {
    const s = withDefaults({
      email: { senders: ['jobalerts-noreply@linkedin.com', 'notifications@joinhandshake.com'] },
    } as never);
    expect(s.email.senders).toEqual(['jobalerts-noreply@linkedin.com', 'handshake@g.joinhandshake.com']);
  });

  it('turns the one inbox of older builds into a list of inboxes', () => {
    const s = withDefaults({
      email: { provider: 'gmail', accountIndex: 1, lastOkAt: 123, lastCheck: null, senders: [] },
    } as never);
    expect(s.email.accounts).toEqual([
      { id: 'gmail:1', provider: 'gmail', index: 1, address: null, lastCheck: null, lastOkAt: 123 },
    ]);
    expect('provider' in s.email).toBe(false);
    const o = withDefaults({ email: { provider: 'outlook', accountIndex: 0 } } as never);
    expect(o.email.accounts.map((a) => a.id)).toEqual(['outlook']);
    expect(withDefaults({ email: { provider: null } } as never).email.accounts).toEqual([]);
  });

  it('reads Gmail thread ids from either attribute', () => {
    const row = document.createElement('tr');
    row.innerHTML = '<span data-thread-id="#thread-f:1789012345678901234"></span>';
    expect(threadIdOf(row)).toBe(BigInt('1789012345678901234').toString(16));
    row.innerHTML = '<span data-legacy-thread-id="18d3a1b2c3d4e5f6"></span>';
    expect(threadIdOf(row)).toBe('18d3a1b2c3d4e5f6');
  });

  it('reads Gmail result counts, including "of many"', () => {
    expect(countFrom('1–50 of 1,234', 50)).toEqual({ n: 1234, atLeast: false });
    expect(countFrom('1–32 of 32', 32)).toEqual({ n: 32, atLeast: false });
    expect(countFrom('1–50 of many', 50)).toEqual({ n: 50, atLeast: true });
    expect(countFrom('', 0)).toEqual({ n: 0, atLeast: false });
  });
});
