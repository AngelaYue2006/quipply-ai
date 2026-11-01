import { z } from 'zod';

const s = () => z.string().default('');
const list = () => z.array(z.string()).default([]);
/** "YYYY-MM" or empty. */
const monthYear = () =>
  z
    .string()
    .regex(/^(\d{4}-(0[1-9]|1[0-2]))?$/, 'Use YYYY-MM')
    .default('');
/** yes / no / not answered. */
export const TriState = z.enum(['', 'yes', 'no']);
const tri = () => TriState.default('');

export const Identity = z.object({
  firstName: s(),
  middleName: s(),
  lastName: s(),
  preferredName: s(),
  pronouns: s(),
});

export const Contact = z.object({
  email: s(),
  phone: s(),
  street: s(),
  city: s(),
  state: s(),
  postalCode: s(),
  country: s(),
});

export const Links = z.object({
  linkedin: s(),
  github: s(),
  portfolio: s(),
  other: z.array(z.object({ label: s(), url: s() })).default([]),
});

export const DEGREE_TYPES = ['', 'BS', 'BA', 'MS', 'PhD', 'other'] as const;
export const Education = z.object({
  school: s(),
  degreeType: z.enum(DEGREE_TYPES).default(''),
  majors: list(),
  minors: list(),
  gpa: s(),
  gpaScale: s(),
  start: monthYear(),
  graduation: monthYear(),
  coursework: list(),
  honors: list(),
});

export const EMPLOYMENT_TYPES = ['', 'internship', 'full-time', 'part-time', 'research', 'TA'] as const;
export const Experience = z.object({
  company: s(),
  title: s(),
  employmentType: z.enum(EMPLOYMENT_TYPES).default(''),
  location: s(),
  start: monthYear(),
  end: monthYear(),
  current: z.boolean().default(false),
  bullets: list(),
  skills: list(),
});

export const Project = z.object({
  name: s(),
  role: s(),
  start: monthYear(),
  end: monthYear(),
  bullets: list(),
  skills: list(),
  link: s(),
});

export const SKILL_LEVELS = ['', 'familiar', 'proficient', 'expert'] as const;
export const Skill = z.object({ name: z.string(), level: z.enum(SKILL_LEVELS).default('') });
export const SKILL_CATEGORIES = ['languages', 'frameworks', 'tools', 'domains'] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];
/** Rows with an empty name are dropped on save. */
const skillList = () =>
  z
    .array(Skill)
    .transform((a) => a.filter((s) => s.name.trim() !== ''))
    .default([]);
export const Skills = z.object({
  languages: skillList(),
  frameworks: skillList(),
  tools: skillList(),
  domains: skillList(),
});

export const Preferences = z.object({
  /** Listing categories, e.g. "Software", "AI/ML/Data". */
  targetRoles: list(),
  /** Listing terms, e.g. "Summer 2027". */
  terms: list(),
  locations: list(),
  remoteOk: z.boolean().default(false),
  relocate: z.enum(['', 'yes', 'no', 'some']).default(''),
  relocateNote: s(),
  companyExclusions: list(),
  minPay: s(),
});

export const CITIZENSHIP = ['', 'us_citizen', 'permanent_resident', 'visa', 'other'] as const;
export const WorkAuth = z.object({
  authorizedUS: tri(),
  sponsorshipNow: tri(),
  sponsorshipFuture: tri(),
  citizenship: z.enum(CITIZENSHIP).default(''),
  clearance: z.enum(['', 'none', 'active']).default(''),
  clearanceLevel: s(),
});

export const DECLINE = 'Decline to answer';
export const StandardAnswers = z.object({
  over18: tri(),
  earliestStart: s(),
  fullTerm: tri(),
  heardAbout: s(),
  gender: s(),
  race: s(),
  veteran: s(),
  disability: s(),
});

export const WritingSample = z.object({
  title: s(),
  kind: z.enum(['essay', 'application answer', 'email', 'other']).default('other'),
  text: s(),
});

export const Profile = z.object({
  identity: Identity.default(Identity.parse({})),
  contact: Contact.default(Contact.parse({})),
  links: Links.default(Links.parse({})),
  education: z.array(Education).default([]),
  experience: z.array(Experience).default([]),
  projects: z.array(Project).default([]),
  skills: Skills.default(Skills.parse({})),
  preferences: Preferences.default(Preferences.parse({})),
  workAuth: WorkAuth.default(WorkAuth.parse({})),
  standardAnswers: StandardAnswers.default(StandardAnswers.parse({})),
  writingSamples: z.array(WritingSample).default([]),
});
export type Profile = z.infer<typeof Profile>;
export type Education = z.infer<typeof Education>;
export type Experience = z.infer<typeof Experience>;
export type Project = z.infer<typeof Project>;

/** Each section is saved on its own; this maps section name to its schema. */
export const PROFILE_SECTIONS = {
  identity: Identity,
  contact: Contact,
  links: Links,
  education: z.array(Education),
  experience: z.array(Experience),
  projects: z.array(Project),
  skills: Skills,
  preferences: Preferences,
  workAuth: WorkAuth,
  standardAnswers: StandardAnswers,
  writingSamples: z.array(WritingSample),
} as const;
export type ProfileSection = keyof typeof PROFILE_SECTIONS;
export const PROFILE_SECTION_NAMES = Object.keys(PROFILE_SECTIONS) as ProfileSection[];

export function emptyProfile(): Profile {
  return Profile.parse({});
}

/** True when a section has no filled-in value at all. Used by the completeness meter. */
export function isSectionEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'boolean') return true; // booleans alone don't count as filled
  if (Array.isArray(value)) return value.every(isSectionEmpty);
  if (typeof value === 'object') return Object.values(value).every(isSectionEmpty);
  return false;
}

/** The sections a resume can contain. Work authorization, standard answers and preferences are never here. */
export const RESUME_SECTIONS = ['identity', 'contact', 'links', 'education', 'experience', 'projects', 'skills'] as const;

/**
 * The profile subset sent to the model for matching: education, experience, projects and skills only.
 * Never contact details, work authorization, standard answers or writing samples.
 */
export function matchProfileSubset(p: Profile) {
  return { education: p.education, experience: p.experience, projects: p.projects, skills: p.skills };
}
