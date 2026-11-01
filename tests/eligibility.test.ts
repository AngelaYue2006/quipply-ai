import { describe, expect, it } from 'vitest';
import { checkEligibility } from '../src/match/eligibility';
import { CITIZENSHIP_REQUIRED, CLEARANCE_REQUIRED, NO_SPONSORSHIP, matchesAny, parseMonthYear } from '../src/match/phrases';
import type { MatchInput, MatchJob } from '../src/match/types';
import type { Profile } from '../src/shared/profile';
import { fakeProfile } from './helpers';

const job = (over: Partial<MatchJob> = {}): MatchJob => ({
  company: 'Acme',
  title: 'Software Intern',
  locations: ['Remote in USA'],
  terms: ['Summer 2027'],
  degrees: ["Bachelor's", "Master's"],
  sponsorship: 'Other',
  ...over,
});
const input = (description: string, j: Partial<MatchJob> = {}, p: Partial<Profile> = {}): MatchInput => ({
  profile: fakeProfile(p),
  profileVersion: 1,
  job: job(j),
  description,
});
const rules = (i: MatchInput) => checkEligibility(i).blockers.map((b) => b.rule);
const citizen = (c: Profile['workAuth']['citizenship']) => ({ workAuth: { ...fakeProfile().workAuth, citizenship: c } });

describe('phrase lists', () => {
  it.each([
    ['Applicants must be a U.S. citizen.', true],
    ['US citizenship is required for this role.', true],
    ['This position requires U.S. citizenship due to export controls.', true],
    ['Only US citizens will be considered.', true],
    ['U.S. citizenship is not required.', false],
    ['We welcome citizens of all countries.', false],
  ])('citizenship: %s → %s', (text, hit) => expect(Boolean(matchesAny(text, CITIZENSHIP_REQUIRED))).toBe(hit));

  it.each([
    ['An active Secret clearance is required.', true],
    ['Must have an active TS/SCI clearance.', true],
    ['Requires a current DoD security clearance.', true],
    ['Ability to obtain a security clearance.', false],
    ['Candidates may be subject to a background check.', false],
  ])('clearance: %s → %s', (text, hit) => expect(Boolean(matchesAny(text, CLEARANCE_REQUIRED))).toBe(hit));

  it.each([
    ['We are unable to sponsor visas for this role.', true],
    ['The company will not provide sponsorship for this position.', true],
    ['Must be authorized to work in the US without sponsorship now or in the future.', true],
    ["We don't sponsor work visas.", true],
    ['Visa sponsorship is not available.', true],
    ['Sponsorship is available for this role.', false],
    ['We offer visa sponsorship to qualified candidates.', false],
    ['We will sponsor H-1B visas.', false],
  ])('no sponsorship: %s → %s', (text, hit) => expect(Boolean(matchesAny(text, NO_SPONSORSHIP))).toBe(hit));

  it('parses month, season and numeric dates', () => {
    expect(parseMonthYear('June 2027')).toBe(2027 * 12 + 5);
    expect(parseMonthYear('Dec. 2026')).toBe(2026 * 12 + 11);
    expect(parseMonthYear('Spring 2027')).toBe(2027 * 12 + 4);
    expect(parseMonthYear('6/2027')).toBe(2027 * 12 + 5);
    expect(parseMonthYear('soon')).toBeNull();
  });
});

describe('checkEligibility', () => {
  it('passes a clean posting with no blockers', () => {
    const e = checkEligibility(input('We build things. Python required.'));
    expect(e.eligible).toBe(true);
    expect(e.blockers).toEqual([]);
  });

  it('term: blocks when terms do not overlap, ignores N/A', () => {
    expect(rules(input('', { terms: ['Fall 2026'] }))).toEqual(['term']);
    expect(rules(input('', { terms: ['N/A'] }))).toEqual([]);
    expect(rules(input('', { terms: ['Summer 2027', 'Fall 2027'] }))).toEqual([]);
  });

  it("degree: blocks a Bachelor's student on a PhD-only listing", () => {
    expect(rules(input('', { degrees: ['PhD'] }))).toEqual(['degree']);
    expect(rules(input('', { degrees: [] }))).toEqual([]);
  });

  it('citizenship: blocks non-citizens, allows citizens, warns when unknown', () => {
    const text = 'Applicants must be a U.S. citizen.';
    expect(rules(input(text, {}, citizen('visa')))).toEqual(['citizenship']);
    expect(rules(input(text, {}, citizen('us_citizen')))).toEqual([]);
    const unknown = checkEligibility(input(text, {}, citizen('')));
    expect(unknown.blockers).toEqual([]);
    expect(unknown.warnings.join(' ')).toMatch(/citizenship/);
    expect(rules(input('', { sponsorship: 'U.S. Citizenship is Required' }, citizen('permanent_resident')))).toEqual(['citizenship']);
  });

  it('citizenship: "citizen or permanent resident" lets permanent residents through', () => {
    const text = 'Must be a U.S. citizen or permanent resident.';
    expect(rules(input(text, {}, citizen('permanent_resident')))).toEqual([]);
    expect(rules(input(text, {}, citizen('visa')))).toEqual(['citizenship']);
  });

  it('clearance: blocks only an explicit active requirement; a mention is a warning', () => {
    expect(rules(input('An active Secret clearance is required.'))).toEqual(['clearance']);
    const mention = checkEligibility(input('Ability to obtain a security clearance.'));
    expect(mention.blockers).toEqual([]);
    expect(mention.warnings).toContain('posting mentions a clearance requirement');
  });

  it('sponsorship: blocks when the company will not sponsor and you need it', () => {
    expect(rules(input('We are unable to sponsor visas.'))).toEqual(['sponsorship']);
    expect(rules(input('Sponsorship is available.'))).toEqual([]);
    expect(rules(input('', { sponsorship: 'Does Not Offer Sponsorship' }))).toEqual(['sponsorship']);
    const noNeed = { workAuth: { ...fakeProfile().workAuth, sponsorshipNow: 'no' as const, sponsorshipFuture: 'no' as const } };
    expect(rules(input('We are unable to sponsor visas.', {}, noNeed))).toEqual([]);
  });

  it('grad_window: blocks when graduation is outside the stated range', () => {
    expect(rules(input('Candidates graduating between December 2025 and June 2026 are eligible.'))).toEqual(['grad_window']);
    expect(rules(input('Candidates graduating between December 2026 and June 2027.'))).toEqual([]);
    expect(rules(input('Expected graduation date between Fall 2026 and Spring 2027.'))).toEqual([]);
  });

  it('location: a mismatch is a warning, never a blocker', () => {
    const e = checkEligibility(input('', { locations: ['Austin, TX'] }, { preferences: { ...fakeProfile().preferences, locations: ['New York'] } }));
    expect(e.blockers).toEqual([]);
    expect(e.warnings.join(' ')).toMatch(/preferred locations/);
  });
});
