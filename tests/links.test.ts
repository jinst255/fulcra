// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { findJobLinks, MAX_SCAN } from '../src/readers/links';

function doc(html: string, url: string): Document {
  const d = new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html');
  const base = d.createElement('base');
  base.href = url;
  d.head.append(base);
  return d;
}

describe('jobs a page links to', () => {
  it("lists an employer's Handshake jobs once each, without its own pages", () => {
    const url = 'https://app.joinhandshake.com/e/130683/jobs';
    const { links, more } = findJobLinks(
      doc(
        `<a href="/e/130683">Saltmarsh Climate Lab</a>
         <a href="/e/130683/jobs?page=2">Next</a>
         <a href="/jobs/9012345?ref=employer"><img alt=""><span>Data Analyst Intern</span></a>
         <a href="/jobs/9012345?ref=employer">Data Analyst Intern</a>
         <a href="/stu/jobs/9012346">Field Research Assistant</a>
         <a href="/help">Help</a>`,
        url,
      ),
      url,
    );
    expect(links).toEqual([
      { url: 'https://app.joinhandshake.com/jobs/9012345?ref=employer', title: 'Data Analyst Intern' },
      { url: 'https://app.joinhandshake.com/stu/jobs/9012346', title: 'Field Research Assistant' },
    ]);
    expect(more).toBe(false);
  });

  it('lists LinkedIn search results as job pages, leaving out the one on screen', () => {
    const url = 'https://www.linkedin.com/jobs/search/?currentJobId=4000000001&keywords=intern';
    const { links } = findJobLinks(
      doc(
        `<a href="/jobs/view/4000000001/?trk=x">Data intern</a>
         <a href="/jobs/view/design-intern-at-threadmill-4000000002?trk=x">Design intern</a>
         <a href="/jobs/search/?currentJobId=4000000003">Ops intern</a>
         <a href="/company/threadmill/">Threadmill</a>`,
        url,
      ),
      url,
    );
    expect(links.map((l) => l.url)).toEqual([
      'https://www.linkedin.com/jobs/view/4000000002/',
      'https://www.linkedin.com/jobs/view/4000000003/',
    ]);
  });

  it("reads a careers page's postings, not its menus", () => {
    const url = 'https://www.kestrelwing.example/careers';
    const { links } = findJobLinks(
      doc(
        `<a href="/careers">Careers</a>
         <a href="/careers/">All jobs</a>
         <a href="https://boards.greenhouse.io/kestrelwing/jobs/5551">Machine Learning Intern</a>
         <a href="https://boards.greenhouse.io/kestrelwing/jobs/5552#apply">Robotics Engineer</a>
         <a href="/jobs/5553">Apply now</a>
         <a href="/privacy">Privacy</a>`,
        url,
      ),
      url,
    );
    expect(links.map((l) => l.title)).toEqual(['Machine Learning Intern', 'Robotics Engineer']);
    expect(links[1]!.url).toBe('https://boards.greenhouse.io/kestrelwing/jobs/5552');
  });

  it(`stops at ${MAX_SCAN} and says there were more`, () => {
    const url = 'https://www.indeed.com/jobs?q=analyst';
    const many = Array.from(
      { length: MAX_SCAN + 5 },
      (_, i) => `<a href="/rc/clk?jk=${(0xabc00000 + i).toString(16)}">Analyst ${i}</a>`,
    ).join('');
    const { links, more } = findJobLinks(doc(many, url), url);
    expect(links).toHaveLength(MAX_SCAN);
    expect(links[0]!.url).toBe('https://www.indeed.com/viewjob?jk=abc00000');
    expect(more).toBe(true);
  });
});
