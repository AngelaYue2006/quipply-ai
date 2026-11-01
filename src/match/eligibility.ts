import type { Blocker } from '../shared/match';
import type { MatchInput } from './types';
import {
  CITIZENSHIP_REQUIRED,
  CITIZEN_OR_PR,
  CLEARANCE_MENTION,
  CLEARANCE_REQUIRED,
  GRAD_RANGE,
  NO_SPONSORSHIP,
  matchesAny,
  parseMonthYear,
} from './phrases';

export type HardKind = 'citizenship' | 'clearance' | 'sponsorship' | 'grad_window' | 'location';

export type Eligibility = {
  eligible: boolean;
  blockers: Blocker[];
  warnings: string[];
  /** Requirement kinds a rule here already looked at, so the model's hardRequirements don't repeat them. */
  handled: Set<HardKind>;
};

const DEGREE_LABEL: Record<string, string> = { BS: "Bachelor's", BA: "Bachelor's", MS: "Master's", PhD: 'PhD' };

/**
 * Hard eligibility rules, no model. A rule blocks only when the posting clearly states the requirement
 * and the profile clearly conflicts; anything uncertain becomes a warning instead.
 */
export function checkEligibility(input: MatchInput): Eligibility {
  const { profile, job } = input;
  const text = input.description ?? '';
  const blockers: Blocker[] = [];
  const warnings: string[] = [];
  const handled = new Set<HardKind>();
  const wa = profile.workAuth;

  // term: the listing's terms must overlap your preferred terms (ignored when the listing says N/A).
  const listingTerms = job.terms.filter((t) => t.trim() && t.trim().toUpperCase() !== 'N/A');
  const wanted = profile.preferences.terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (listingTerms.length && wanted.length && !listingTerms.some((t) => wanted.includes(t.toLowerCase()))) {
    blockers.push({ rule: 'term', detail: `Listing is for ${listingTerms.join(', ')}; you want ${profile.preferences.terms.join(', ')}.` });
  }

  // degree: your current degree level must be in the listing's degrees list.
  const current = profile.education[0];
  const level = current ? DEGREE_LABEL[current.degreeType] : undefined;
  if (job.degrees.length && level && !job.degrees.includes(level)) {
    blockers.push({ rule: 'degree', detail: `Listing is for ${job.degrees.join(', ')} students; your current degree is ${level}.` });
  }

  // citizenship
  const listingRequiresCitizen = /citizenship is required/i.test(job.sponsorship);
  const orPr = matchesAny(text, CITIZEN_OR_PR);
  const strict = listingRequiresCitizen ? 'the listing says U.S. citizenship is required' : !orPr && matchesAny(text, CITIZENSHIP_REQUIRED);
  if (strict) {
    handled.add('citizenship');
    if (wa.citizenship === '') warnings.push('Posting requires U.S. citizenship; set your citizenship status in Work authorization.');
    else if (wa.citizenship !== 'us_citizen') blockers.push({ rule: 'citizenship', detail: `U.S. citizenship required ("${strict}").` });
  } else if (orPr) {
    handled.add('citizenship');
    if (wa.citizenship === '') warnings.push('Posting requires U.S. citizenship or permanent residency; set your citizenship status.');
    else if (wa.citizenship === 'visa' || wa.citizenship === 'other')
      blockers.push({ rule: 'citizenship', detail: `U.S. citizenship or permanent residency required ("${orPr}").` });
  }

  // clearance
  const clearance = matchesAny(text, CLEARANCE_REQUIRED);
  if (clearance) {
    handled.add('clearance');
    if (wa.clearance === 'none') blockers.push({ rule: 'clearance', detail: `Active security clearance required ("${clearance}").` });
    else if (wa.clearance === '') warnings.push('Posting requires an active security clearance; set your clearance in Work authorization.');
  } else if (CLEARANCE_MENTION.test(text) && wa.clearance !== 'active') {
    handled.add('clearance');
    warnings.push('posting mentions a clearance requirement');
  }

  // sponsorship
  const listingNoSponsor = /does not offer sponsorship/i.test(job.sponsorship);
  const noSponsor = listingNoSponsor ? 'the listing says it does not offer sponsorship' : matchesAny(text, NO_SPONSORSHIP);
  if (noSponsor) {
    handled.add('sponsorship');
    const needs = wa.sponsorshipNow === 'yes' || wa.sponsorshipFuture === 'yes';
    const unknown = wa.sponsorshipNow === '' && wa.sponsorshipFuture === '';
    if (needs) blockers.push({ rule: 'sponsorship', detail: `The company won't sponsor ("${noSponsor}") and you need sponsorship.` });
    else if (unknown) warnings.push("Posting says it won't sponsor; answer the sponsorship questions in Work authorization.");
  }

  // grad_window
  const range = GRAD_RANGE.exec(text);
  if (range) {
    handled.add('grad_window');
    const from = parseMonthYear(range[1]!);
    const to = parseMonthYear(range[2]!);
    const grad = current?.graduation ? Number(current.graduation.slice(0, 4)) * 12 + Number(current.graduation.slice(5, 7)) - 1 : null;
    if (from !== null && to !== null && grad !== null && (grad < Math.min(from, to) || grad > Math.max(from, to))) {
      blockers.push({ rule: 'grad_window', detail: `Posting wants graduation between ${range[1]} and ${range[2]}; yours is ${current!.graduation}.` });
    } else if (grad === null) {
      warnings.push(`Posting wants graduation between ${range[1]} and ${range[2]}; add your expected graduation date.`);
    }
  }

  // location: a warning only, never a blocker.
  const prefs = profile.preferences.locations.map((l) => l.trim().toLowerCase()).filter(Boolean);
  if (prefs.length && job.locations.length) {
    handled.add('location');
    const ok = job.locations.some((loc) => {
      const l = loc.toLowerCase();
      return prefs.some((p) => l.includes(p) || p.includes(l)) || (profile.preferences.remoteOk && l.includes('remote'));
    });
    if (!ok) warnings.push(`None of the posting's locations (${job.locations.join('; ')}) match your preferred locations.`);
  }

  return { eligible: blockers.length === 0, blockers, warnings, handled };
}

/** Which rule a model-found hard requirement belongs to. */
export function hardKind(text: string): HardKind | null {
  const t = text.toLowerCase();
  if (/citizen/.test(t)) return 'citizenship';
  if (/clearance/.test(t)) return 'clearance';
  if (/sponsor|visa|work authori/.test(t)) return 'sponsorship';
  if (/graduat/.test(t)) return 'grad_window';
  if (/locat|relocat|on-?site|in-?office|hybrid|remote/.test(t)) return 'location';
  return null;
}
