import { z } from 'zod';
import {
  Education,
  Experience,
  Project,
  SKILL_CATEGORIES,
  DEGREE_TYPES,
  EMPLOYMENT_TYPES,
  type Profile,
  type SkillCategory,
} from '../shared/profile';

/**
 * What the model returns for a resume import. Only sections a resume can contain:
 * work authorization, standard answers, preferences and writing samples are not in this schema at all.
 * Every field is required (empty string / empty list when unknown) so it maps onto structured outputs.
 */
export const ResumeDraft = z.object({
  identity: z.object({ firstName: z.string(), middleName: z.string(), lastName: z.string(), preferredName: z.string() }),
  contact: z.object({
    email: z.string(),
    phone: z.string(),
    street: z.string(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string(),
  }),
  links: z.object({
    linkedin: z.string(),
    github: z.string(),
    portfolio: z.string(),
    other: z.array(z.object({ label: z.string(), url: z.string() })),
  }),
  education: z.array(
    z.object({
      school: z.string(),
      degreeType: z.enum(DEGREE_TYPES),
      majors: z.array(z.string()),
      minors: z.array(z.string()),
      gpa: z.string(),
      gpaScale: z.string(),
      start: z.string(),
      graduation: z.string(),
      coursework: z.array(z.string()),
      honors: z.array(z.string()),
    }),
  ),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      employmentType: z.enum(EMPLOYMENT_TYPES),
      location: z.string(),
      start: z.string(),
      end: z.string(),
      current: z.boolean(),
      bullets: z.array(z.string()),
      skills: z.array(z.string()),
    }),
  ),
  projects: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      start: z.string(),
      end: z.string(),
      bullets: z.array(z.string()),
      skills: z.array(z.string()),
      link: z.string(),
    }),
  ),
  skills: z.object({
    languages: z.array(z.string()),
    frameworks: z.array(z.string()),
    tools: z.array(z.string()),
    domains: z.array(z.string()),
  }),
});
export type ResumeDraft = z.infer<typeof ResumeDraft>;

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const ym = (v: string) => (YM.test(v.trim()) ? v.trim() : '');
const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);

/** Trim strings, drop malformed dates and empty entries so the draft always fits the Profile schema. */
export function normalizeDraft(d: ResumeDraft): ResumeDraft {
  const t = <T extends Record<string, string>>(o: T): T =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.trim()])) as T;
  return {
    identity: t(d.identity),
    contact: t(d.contact),
    links: {
      linkedin: d.links.linkedin.trim(),
      github: d.links.github.trim(),
      portfolio: d.links.portfolio.trim(),
      other: d.links.other.map((o) => ({ label: o.label.trim(), url: o.url.trim() })).filter((o) => o.url),
    },
    education: d.education
      .map((e) => ({
        ...e,
        school: e.school.trim(),
        gpa: e.gpa.trim(),
        gpaScale: e.gpaScale.trim(),
        start: ym(e.start),
        graduation: ym(e.graduation),
        majors: clean(e.majors),
        minors: clean(e.minors),
        coursework: clean(e.coursework),
        honors: clean(e.honors),
      }))
      .filter((e) => e.school),
    experience: d.experience
      .map((e) => ({
        ...e,
        company: e.company.trim(),
        title: e.title.trim(),
        location: e.location.trim(),
        start: ym(e.start),
        end: e.current ? '' : ym(e.end),
        bullets: clean(e.bullets),
        skills: clean(e.skills),
      }))
      .filter((e) => e.company || e.title),
    projects: d.projects
      .map((p) => ({
        ...p,
        name: p.name.trim(),
        role: p.role.trim(),
        link: p.link.trim(),
        start: ym(p.start),
        end: ym(p.end),
        bullets: clean(p.bullets),
        skills: clean(p.skills),
      }))
      .filter((p) => p.name),
    skills: {
      languages: clean(d.skills.languages),
      frameworks: clean(d.skills.frameworks),
      tools: clean(d.skills.tools),
      domains: clean(d.skills.domains),
    },
  };
}

type Op =
  | { type: 'set'; section: 'identity' | 'contact' | 'links'; field: string; value: string }
  | { type: 'appendLink'; value: { label: string; url: string } }
  | { type: 'append'; section: 'education' | 'experience' | 'projects'; value: unknown }
  | { type: 'replace'; section: 'education' | 'experience' | 'projects'; index: number; value: unknown }
  | { type: 'addSkills'; category: SkillCategory; names: string[] };

/** One reviewable change: current value vs imported value, with a checkbox. */
export type DraftItem = {
  id: string;
  section: string;
  label: string;
  current: string;
  imported: string;
  kind: 'new' | 'changed';
  /** New fields are pre-checked; changed fields are not. */
  defaultChecked: boolean;
  op: Op;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const FIELD_LABELS: Record<string, string> = {
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  preferredName: 'Preferred name',
  email: 'Email',
  phone: 'Phone',
  street: 'Street',
  city: 'City',
  state: 'State',
  postalCode: 'Postal code',
  country: 'Country',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfolio',
};

function describeEducation(e: z.infer<typeof Education> | ResumeDraft['education'][number]) {
  const degree = [e.degreeType, e.majors.join(', ')].filter(Boolean).join(' ');
  return [e.school, degree, e.graduation && `grad ${e.graduation}`, e.gpa && `GPA ${e.gpa}`].filter(Boolean).join(' · ');
}
function describeExperience(e: z.infer<typeof Experience> | ResumeDraft['experience'][number]) {
  const dates = [e.start, e.current ? 'present' : e.end].filter(Boolean).join(' – ');
  return [`${e.title} at ${e.company}`, dates, `${e.bullets.length} bullets`].filter(Boolean).join(' · ');
}
function describeProject(p: z.infer<typeof Project> | ResumeDraft['projects'][number]) {
  return [p.name, p.role, p.skills.join(', '), `${p.bullets.length} bullets`].filter(Boolean).join(' · ');
}

/** Compare a draft with the current profile and list every field the import would change. */
export function buildDraftItems(profile: Profile, draft: ResumeDraft): DraftItem[] {
  const items: DraftItem[] = [];

  for (const section of ['identity', 'contact'] as const) {
    for (const [field, value] of Object.entries(draft[section])) {
      const current = (profile[section] as Record<string, string>)[field] ?? '';
      if (!value || value === current) continue;
      const kind = current ? 'changed' : 'new';
      items.push({
        id: `${section}.${field}`,
        section,
        label: FIELD_LABELS[field] ?? field,
        current,
        imported: value,
        kind,
        defaultChecked: kind === 'new',
        op: { type: 'set', section, field, value },
      });
    }
  }
  for (const field of ['linkedin', 'github', 'portfolio'] as const) {
    const value = draft.links[field];
    const current = profile.links[field];
    if (!value || value === current) continue;
    const kind = current ? 'changed' : 'new';
    items.push({
      id: `links.${field}`,
      section: 'links',
      label: FIELD_LABELS[field]!,
      current,
      imported: value,
      kind,
      defaultChecked: kind === 'new',
      op: { type: 'set', section: 'links', field, value },
    });
  }
  draft.links.other.forEach((link, i) => {
    if (profile.links.other.some((o) => o.url === link.url)) return;
    items.push({
      id: `links.other.${i}`,
      section: 'links',
      label: `Other link${link.label ? ` (${link.label})` : ''}`,
      current: '',
      imported: link.url,
      kind: 'new',
      defaultChecked: true,
      op: { type: 'appendLink', value: link },
    });
  });

  const listSection = <K extends 'education' | 'experience' | 'projects'>(
    section: K,
    key: (e: Profile[K][number] | ResumeDraft[K][number]) => string,
    describe: (e: never) => string,
    toProfile: (e: ResumeDraft[K][number]) => Profile[K][number],
    label: string,
  ) => {
    const current = profile[section] as Profile[K][number][];
    (draft[section] as ResumeDraft[K][number][]).forEach((entry, i) => {
      const value = toProfile(entry);
      const k = key(entry);
      const index = current.findIndex((c) => key(c) === k);
      if (index === -1) {
        items.push({
          id: `${section}.${i}`,
          section,
          label: `New ${label}`,
          current: '',
          imported: describe(value as never),
          kind: 'new',
          defaultChecked: true,
          op: { type: 'append', section, value },
        });
      } else if (JSON.stringify(current[index]) !== JSON.stringify(value)) {
        items.push({
          id: `${section}.${i}`,
          section,
          label: `Update ${label}`,
          current: describe(current[index] as never),
          imported: describe(value as never),
          kind: 'changed',
          defaultChecked: false,
          op: { type: 'replace', section, index, value },
        });
      }
    });
  };
  listSection('education', (e) => norm(e.school), describeEducation, (e) => Education.parse(e), 'education');
  listSection('experience', (e) => norm(`${e.company}|${e.title}`), describeExperience, (e) => Experience.parse(e), 'experience');
  listSection('projects', (p) => norm(p.name), describeProject, (p) => Project.parse(p), 'project');

  for (const category of SKILL_CATEGORIES) {
    const have = new Set(profile.skills[category].map((s) => s.name.toLowerCase()));
    const names = [...new Set(draft.skills[category])].filter((n) => !have.has(n.toLowerCase()));
    if (names.length === 0) continue;
    items.push({
      id: `skills.${category}`,
      section: 'skills',
      label: `Add ${category}`,
      current: profile.skills[category].map((s) => s.name).join(', '),
      imported: names.join(', '),
      kind: 'new',
      defaultChecked: true,
      op: { type: 'addSkills', category, names },
    });
  }
  return items;
}

/** Apply the checked items to a copy of the profile. Items are recomputed against the current profile first. */
export function applyDraftItems(profile: Profile, draft: ResumeDraft, selectedIds: string[]): Profile {
  const selected = new Set(selectedIds);
  const next: Profile = structuredClone(profile);
  const items = buildDraftItems(profile, draft).filter((i) => selected.has(i.id));
  for (const { op } of items) {
    switch (op.type) {
      case 'set':
        (next[op.section] as Record<string, unknown>)[op.field] = op.value;
        break;
      case 'appendLink':
        next.links.other.push(op.value);
        break;
      case 'append':
        (next[op.section] as unknown[]).push(op.value);
        break;
      case 'replace':
        (next[op.section] as unknown[])[op.index] = op.value;
        break;
      case 'addSkills':
        next.skills[op.category].push(...op.names.map((name) => ({ name, level: '' as const })));
        break;
    }
  }
  return next;
}
