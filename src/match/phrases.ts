// Phrase lists for the eligibility rules. Each list has tests for wordings that must and must not trigger it.

export const CITIZENSHIP_REQUIRED: RegExp[] = [
  /\bmust be (?:a )?u\.?\s?s\.? citizens?\b/i,
  /\bu\.?\s?s\.? citizenship (?:is )?required\b/i,
  /\brequires? (?:active )?u\.?\s?s\.? citizenship\b/i,
  /\bunited states citizenship (?:is )?required\b/i,
  /\bmust be (?:a )?(?:citizen of the united states|united states citizen)\b/i,
  /\bonly (?:open to )?u\.?\s?s\.? citizens\b/i,
  /\bcitizenship requirement\b/i,
];

/** "U.S. citizen or permanent resident": permanent residents qualify too. */
export const CITIZEN_OR_PR: RegExp[] = [
  /\b(?:u\.?\s?s\.? )?citizens?(?:hip)?\s*(?:,|or|\/)\s*(?:a |an )?(?:u\.?\s?s\.? )?(?:lawful )?(?:permanent residents?|green card)/i,
  /\b(?:permanent residents?|green card holders?)\s*(?:,|or|\/)\s*(?:a )?(?:u\.?\s?s\.? )?citizens?\b/i,
];

export const CLEARANCE_REQUIRED: RegExp[] = [
  /\b(?:active|current)\s+(?:ts\/sci|top secret|secret|security|dod|government)?\s*(?:security\s+)?clearance\s+(?:is\s+)?required\b/i,
  /\bmust (?:have|possess|hold)\s+(?:an?\s+)?(?:active|current)\s+[\w/ -]{0,30}?clearance\b/i,
  /\brequires?\s+(?:an?\s+)?(?:active|current)\s+[\w/ -]{0,30}?clearance\b/i,
];

/** Any mention of a clearance (e.g. "ability to obtain a clearance"): a warning, never a blocker. */
export const CLEARANCE_MENTION = /\b(?:security clearance|ts\/sci|top secret|secret clearance|clearance)\b/i;

export const NO_SPONSORSHIP: RegExp[] = [
  /\b(?:unable|not able) to (?:provide |offer |support )?(?:visa |immigration |employment )?sponsor/i,
  /\b(?:will|do|does|can|is) not (?:provide|offer|support|be able to provide)\s+(?:any )?(?:visa |immigration |employment |work )?sponsorship/i,
  /\b(?:won't|cannot|can't|don't|doesn't) (?:provide |offer |support )?(?:visa |immigration |employment )?sponsor/i,
  /\bno (?:visa |immigration |employment )?sponsorship (?:is |will be )?(?:available|provided|offered)\b/i,
  /\bsponsorship (?:is |will )?not (?:be )?(?:available|provided|offered)\b/i,
  /\bwithout (?:the )?(?:need for |requiring )?(?:current or future |now or in the future |future )?(?:visa |employer |immigration |employment )?sponsorship\b/i,
  /\bnot eligible for (?:visa |immigration )?sponsorship\b/i,
];

const MONTHS = [
  ['jan', 'january'],
  ['feb', 'february'],
  ['mar', 'march'],
  ['apr', 'april'],
  ['may'],
  ['jun', 'june'],
  ['jul', 'july'],
  ['aug', 'august'],
  ['sep', 'sept', 'september'],
  ['oct', 'october'],
  ['nov', 'november'],
  ['dec', 'december'],
];
const SEASONS: Record<string, number> = { spring: 5, summer: 8, fall: 12, autumn: 12, winter: 12 };

const MONTH_WORD = MONTHS.flat().join('|');
const DATE = `(?:(?:${MONTH_WORD}|${Object.keys(SEASONS).join('|')})\\.?,?\\s+20\\d\\d|\\d{1,2}\\/20\\d\\d)`;
export const GRAD_RANGE = new RegExp(
  `graduat\\w*[^.\\n]{0,60}?(?:between|from)\\s+(${DATE})\\s+(?:and|to|through|until|-|–)\\s+(${DATE})`,
  'i',
);

/** "June 2027" / "Spring 2027" / "6/2027" → months since year 0, or null. */
export function parseMonthYear(s: string): number | null {
  const t = s.toLowerCase().replace(/[.,]/g, ' ').trim();
  const numeric = /^(\d{1,2})\/(20\d\d)$/.exec(t);
  if (numeric) return Number(numeric[2]) * 12 + Number(numeric[1]) - 1;
  const m = /^([a-z]+)\s+(20\d\d)$/.exec(t);
  if (!m) return null;
  const word = m[1]!;
  const year = Number(m[2]);
  const monthIndex = MONTHS.findIndex((names) => names.includes(word));
  if (monthIndex >= 0) return year * 12 + monthIndex;
  if (word in SEASONS) return year * 12 + SEASONS[word]! - 1;
  return null;
}

export function matchesAny(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return m[0];
  }
  return null;
}
