import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, type AppConfig } from '../src/config';
import { openDb } from '../src/db/client';
import { Profile } from '../src/shared/profile';
import type { JobSource, SourcePullResult } from '../src/jobs/sources/types';

export const TEST_TOKEN = 'test-token-0123456789';

export function testDb() {
  return openDb(':memory:');
}

export function testConfig(over: Partial<AppConfig> = {}): AppConfig {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'quipply-test-'));
  return loadConfig({ dataDir, resumesDir: path.join(dataDir, 'resumes'), token: TEST_TOKEN, port: 4317, devWebPort: 5173, anthropicApiKey: '', ...over });
}

export function fixture(name: string): string {
  return readFileSync(path.join('fixtures', name), 'utf8');
}
export function fixtureJson<T = unknown>(name: string): T {
  return JSON.parse(fixture(name)) as T;
}

/** A clearly fake person. Never use real data in tests. */
export function fakeProfile(over: Partial<Profile> = {}): Profile {
  return Profile.parse({
    identity: { firstName: 'Testy', lastName: 'McTestface' },
    contact: { email: 'testy@example.com', phone: '555-0100', city: 'Springfield', state: 'XX', country: 'Testland' },
    links: { github: 'https://github.com/example-testy' },
    education: [
      {
        school: 'Example State University',
        degreeType: 'BS',
        majors: ['Computer Science'],
        gpa: '3.70',
        gpaScale: '4.0',
        start: '2023-09',
        graduation: '2027-05',
        coursework: ['Data Structures', 'Operating Systems'],
      },
    ],
    experience: [
      {
        company: 'Acme Widgets',
        title: 'Software Engineering Intern',
        employmentType: 'internship',
        start: '2025-06',
        end: '2025-08',
        bullets: ['Built REST APIs in TypeScript and Node.js serving 2k requests per minute', 'Wrote Python scripts to clean sensor data'],
        skills: ['TypeScript', 'Node.js', 'Python'],
      },
    ],
    projects: [{ name: 'Tiny Compiler', bullets: ['Wrote a compiler for a toy language in Rust'], skills: ['Rust'] }],
    skills: {
      languages: [{ name: 'Python' }, { name: 'TypeScript' }, { name: 'Java' }, { name: 'Rust' }],
      frameworks: [{ name: 'React' }],
      tools: [{ name: 'Git' }, { name: 'Docker' }, { name: 'PostgreSQL' }],
      domains: [{ name: 'distributed systems' }],
    },
    preferences: { terms: ['Summer 2027'], locations: [], remoteOk: true },
    workAuth: { authorizedUS: 'yes', sponsorshipNow: 'no', sponsorshipFuture: 'yes', citizenship: 'visa', clearance: 'none' },
    ...over,
  });
}

/** A JobSource that serves fixed entries, honoring ETags like the real one. */
export class FakeSource implements JobSource {
  readonly id = 'simplify-internships';
  calls: { etag: string | null }[] = [];
  constructor(
    public entries: unknown[],
    public etag: string | null = '"v1"',
  ) {}
  async pull(opts: { etag: string | null }): Promise<SourcePullResult> {
    this.calls.push(opts);
    if (opts.etag && opts.etag === this.etag) return { notModified: true, etag: this.etag };
    return { notModified: false, etag: this.etag, entries: structuredClone(this.entries) };
  }
}

/** fetch stand-in: maps URL prefixes to responses and records requested URLs. */
export function fakeFetch(routes: Record<string, () => Response>) {
  const requested: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requested.push(url);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return new Response('not found', { status: 404 });
    return routes[key]!();
  }) as typeof fetch;
  return { impl, requested };
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
