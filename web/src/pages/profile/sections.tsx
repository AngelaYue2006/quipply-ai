import { useEffect, type ReactNode } from 'react';
import { useFieldArray, useForm, type FieldValues, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { api } from '../../api';
import { Badge, Button, Card } from '../../components/ui';
import { useToast } from '../../components/toast';
import {
  CITIZENSHIP,
  Contact,
  DECLINE,
  DEGREE_TYPES,
  EMPLOYMENT_TYPES,
  Education,
  Experience,
  Identity,
  Links,
  Preferences,
  Project,
  SKILL_CATEGORIES,
  SKILL_LEVELS,
  Skills,
  StandardAnswers,
  WorkAuth,
  WritingSample,
  type Profile,
  type ProfileSection,
} from '../../../../src/shared/profile';
import { CheckField, ChoiceField, LinesField, MonthField, SelectField, TagsField, TextField, type Form } from './fields';

export type StoredProfile = { data: Profile; version: number };

/** One card = one section = one Save button. List sections are wrapped as { items } for the form. */
function SectionForm({
  section,
  title,
  description,
  schema,
  value,
  list,
  youOnly,
  children,
}: {
  section: ProfileSection;
  title: string;
  description?: string;
  schema: z.ZodType;
  value: unknown;
  list?: boolean;
  youOnly?: boolean;
  children: (form: Form) => ReactNode;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const formSchema = list ? z.object({ items: schema }) : schema;
  const initial = list ? { items: value } : value;
  const form = useForm<FieldValues>({ defaultValues: initial as FieldValues, resolver: zodResolver(formSchema as never) as Resolver });
  const key = JSON.stringify(initial);
  useEffect(() => {
    if (!form.formState.isDirty) form.reset(initial as FieldValues);
  }, [key]); // reset only when the stored value changes

  const save = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      api<StoredProfile>(`/profile/sections/${section}`, { method: 'PUT', body: list ? values.items : values }),
    onSuccess: (saved, values) => {
      form.reset(values);
      qc.setQueryData(['profile'], saved);
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['job'] });
      toast(`${title} saved.`, 'success');
    },
    onError: (err) => toast((err as Error).message, 'error'),
  });

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
      <Card
        title={
          <span className="flex items-center gap-2">
            {title}
            {youOnly && <Badge color="violet">you only</Badge>}
          </span>
        }
        description={description}
        actions={
          <>
            {form.formState.isDirty && <span className="text-xs text-amber-200">Unsaved changes</span>}
            <Button type="submit" variant="primary" size="sm" loading={save.isPending} disabled={!form.formState.isDirty}>
              Save
            </Button>
          </>
        }
      >
        {children(form)}
      </Card>
    </form>
  );
}

const grid = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3';
const opts = (values: readonly string[], labels: Record<string, string> = {}) =>
  values.map((v) => [v, labels[v] ?? (v === '' ? '—' : v)] as const);
const TRI = opts(['', 'yes', 'no'], { '': 'Not answered', yes: 'Yes', no: 'No' });

function ListEditor({ form, name, empty, newItem, addLabel, children }: { form: Form; name: string; empty: string; newItem: object; addLabel: string; children: (i: number) => ReactNode }) {
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name });
  return (
    <div className="space-y-3">
      {fields.length === 0 && <p className="text-sm text-slate-400">{empty}</p>}
      {fields.map((f, i) => (
        <div key={f.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">#{i + 1}</span>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Move up">
                ↑
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={i === fields.length - 1} onClick={() => move(i, i + 1)} aria-label="Move down">
                ↓
              </Button>
              <Button type="button" size="sm" variant="ghost" className="text-red-200" onClick={() => remove(i)}>
                Remove
              </Button>
            </div>
          </div>
          {children(i)}
        </div>
      ))}
      <Button type="button" size="sm" onClick={() => append(newItem)}>
        + {addLabel}
      </Button>
    </div>
  );
}

export function IdentitySection({ p }: { p: Profile }) {
  return (
    <SectionForm section="identity" title="Identity" schema={Identity} value={p.identity}>
      {(f) => (
        <div className={grid}>
          <TextField form={f} name="firstName" label="Legal first name" />
          <TextField form={f} name="middleName" label="Middle name" />
          <TextField form={f} name="lastName" label="Legal last name" />
          <TextField form={f} name="preferredName" label="Preferred name" />
          <TextField form={f} name="pronouns" label="Pronouns" hint="optional" />
        </div>
      )}
    </SectionForm>
  );
}

export function ContactSection({ p }: { p: Profile }) {
  return (
    <SectionForm section="contact" title="Contact" schema={Contact} value={p.contact}>
      {(f) => (
        <div className={grid}>
          <TextField form={f} name="email" label="Email" type="email" />
          <TextField form={f} name="phone" label="Phone" type="tel" />
          <TextField form={f} name="street" label="Street" className="lg:col-span-1" />
          <TextField form={f} name="city" label="City" />
          <TextField form={f} name="state" label="State" />
          <TextField form={f} name="postalCode" label="Postal code" />
          <TextField form={f} name="country" label="Country" />
        </div>
      )}
    </SectionForm>
  );
}

export function LinksSection({ p }: { p: Profile }) {
  return (
    <SectionForm section="links" title="Links" schema={Links} value={p.links}>
      {(f) => (
        <div className="space-y-4">
          <div className={grid}>
            <TextField form={f} name="linkedin" label="LinkedIn" placeholder="https://linkedin.com/in/…" />
            <TextField form={f} name="github" label="GitHub" placeholder="https://github.com/…" />
            <TextField form={f} name="portfolio" label="Portfolio / website" />
          </div>
          <ListEditor form={f} name="other" empty="No other links." newItem={{ label: '', url: '' }} addLabel="Add link">
            {(i) => (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TextField form={f} name={`other.${i}.label`} label="Label" />
                <TextField form={f} name={`other.${i}.url`} label="URL" className="sm:col-span-2" />
              </div>
            )}
          </ListEditor>
        </div>
      )}
    </SectionForm>
  );
}

export function EducationSection({ p }: { p: Profile }) {
  return (
    <SectionForm section="education" title="Education" description="The first entry is your current one; it's used for degree and graduation checks." schema={z.array(Education)} value={p.education} list>
      {(f) => (
        <ListEditor form={f} name="items" empty="No education yet." newItem={Education.parse({})} addLabel="Add education">
          {(i) => (
            <div className={grid}>
              <TextField form={f} name={`items.${i}.school`} label="School" className="sm:col-span-2" />
              <SelectField form={f} name={`items.${i}.degreeType`} label="Degree" options={opts(DEGREE_TYPES)} />
              <TagsField form={f} name={`items.${i}.majors`} label="Major(s)" />
              <TagsField form={f} name={`items.${i}.minors`} label="Minor(s)" />
              <div className="grid grid-cols-2 gap-3">
                <TextField form={f} name={`items.${i}.gpa`} label="GPA" />
                <TextField form={f} name={`items.${i}.gpaScale`} label="Scale" placeholder="4.0" />
              </div>
              <MonthField form={f} name={`items.${i}.start`} label="Start" />
              <MonthField form={f} name={`items.${i}.graduation`} label="Expected graduation" />
              <div />
              <LinesField form={f} name={`items.${i}.coursework`} label="Relevant coursework" className="sm:col-span-2 lg:col-span-1" />
              <LinesField form={f} name={`items.${i}.honors`} label="Honors" className="sm:col-span-2 lg:col-span-2" />
            </div>
          )}
        </ListEditor>
      )}
    </SectionForm>
  );
}

export function ExperienceSection({ p }: { p: Profile }) {
  return (
    <SectionForm section="experience" title="Experience" schema={z.array(Experience)} value={p.experience} list>
      {(f) => (
        <ListEditor form={f} name="items" empty="No experience yet." newItem={Experience.parse({})} addLabel="Add experience">
          {(i) => (
            <div className={grid}>
              <TextField form={f} name={`items.${i}.company`} label="Company" />
              <TextField form={f} name={`items.${i}.title`} label="Title" />
              <SelectField form={f} name={`items.${i}.employmentType`} label="Type" options={opts(EMPLOYMENT_TYPES)} />
              <TextField form={f} name={`items.${i}.location`} label="Location" />
              <MonthField form={f} name={`items.${i}.start`} label="Start" />
              <div className="space-y-2">
                <MonthField form={f} name={`items.${i}.end`} label="End" />
                <CheckField form={f} name={`items.${i}.current`} label="I work here now" />
              </div>
              <LinesField form={f} name={`items.${i}.bullets`} label="Bullet points" rows={4} className="sm:col-span-2 lg:col-span-2" />
              <TagsField form={f} name={`items.${i}.skills`} label="Skills used" />
            </div>
          )}
        </ListEditor>
      )}
    </SectionForm>
  );
}

export function ProjectsSection({ p }: { p: Profile }) {
  return (
    <SectionForm section="projects" title="Projects" schema={z.array(Project)} value={p.projects} list>
      {(f) => (
        <ListEditor form={f} name="items" empty="No projects yet." newItem={Project.parse({})} addLabel="Add project">
          {(i) => (
            <div className={grid}>
              <TextField form={f} name={`items.${i}.name`} label="Name" />
              <TextField form={f} name={`items.${i}.role`} label="Role" />
              <TextField form={f} name={`items.${i}.link`} label="Link" />
              <MonthField form={f} name={`items.${i}.start`} label="Start" />
              <MonthField form={f} name={`items.${i}.end`} label="End" />
              <TagsField form={f} name={`items.${i}.skills`} label="Skills" />
              <LinesField form={f} name={`items.${i}.bullets`} label="Description bullets" rows={3} className="sm:col-span-2 lg:col-span-3" />
            </div>
          )}
        </ListEditor>
      )}
    </SectionForm>
  );
}

const SKILL_TITLES: Record<string, string> = { languages: 'Languages', frameworks: 'Frameworks & libraries', tools: 'Tools & platforms', domains: 'Domains' };

function SkillList({ form, category }: { form: Form; category: string }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: category });
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-300">{SKILL_TITLES[category]}</p>
      <div className="space-y-1.5">
        {fields.map((fld, i) => (
          <div key={fld.id} className="flex gap-1.5">
            <input
              aria-label={`${SKILL_TITLES[category]} skill ${i + 1}`}
              {...form.register(`${category}.${i}.name`)}
              placeholder="e.g. Python"
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-700 px-2 text-sm focus:border-accent focus:outline-none"
            />
            <select aria-label={`Level for ${category} skill ${i + 1}`} {...form.register(`${category}.${i}.level`)} className="h-8 w-28 rounded-md border border-slate-700 px-1 text-xs text-slate-300">
              {SKILL_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l || 'level'}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => remove(i)} className="px-1 text-slate-400 hover:text-red-200" aria-label="Remove skill">
              ×
            </button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => append({ name: '', level: '' })}>
          + Add
        </Button>
      </div>
    </div>
  );
}

export function SkillsSection({ p }: { p: Profile }) {
  return (
    <SectionForm section="skills" title="Skills" description="Matching relies heavily on these. Empty rows are ignored." schema={Skills} value={p.skills}>
      {(f) => (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {SKILL_CATEGORIES.map((c) => (
            <SkillList key={c} form={f} category={c} />
          ))}
        </div>
      )}
    </SectionForm>
  );
}

const CATEGORIES = ['Software', 'AI/ML/Data', 'Hardware', 'Product', 'Quant'] as const;

export function PreferencesSection({ p }: { p: Profile }) {
  return (
    <SectionForm section="preferences" title="Preferences" description="Drives 'Apply my preferences' on the Jobs screen and the term and location checks." schema={Preferences} value={p.preferences}>
      {(f) => (
        <div className={grid}>
          <ChoiceField form={f} name="targetRoles" label="Target categories" options={CATEGORIES} className="sm:col-span-2 lg:col-span-3" />
          <TagsField form={f} name="terms" label="Terms" placeholder="Summer 2027" />
          <TagsField form={f} name="locations" label="Locations" placeholder="New York, Seattle" />
          <div className="flex items-end pb-2">
            <CheckField form={f} name="remoteOk" label="Remote is OK" />
          </div>
          <SelectField form={f} name="relocate" label="Willing to relocate" options={opts(['', 'yes', 'no', 'some'], { '': 'Not answered', yes: 'Yes', no: 'No', some: 'Some places' })} />
          <TextField form={f} name="relocateNote" label="Relocation note" placeholder="e.g. not to Texas" />
          <TextField form={f} name="minPay" label="Minimum pay" hint="optional" placeholder="$40/hr" />
          <TagsField form={f} name="companyExclusions" label="Companies to exclude" className="sm:col-span-2 lg:col-span-3" />
        </div>
      )}
    </SectionForm>
  );
}

export function WorkAuthSection({ p }: { p: Profile }) {
  return (
    <SectionForm
      section="workAuth"
      title="Work authorization"
      description="Entered by you only. Resume import never fills these, and no model infers them."
      schema={WorkAuth}
      value={p.workAuth}
      youOnly
    >
      {(f) => (
        <div className={grid}>
          <SelectField form={f} name="authorizedUS" label="Authorized to work in the US" options={TRI} />
          <SelectField form={f} name="sponsorshipNow" label="Need sponsorship now" options={TRI} />
          <SelectField form={f} name="sponsorshipFuture" label="Need sponsorship in the future" options={TRI} />
          <SelectField
            form={f}
            name="citizenship"
            label="Citizenship status"
            options={opts(CITIZENSHIP, { '': 'Not answered', us_citizen: 'U.S. citizen', permanent_resident: 'Permanent resident', visa: 'Visa holder', other: 'Other' })}
          />
          <SelectField form={f} name="clearance" label="Security clearance" options={opts(['', 'none', 'active'], { '': 'Not answered', none: 'None', active: 'Active clearance' })} />
          <TextField form={f} name="clearanceLevel" label="Clearance level" hint="if active" />
        </div>
      )}
    </SectionForm>
  );
}

export function StandardAnswersSection({ p }: { p: Profile }) {
  return (
    <SectionForm
      section="standardAnswers"
      title="Standard answers"
      description="Common application questions. EEO answers are yours only and default to declining."
      schema={StandardAnswers}
      value={p.standardAnswers}
      youOnly
    >
      {(f) => (
        <div className={grid}>
          <SelectField form={f} name="over18" label="Over 18" options={TRI} />
          <TextField form={f} name="earliestStart" label="Earliest start date" type="date" />
          <SelectField form={f} name="fullTerm" label="Available for the full term" options={TRI} />
          <TextField form={f} name="heardAbout" label="How you heard about us (default)" placeholder="Job board" />
          <TextField form={f} name="gender" label="Gender" list="eeo-gender" />
          <TextField form={f} name="race" label="Race / ethnicity" list="eeo-decline" />
          <TextField form={f} name="veteran" label="Veteran status" list="eeo-veteran" />
          <TextField form={f} name="disability" label="Disability" list="eeo-disability" />
          <datalist id="eeo-decline">
            <option value={DECLINE} />
          </datalist>
          <datalist id="eeo-gender">
            {['Female', 'Male', 'Non-binary', DECLINE].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <datalist id="eeo-veteran">
            {['I am not a protected veteran', 'I identify as a protected veteran', DECLINE].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <datalist id="eeo-disability">
            {['No, I do not have a disability', 'Yes, I have a disability', DECLINE].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </div>
      )}
    </SectionForm>
  );
}

export function WritingSamplesSection({ p }: { p: Profile }) {
  return (
    <SectionForm section="writingSamples" title="Writing samples" description="Your own writing, kept for voice matching in later versions." schema={z.array(WritingSample)} value={p.writingSamples} list>
      {(f) => (
        <ListEditor form={f} name="items" empty="No writing samples yet." newItem={WritingSample.parse({})} addLabel="Add sample">
          {(i) => (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <TextField form={f} name={`items.${i}.title`} label="Title" className="sm:col-span-2" />
              <SelectField form={f} name={`items.${i}.kind`} label="Kind" options={opts(['essay', 'application answer', 'email', 'other'])} />
              <div className="sm:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-300">Text</label>
                <textarea
                  {...f.register(`items.${i}.text`)}
                  rows={5}
                  className="w-full rounded-md border border-slate-700 px-2.5 py-2 text-sm leading-relaxed focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          )}
        </ListEditor>
      )}
    </SectionForm>
  );
}
