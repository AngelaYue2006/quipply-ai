import type { FitChecklist } from '../shared/match';

export function normalizeForQuote(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/[•·▪●]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** All string values of an object, one per line, so evidence can be matched without JSON escaping. */
export function flattenStrings(value: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return out.join('\n');
}

/** A quote is found when every part between "..." ellipses appears in the haystack. */
function found(quote: string, haystack: string): boolean {
  const parts = quote
    .split(/\.\.\.|…/)
    .map(normalizeForQuote)
    .map((p) => p.replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => haystack.includes(p));
}

/**
 * Every jobQuote must appear in the description and every profileEvidence in the profile.
 * Items that fail are downgraded to "unclear", so invented evidence can't move the score.
 */
export function verifyQuotes(fit: FitChecklist, description: string, profileSubset: unknown): { fit: FitChecklist; failed: number } {
  const desc = normalizeForQuote(description);
  const profileText = normalizeForQuote(flattenStrings(profileSubset));
  let failed = 0;
  const requirements = fit.requirements.map((r) => {
    if (r.met === 'unclear') return { ...r, profileEvidence: null };
    const jobOk = found(r.jobQuote, desc);
    const needsEvidence = r.met === 'yes' || r.met === 'partial';
    const evidenceOk = !needsEvidence || (r.profileEvidence !== null && found(r.profileEvidence, profileText));
    if (jobOk && evidenceOk) return needsEvidence ? r : { ...r, profileEvidence: null };
    failed++;
    return { ...r, met: 'unclear' as const, profileEvidence: null };
  });
  return { fit: { ...fit, requirements }, failed };
}
