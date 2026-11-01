import type { AtsType } from '../shared/job';

/** Derive the ATS from the posting URL's host. */
export function detectAts(url: string): AtsType {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (is('myworkdayjobs.com') || is('myworkdaysite.com')) return 'workday';
  if (is('greenhouse.io')) return 'greenhouse';
  if (is('lever.co')) return 'lever';
  if (is('ashbyhq.com')) return 'ashby';
  if (is('oraclecloud.com')) return 'oracle';
  if (is('icims.com')) return 'icims';
  if (is('smartrecruiters.com')) return 'smartrecruiters';
  return 'other';
}
