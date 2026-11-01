import { describe, expect, it } from 'vitest';
import { applyFilters, NO_FILTERS } from '../web/src/pages/jobs/filters';
import type { JobRow } from '../src/shared/job';

const job = (id: number, score: number | null, overrides: Partial<JobRow> = {}): JobRow => ({
  id, company: 'Example Company', title: 'Engineering Intern', locations: ['Chicago'], terms: ['Summer 2027'],
  category: 'Software', degrees: ["Bachelor's"], sponsorship: 'Other', url: 'https://example.test/job',
  atsType: 'greenhouse', datePosted: Date.now() / 1000, active: true, userStatus: 'new', notes: '',
  isNew: false, hasDescription: true, match: { score, status: 'scored', verdict: 'good', stale: false }, ...overrides,
});

describe('job board filters', () => {
  const jobs = [job(1, 0), job(2, 72), job(3, 73), job(4, 100), job(5, null), job(6, null, { match: null }), job(7, 99, { userStatus: 'skipped' })];

  it('supports an arbitrary minimum, including the exact boundary', () => {
    expect(applyFilters(jobs, { ...NO_FILTERS, minScore: 73 }, undefined).map(j => j.id)).toEqual([3, 4]);
  });

  it('distinguishes an empty threshold from zero and excludes jobs without numeric scores', () => {
    expect(applyFilters(jobs, NO_FILTERS, undefined)).toHaveLength(6);
    expect(applyFilters(jobs, { ...NO_FILTERS, minScore: 0 }, undefined).map(j => j.id)).toEqual([1, 2, 3, 4]);
    expect(applyFilters(jobs, { ...NO_FILTERS, minScore: 100 }, undefined).map(j => j.id)).toEqual([4]);
  });

  it('combines score with text and status filters', () => {
    expect(applyFilters(jobs, { ...NO_FILTERS, status: 'skipped', minScore: 73, q: 'ENGINEERING' }, undefined).map(j => j.id)).toEqual([7]);
    expect(applyFilters(jobs, { ...NO_FILTERS, q: 'no such company' }, undefined)).toEqual([]);
  });

  it('supports a custom posting age and location-or-remote behavior', () => {
    const rows = [job(1, 80), job(2, 80, { locations: ['Remote'] }), job(3, 80, { datePosted: Date.now() / 1000 - 6 * 86400 })];
    expect(applyFilters(rows, { ...NO_FILTERS, postedDays: 5 }, undefined).map(j => j.id)).toEqual([1, 2]);
    expect(applyFilters(rows, { ...NO_FILTERS, remote: true }, undefined).map(j => j.id)).toEqual([2]);
    expect(applyFilters(rows, { ...NO_FILTERS, remote: true, location: 'Chicago' }, undefined)).toHaveLength(3);
  });
});
