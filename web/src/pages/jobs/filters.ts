import type { JobRow } from '../../../../src/shared/job';
import type { Profile } from '../../../../src/shared/profile';

export type Filters = {
  q: string;
  category: string;
  term: string;
  location: string;
  remote: boolean;
  ats: string;
  postedDays: number;
  degree: string;
  status: string;
  minScore: number | ''; 
  prefs: boolean;
};
export const NO_FILTERS: Filters = { q: '', category: '', term: '', location: '', remote: false, ats: '', postedDays: 0, degree: '', status: 'not_skipped', minScore: '', prefs: false };
const SUPPORTED_ATS = ['greenhouse', 'lever', 'ashby', 'workday'];

export function applyFilters(jobs: JobRow[], f: Filters, profile: Profile | undefined): JobRow[] {
  const q = f.q.trim().toLowerCase();
  const loc = f.location.trim().toLowerCase();
  const cutoff = f.postedDays ? Date.now() / 1000 - f.postedDays * 86400 : 0;
  const pr = profile?.preferences;
  const prefTerms = pr?.terms.map((t) => t.toLowerCase()) ?? [];
  const prefLocs = pr?.locations.map((l) => l.toLowerCase()) ?? [];
  const excluded = pr?.companyExclusions.map((c) => c.toLowerCase()) ?? [];
  return jobs.filter((j) => {
    if (q && !`${j.company} ${j.title}`.toLowerCase().includes(q)) return false;
    if (f.category && j.category !== f.category) return false;
    if (f.term && !j.terms.includes(f.term)) return false;
    if (loc || f.remote) {
      const l = j.locations.join(' | ').toLowerCase();
      if (!((loc && l.includes(loc)) || (f.remote && l.includes('remote')))) return false;
    }
    if (f.ats === 'supported' ? !SUPPORTED_ATS.includes(j.atsType) : f.ats && j.atsType !== f.ats) return false;
    if (cutoff && j.datePosted < cutoff) return false;
    if (f.degree && !j.degrees.includes(f.degree)) return false;
    if (f.status === 'not_skipped' ? j.userStatus === 'skipped' : f.status && j.userStatus !== f.status) return false;
    if (f.minScore !== '' && (j.match?.status !== 'scored' || j.match.score === null || j.match.score < f.minScore)) return false;
    if (f.prefs && pr) {
      if (pr.targetRoles.length && !pr.targetRoles.includes(j.category)) return false;
      if (prefTerms.length && !j.terms.some((t) => prefTerms.includes(t.toLowerCase()) || t === 'N/A')) return false;
      if (prefLocs.length || pr.remoteOk) {
        const l = j.locations.join(' | ').toLowerCase();
        if (!(prefLocs.some((p) => l.includes(p)) || (pr.remoteOk && l.includes('remote')))) return false;
      }
      if (excluded.includes(j.company.toLowerCase())) return false;
    }
    return true;
  });
}

