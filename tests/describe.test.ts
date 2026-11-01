import { describe, expect, it } from 'vitest';
import { jobs } from '../src/db/schema';
import {
  DescribeError,
  fetchAshby,
  fetchGreenhouse,
  fetchLever,
  fetchReadable,
  parseAshbyUrl,
  parseGreenhouseUrl,
  parseLeverUrl,
} from '../src/jobs/describe/fetchers';
import { fetchAndStoreDescription, saveManualDescription } from '../src/jobs/describe';
import { htmlToText } from '../src/jobs/describe/html';
import { getJobDetail } from '../src/jobs/queries';
import { politely, MIN_REQUEST_GAP_MS } from '../src/jobs/http';
import { fakeFetch, fixture, fixtureJson, json, testDb } from './helpers';

describe('URL parsing', () => {
  it('greenhouse: hosted, legacy, embed and gh_jid forms; EU boards fall back', () => {
    expect(parseGreenhouseUrl('https://job-boards.greenhouse.io/lilasciences/jobs/4469152009')).toEqual({ board: 'lilasciences', jobId: '4469152009' });
    expect(parseGreenhouseUrl('https://boards.greenhouse.io/neuralink/jobs/6083322003?gh_src=x')).toEqual({ board: 'neuralink', jobId: '6083322003' });
    expect(parseGreenhouseUrl('https://boards.greenhouse.io/embed/job_app?for=acme&token=123')).toEqual({ board: 'acme', jobId: '123' });
    expect(parseGreenhouseUrl('https://boards.greenhouse.io/embed/job_app?token=7713841003')).toBeNull();
    expect(parseGreenhouseUrl('https://job-boards.eu.greenhouse.io/imc/jobs/4829785101')).toBeNull();
  });
  it('lever and ashby, including /apply and /application suffixes', () => {
    expect(parseLeverUrl('https://jobs.lever.co/palantir/ac0dc094-2480-43c2-8495-26ade227ff4f/apply')).toEqual({
      company: 'palantir',
      postingId: 'ac0dc094-2480-43c2-8495-26ade227ff4f',
      eu: false,
    });
    expect(parseAshbyUrl('https://jobs.ashbyhq.com/creatify/75a1f1ad-13d2-4513-952c-71b6dfcaa84f/application')).toEqual({
      board: 'creatify',
      jobId: '75a1f1ad-13d2-4513-952c-71b6dfcaa84f',
    });
    expect(parseAshbyUrl('https://jobs.ashbyhq.com/creatify')).toBeNull();
  });
});

describe('fetchers against saved API responses', () => {
  it('greenhouse decodes the entity-escaped content into plain text', async () => {
    const { impl, requested } = fakeFetch({ 'https://boards-api.greenhouse.io/': () => json(fixtureJson('describe/greenhouse-job.json')) });
    const got = await fetchGreenhouse(impl, { board: 'lilasciences', jobId: '4469152009' });
    expect(requested[0]).toBe('https://boards-api.greenhouse.io/v1/boards/lilasciences/jobs/4469152009');
    expect(got.method).toBe('greenhouse_api');
    expect(got.text).toContain('Your Impact at LILA');
    expect(got.text).not.toMatch(/&lt;|<p>/);
  });

  it('lever joins description, lists and additional sections', async () => {
    const { impl } = fakeFetch({ 'https://api.lever.co/v0/postings/palantir/': () => json(fixtureJson('describe/lever-posting.json')) });
    const got = await fetchLever(impl, { company: 'palantir', postingId: 'ac0dc094-2480-43c2-8495-26ade227ff4f', eu: false });
    expect(got.text).toContain('What We Require');
    expect(got.text).toMatch(/^- /m);
  });

  it('ashby finds the job on the board, and reports a missing one as not found', async () => {
    const { impl } = fakeFetch({ 'https://api.ashbyhq.com/posting-api/job-board/creatify': () => json(fixtureJson('describe/ashby-board.json')) });
    const got = await fetchAshby(impl, { board: 'creatify', jobId: '75a1f1ad-13d2-4513-952c-71b6dfcaa84f' });
    expect(got.text).toContain('Creatify');
    await expect(fetchAshby(impl, { board: 'creatify', jobId: '00000000-0000-0000-0000-000000000000' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('readability extracts a normal page and flags JavaScript shells as needs_browser', async () => {
    const page = fixture('describe/readable-posting.html');
    const shell = '<html><body><div id="root"></div><script>render()</script></body></html>';
    const { impl } = fakeFetch({
      'https://careers.example.com/job/1': () => new Response(page, { headers: { 'content-type': 'text/html' } }),
      'https://careers.example.com/job/2': () => new Response(shell, { headers: { 'content-type': 'text/html' } }),
    });
    const got = await fetchReadable(impl, 'https://careers.example.com/job/1');
    expect(got.method).toBe('readability');
    expect(got.text).toContain('Basic Qualifications');
    expect(got.text).not.toContain('Cookie preferences');
    const err = await fetchReadable(impl, 'https://careers.example.com/job/2').catch((e) => e);
    expect(err).toBeInstanceOf(DescribeError);
    expect(err.code).toBe('needs_browser');
  });

  it('turns HTML lists into dashed lines', () => {
    expect(htmlToText('<p>Intro</p><ul><li>One</li><li>Two</li></ul>')).toBe('Intro\n\n- One\n\n- Two');
  });
});

describe('storing descriptions', () => {
  function seedJob(url: string) {
    const db = testDb();
    const row = db
      .insert(jobs)
      .values({
        source: 's', sourceListingId: '1', company: 'Acme', title: 'Intern', locations: [], terms: [], degrees: [],
        url, atsType: 'other', datePosted: 1, dateUpdated: 1, active: true,
      })
      .returning()
      .get();
    return { db, id: row.id };
  }

  it('stores the error and keeps earlier text when a fetch fails', async () => {
    const { db, id } = seedJob('https://careers.example.com/job/404');
    saveManualDescription(db, id, '  Pasted   description \n\n\n\n text ');
    expect(getJobDetail(db, id)!.description).toMatchObject({ text: 'Pasted description\n\ntext', method: 'manual' });
    const { impl } = fakeFetch({});
    const res = await fetchAndStoreDescription(db, id, impl);
    expect(res).toMatchObject({ ok: false, code: 'not_found' });
    const d = getJobDetail(db, id)!.description!;
    expect(d.text).toBe('Pasted description\n\ntext');
    expect(d.error).toMatch(/^not_found/);
  });
});

describe('politeness', () => {
  it('runs requests one at a time with at least the minimum gap', async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    let running = 0;
    let maxRunning = 0;
    const task = () =>
      politely(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((r) => setTimeout(r, 5));
        running--;
      }, sleep);
    await Promise.all([task(), task(), task()]);
    expect(maxRunning).toBe(1);
    expect(waits.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...waits)).toBeLessThanOrEqual(MIN_REQUEST_GAP_MS);
  });
});
