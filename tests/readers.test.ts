// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanText, looksClosed } from '../src/readers/extract';
import { isUrl, readPage, siteFor } from '../src/readers/generic';

function load(name: string): Document {
  const html = readFileSync(resolve('tests/fixtures', name), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('page readers', () => {
  it('reads a logged-in LinkedIn job page', () => {
    const r = readPage(
      load('linkedin-loggedin.html'),
      'https://www.linkedin.com/jobs/search/?currentJobId=4459584288&keywords=intern',
    );
    expect(r).toMatchObject({
      site: 'linkedin',
      siteJobId: '4459584288',
      title: 'Software Engineering Intern',
      company: 'Northbeam Software',
      location: 'Salt Lake City, UT',
      closed: false,
      isJobPage: true,
      selectorsFailed: false,
    });
    expect(r.url).toBe('https://www.linkedin.com/jobs/view/4459584288/');
    expect(r.text).toContain('$24/hr');
    expect(r.text).toContain('Responsibilities include');
  });

  it('reads the LinkedIn guest view and detects closed postings', () => {
    expect(
      readPage(
        load('linkedin-guest.html'),
        'https://www.linkedin.com/jobs/view/software-development-intern-at-clearwater-analytics-4459584288',
      ),
    ).toMatchObject({
      siteJobId: '4459584288',
      company: 'Clearwater Analytics',
      location: 'Boise, ID',
    });
    expect(
      readPage(load('linkedin-closed.html'), 'https://www.linkedin.com/jobs/view/1234567890/').closed,
    ).toBe(true);
  });

  it('falls back to the generic reader when LinkedIn selectors miss', () => {
    const r = readPage(load('linkedin-changed.html'), 'https://www.linkedin.com/jobs/view/1234567890/');
    expect(r.selectorsFailed).toBe(true);
    expect(r.site).toBe('linkedin');
    expect(r.siteJobId).toBe('1234567890');
    expect(r.text).toContain('Responsibilities include');
  });

  it('reads Indeed and Handshake pages', () => {
    const i = readPage(load('indeed.html'), 'https://www.indeed.com/viewjob?jk=a1b2c3d4e5f6a7b8');
    expect(i).toMatchObject({
      site: 'indeed',
      title: 'Warehouse Associate',
      company: 'Valley Distribution',
      siteJobId: 'a1b2c3d4e5f6a7b8',
    });
    expect(i.text).toContain('$16 an hour');
    const h = readPage(load('handshake.html'), 'https://app.joinhandshake.com/stu/jobs/9876543');
    expect(h).toMatchObject({
      site: 'handshake',
      siteJobId: '9876543',
      title: 'Math Teaching Assistant',
      company: 'State University',
    });
  });

  it('uses JSON-LD JobPosting on other sites and rejects non-job pages', () => {
    const g = readPage(load('generic-jsonld.html'), 'https://careers.teton.example/jobs/42');
    expect(g).toMatchObject({
      site: null,
      title: 'Junior Data Analyst',
      company: 'Teton Analytics',
      location: 'Idaho Falls, ID',
      isJobPage: true,
    });
    expect(readPage(load('not-a-job.html'), 'https://recipes.example/banana').isJobPage).toBe(false);
  });

  it('sees a closed notice anywhere near the top of a LinkedIn job, even in an unknown element', () => {
    const doc = new DOMParser().parseFromString(
      `<main><h1>Analyst</h1><div class="new-banner-2027"><span>No longer accepting applications</span></div>
       <div id="job-details"><p>${'Build reports and dashboards for the operations team. '.repeat(8)}</p></div></main>`,
      'text/html',
    );
    expect(readPage(doc, 'https://www.linkedin.com/jobs/view/4400000001/').closed).toBe(true);
  });

  it('recognizes sites, links, and closed wording', () => {
    expect(siteFor('https://www.indeed.com/jobs?q=x&vjk=0123456789abcdef')).toEqual({
      site: 'indeed',
      id: '0123456789abcdef',
    });
    expect(siteFor('https://boisestate.joinhandshake.com/job-search/555?page=1')).toEqual({
      site: 'handshake',
      id: '555',
    });
    expect(siteFor('https://example.com/jobs/1')).toBeNull();
    expect(isUrl('https://example.com/job')).toBe(true);
    expect(isUrl('Hey, want to tutor at $25/hr? https://x.com')).toBe(false);
    expect(looksClosed('This job has expired on Indeed')).toBe(true);
    for (const closed of [
      'No longer accepting applications',
      'This job is no longer available',
      'This position has been filled.',
      'This posting is no longer active',
      'Applications have closed',
      'The job you are looking for is no longer available',
    ])
      expect(looksClosed(closed), closed).toBe(true);
    for (const open of [
      'Actively recruiting',
      'Apply now. Applications close November 1.',
      'We are no longer a small team and are hiring fast',
    ])
      expect(looksClosed(open), open).toBe(false);
    expect(cleanText('  a \n\n\n\n b ')).toBe('a\n\nb');
  });
});
