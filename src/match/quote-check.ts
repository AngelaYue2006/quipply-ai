import type { FitChecklist, MatchResult } from '../shared/match';

export type IgnoredItem = NonNullable<MatchResult['ignored']>[number];

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

/** One profile entry (one school, one job, one project, one skill). */
export type ProfileEntry = {
  /** All of the entry's text, normalized. */
  text: string;
  /** Each field value, as tokens joined by single spaces (see tokenize). */
  values: Set<string>;
  /** Field names as words: "degreeType" -> "degree type"; plurals also without the "s". */
  keys: Set<string>;
};

/** Words of a normalized phrase, without label punctuation (colons, brackets, pipes) or trailing commas. */
function tokenize(s: string): string[] {
  return normalizeForQuote(s)
    .replace(/[:()|[\]]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[,.;]+|[,.;]+$/g, ''))
    .filter(Boolean);
}

export function profileEntries(value: unknown): ProfileEntry[] {
  const out: ProfileEntry[] = [];
  const describe = (item: object): ProfileEntry => {
    const values = new Set<string>();
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (typeof v === 'string') {
        const t = tokenize(v).join(' ');
        if (t) values.add(t);
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        for (const [k, inner] of Object.entries(v)) {
          const words = k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
          keys.add(words);
          if (words.endsWith('s')) keys.add(words.slice(0, -1));
          walk(inner);
        }
      }
    };
    walk(item);
    return { text: normalizeForQuote(flattenStrings(item)), values, keys };
  };
  const walk = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item && typeof item === 'object') out.push(describe(item));
        walk(item);
      }
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return out;
}

const CONNECTORS = new Set(['in', 'at', 'of', 'from', 'with', 'for', 'and', '&', '-']);

/**
 * True when the phrase is made only of whole field values from one entry, optionally with that entry's
 * field names and small connecting words, e.g. "BS Computer Science" or "graduation 2028-05" from one
 * education entry. Needs at least one value. Partial values and reworded text don't count.
 */
function builtFromEntry(phrase: string, entry: ProfileEntry): boolean {
  const words = tokenize(phrase);
  const n = words.length;
  if (n === 0 || n > 80) return false;
  // reach[i]: 0 = can't reach word i; 1 = reached using only names/connectors; 2 = reached using a value.
  const reach: number[] = new Array(n + 1).fill(0);
  reach[0] = 1;
  for (let i = 0; i < n; i++) {
    if (!reach[i]) continue;
    for (let j = i + 1; j <= n; j++) {
      const piece = words.slice(i, j).join(' ');
      let next = 0;
      if (entry.values.has(piece)) next = 2;
      else if (entry.keys.has(piece) || (j === i + 1 && CONNECTORS.has(piece))) next = reach[i]!;
      if (next > reach[j]!) reach[j] = next;
    }
  }
  return reach[n] === 2;
}

const stripEnds = (p: string) => p.replace(/^["'(\s]+|["'.)\s]+$/g, '').trim();

/** A quote is found when every part between "..." ellipses appears in the haystack. */
function found(quote: string, haystack: string): boolean {
  const parts = quote
    .split(/\.\.\.|…/)
    .map(normalizeForQuote)
    .map((p) => p.replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((p) => haystack.includes(p));
}

/** The phrase appears as whole words: "sql" matches "SQL" but not the end of "PostgreSQL". */
function wordFound(phrase: string, haystack: string): boolean {
  if (phrase.length < 2) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(haystack);
}

const LIST_SEPARATORS = /\s*[,;/]\s*|\s+(?:and|&)\s+/;
const JOINERS = /\s+(?:at|in)\s+/;

/**
 * Evidence assembled from profile entries instead of quoted from one, e.g. "Python, TypeScript, SQL" or
 * "Texas A&M University, BS Computer Science, graduation 2028-05". Each comma-separated part must be:
 * - whole words found in the profile ("Python"), or
 * - pieces joined with "at"/"in" that all appear in one entry ("Software Engineering Intern at Acme"), or
 * - built only from whole field values of one entry, plus field names and connectors ("BS Computer Science").
 * Parts that combine details from different jobs or schools fail, and so does reworded text.
 */
function listFound(quote: string, profileText: string, entries: ProfileEntry[]): boolean {
  const parts = normalizeForQuote(quote).split(LIST_SEPARATORS).map(stripEnds).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((part) => {
    const joined = part.split(JOINERS).map(stripEnds).filter(Boolean);
    const direct =
      joined.length === 1
        ? wordFound(joined[0]!, profileText)
        : entries.some((entry) => joined.every((piece) => wordFound(piece, entry.text)));
    return direct || entries.some((entry) => builtFromEntry(part, entry));
  });
}

/**
 * Every jobQuote must appear in the description and every profileEvidence in the profile, either as
 * one exact quote or as a list of exact profile entries (see listFound).
 * Items that fail are downgraded to "unclear", so invented evidence can't move the score.
 */
export function verifyQuotes(
  fit: FitChecklist,
  description: string,
  profileSubset: unknown,
): { fit: FitChecklist; failed: number; ignored: IgnoredItem[] } {
  const desc = normalizeForQuote(description);
  const profileText = normalizeForQuote(flattenStrings(profileSubset));
  const entries = profileEntries(profileSubset);
  let failed = 0;
  const ignored: IgnoredItem[] = [];
  const requirements = fit.requirements.map((r) => {
    if (r.met === 'unclear') return { ...r, profileEvidence: null };
    const jobOk = found(r.jobQuote, desc);
    const needsEvidence = r.met === 'yes' || r.met === 'partial';
    const evidenceOk =
      !needsEvidence ||
      (r.profileEvidence !== null && (found(r.profileEvidence, profileText) || listFound(r.profileEvidence, profileText, entries)));
    if (jobOk && evidenceOk) return needsEvidence ? r : { ...r, profileEvidence: null };
    failed++;
    ignored.push({
      point: r.text,
      kind: r.kind,
      claimed: r.met,
      jobQuote: r.jobQuote,
      profileEvidence: r.profileEvidence,
      reasons: [...(jobOk ? [] : ['job_quote_not_found' as const]), ...(evidenceOk ? [] : ['evidence_not_found' as const])],
    });
    return { ...r, met: 'unclear' as const, profileEvidence: null };
  });
  return { fit: { ...fit, requirements }, failed, ignored };
}
