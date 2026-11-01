import { describe, expect, it } from 'vitest';
import { assemble, computeScore, verdictFor } from '../src/match/score';
import type { FitChecklist, FitRequirement } from '../src/shared/match';

const req = (kind: FitRequirement['kind'], met: FitRequirement['met'], category: FitRequirement['category'] = 'skill', text = 'thing'): FitRequirement => ({
  text,
  kind,
  category,
  met,
  jobQuote: text,
  profileEvidence: met === 'yes' || met === 'partial' ? text : null,
});
const fit = (requirements: FitRequirement[], hardRequirements: FitChecklist['hardRequirements'] = []): FitChecklist => ({
  requirements,
  hardRequirements,
  summary: 'ok',
});
const elig = { eligible: true, blockers: [], warnings: [], handled: new Set<never>() };

describe('computeScore', () => {
  it('weights required 3 and preferred 1; partial counts half; unclear is left out', () => {
    // required yes (3) + required partial (1.5) + preferred no (0) = 4.5 / 7
    const r = computeScore(fit([req('required', 'yes'), req('required', 'partial'), req('preferred', 'no'), req('required', 'unclear')]));
    expect(r).toEqual({ score: Math.round((100 * 4.5) / 7), judged: 3 });
  });

  it('caps the score at 59 when two or more required items are missing', () => {
    const items = [...Array(8)].map(() => req('required', 'yes'));
    expect(computeScore(fit(items)).score).toBe(100);
    expect(computeScore(fit([...items, req('required', 'no'), req('required', 'no')])).score).toBe(59);
  });

  it('returns null when nothing could be judged', () => {
    expect(computeScore(fit([req('required', 'unclear')]))).toEqual({ score: null, judged: 0 });
  });

  it('maps scores to verdicts at 80 / 65 / 50', () => {
    expect([80, 79, 65, 64, 50, 49].map((s) => verdictFor(s))).toEqual(['strong', 'good', 'good', 'stretch', 'stretch', 'weak']);
  });
});

describe('assemble', () => {
  it('builds strengths, gaps (required first), skills and warnings', () => {
    const r = assemble(
      elig,
      fit(
        [
          req('preferred', 'no', 'skill', 'Kubernetes'),
          req('required', 'yes', 'skill', 'Python'),
          req('required', 'no', 'experience', '2 years industry'),
          req('required', 'partial', 'skill', 'Go'),
        ],
        [{ text: 'Must be located in Austin', jobQuote: 'based in Austin, TX' }],
      ),
      { quoteFailures: 1, truncated: false },
    );
    expect(r.status).toBe('scored');
    expect(r.strengths.map((s) => s.point)).toEqual(['Python']);
    expect(r.gaps.map((g) => g.severity)).toEqual(['required', 'required', 'preferred']);
    expect(r.skills.required).toEqual([
      { skill: 'Python', have: true },
      { skill: 'Go', have: false },
    ]);
    expect(r.skills.preferred).toEqual([{ skill: 'Kubernetes', have: false }]);
    expect(r.warnings.join('\n')).toMatch(/1 item\(s\) quoted text/);
    expect(r.warnings.join('\n')).toMatch(/posting mentions a location requirement/);
  });

  it('adds "low confidence" with fewer than 3 judged items', () => {
    const r = assemble(elig, fit([req('required', 'yes'), req('required', 'unclear')]), { quoteFailures: 0, truncated: false });
    expect(r.warnings).toContain('low confidence');
  });

  it('does not repeat a hard requirement that an eligibility rule already handled', () => {
    const handled = { ...elig, handled: new Set(['sponsorship'] as const) };
    const r = assemble(handled, fit([req('required', 'yes')], [{ text: 'No visa sponsorship', jobQuote: 'unable to sponsor' }]), {
      quoteFailures: 0,
      truncated: false,
    });
    expect(r.warnings.some((w) => w.includes('sponsorship requirement'))).toBe(false);
  });
});
