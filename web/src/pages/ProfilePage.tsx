import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, openBlob } from '../api';
import { Badge, Button, Card, Input, Spinner } from '../components/ui';
import { useToast } from '../components/toast';
import { navigate } from '../router';
import { Icon } from '../components/Icon';
import { timeAgo } from '../format';
import { PROFILE_SECTION_NAMES, isSectionEmpty, type ProfileSection } from '../../../src/shared/profile';
import {
  ContactSection,
  EducationSection,
  ExperienceSection,
  IdentitySection,
  LinksSection,
  PreferencesSection,
  ProjectsSection,
  SkillsSection,
  StandardAnswersSection,
  WorkAuthSection,
  WritingSamplesSection,
  type StoredProfile,
} from './profile/sections';

const SECTION_LABELS: Record<ProfileSection, string> = {
  identity: 'Identity',
  contact: 'Contact',
  links: 'Links',
  education: 'Education',
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
  preferences: 'Preferences',
  workAuth: 'Work authorization',
  standardAnswers: 'Standard answers',
  writingSamples: 'Writing samples',
};

type ResumeRow = { id: number; originalName: string; label: string; isDefault: boolean; createdAt: number; textLength: number };

function Completeness({ p }: { p: StoredProfile }) {
  const empty = PROFILE_SECTION_NAMES.filter((s) => isSectionEmpty(p.data[s]));
  const done = PROFILE_SECTION_NAMES.length - empty.length;
  const pct = Math.round((100 * done) / PROFILE_SECTION_NAMES.length);
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-2 w-48 overflow-hidden rounded-full bg-slate-700">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm text-slate-300">
          {done} of {PROFILE_SECTION_NAMES.length} sections filled
        </span>
      </div>
      {empty.length > 0 && <p className="mt-1 truncate text-xs text-slate-400">Empty: {empty.map((s) => SECTION_LABELS[s]).join(', ')}</p>}
    </div>
  );
}

function ResumesCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const resumes = useQuery({ queryKey: ['resumes'], queryFn: () => api<ResumeRow[]>('/resumes') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['resumes'] });
  const onError = (e: unknown) => toast((e as Error).message, 'error');

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<{ id: number }>('/resumes', { form });
    },
    onSuccess: () => {
      refresh();
      toast('Resume uploaded.', 'success');
    },
    onError,
  });
  const patch = useMutation({
    mutationFn: ({ id, ...body }: { id: number; label?: string; isDefault?: boolean }) => api(`/resumes/${id}`, { method: 'PATCH', body }),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({ mutationFn: (id: number) => api(`/resumes/${id}`, { method: 'DELETE' }), onSuccess: refresh, onError });
  const importIt = useMutation({
    mutationFn: (id: number) => api<{ id: number }>(`/resumes/${id}/import`, { method: 'POST' }),
    onSuccess: (r) => navigate(`/profile/import/${r.id}`),
    onError,
  });

  return (
    <Card
      title="Resumes"
      description="PDFs stay on this machine. Import sends the PDF to Claude once to draft your profile; you review every field before anything is saved."
      actions={
        <>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = '';
            }}
          />
          <Button size="sm" onClick={() => fileRef.current?.click()} loading={upload.isPending}>
            Upload PDF
          </Button>
        </>
      }
    >
      {resumes.data?.length ? (
        <ul className="divide-y divide-slate-800">
          {resumes.data.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <button className="min-w-0 truncate text-left text-sm font-medium text-indigo-200 hover:underline" onClick={() => openBlob(`/resumes/${r.id}/file`).catch(onError)}>
                {r.originalName}
              </button>
              {r.isDefault ? <Badge color="indigo">default</Badge> : (
                <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: r.id, isDefault: true })}>
                  Make default
                </Button>
              )}
              {r.textLength === 0 && <Badge color="amber">no text layer</Badge>}
              <Input
                aria-label={`Label for ${r.originalName}`} className="h-7 w-40 text-xs"
                defaultValue={r.label}
                placeholder="Label, e.g. SWE"
                onBlur={(e) => e.target.value !== r.label && patch.mutate({ id: r.id, label: e.target.value })}
              />
              <span className="text-xs text-slate-400">{timeAgo(r.createdAt)}</span>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="primary" loading={importIt.isPending && importIt.variables === r.id} disabled={importIt.isPending} onClick={() => importIt.mutate(r.id)}>
                  Import from resume
                </Button>
                <Button size="sm" variant="danger" onClick={() => confirm(`Delete ${r.originalName}?`) && remove.mutate(r.id)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-400">{resumes.isLoading ? 'Loading…' : 'No resumes yet. Upload a PDF to import your profile from it.'}</p>
      )}
      {importIt.isPending && (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-300">
          <Spinner /> Reading your resume with Claude. This usually takes under a minute…
        </p>
      )}
    </Card>
  );
}

export function ProfilePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api<StoredProfile>('/profile') });

  const importJson = async (file: File) => {
    setImporting(true);
    try {
      const saved = await api<StoredProfile>('/profile/import', { body: JSON.parse(await file.text()) });
      qc.setQueryData(['profile'], saved);
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['job'] });
      toast('Profile imported.', 'success');
    } catch (e) {
      toast(e instanceof SyntaxError ? 'That file is not valid JSON.' : (e as Error).message, 'error');
    } finally {
      setImporting(false);
    }
  };

  if (profile.isLoading) return <div className="p-6 text-sm text-slate-400">Loading profile…</div>;
  if (profile.error) return <div className="p-6 text-sm text-red-200">{(profile.error as Error).message}</div>;
  const p = profile.data!;

  return (
    <div className="content-page">
      <div className="content-container">
        <div className="page-heading">
          <div><p className="eyebrow">THE PERSON BEHIND THE APPLICATION</p><h1>Your profile.</h1><p className="page-description">Your experience, skills, and preferences. A better picture makes a better match.</p></div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => openBlob('/profile/export', 'quipply-profile.json').catch((e) => toast(e.message, 'error'))}>
              Export JSON
            </Button>
            <input
              ref={importRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && confirm('Replace your whole profile with this file?')) importJson(f);
                e.target.value = '';
              }}
            />
            <Button size="sm" loading={importing} onClick={() => importRef.current?.click()}>
              Import JSON
            </Button>
          </div>
        </div>

        <div className="profile-progress"><div><h2>A little context goes a long way.</h2><p>Start with your resume, or fill in each section below. Save sections as you go.</p></div><Completeness p={p} /></div>
        <div className="profile-layout">
          <nav className="profile-nav" aria-label="Profile sections">
            <button onClick={() => document.getElementById('profile-resumes')?.scrollIntoView({ block: 'start' })}>Resumes <Icon name="file" size={13} /></button>
            {PROFILE_SECTION_NAMES.map(section => <button key={section} onClick={() => document.getElementById(`profile-${section}`)?.scrollIntoView({ block: 'start' })}>{SECTION_LABELS[section]}{!isSectionEmpty(p.data[section]) && <span className="section-complete" aria-label="Has saved information"><Icon name="check" size={12} /></span>}</button>)}
          </nav>
          <div className="profile-sections">
            <div id="profile-resumes"><ResumesCard /></div>
            <div id="profile-identity"><IdentitySection p={p.data} /></div>
            <div id="profile-contact"><ContactSection p={p.data} /></div>
            <div id="profile-links"><LinksSection p={p.data} /></div>
            <div id="profile-education"><EducationSection p={p.data} /></div>
            <div id="profile-experience"><ExperienceSection p={p.data} /></div>
            <div id="profile-projects"><ProjectsSection p={p.data} /></div>
            <div id="profile-skills"><SkillsSection p={p.data} /></div>
            <div id="profile-preferences"><PreferencesSection p={p.data} /></div>
            <div id="profile-workAuth"><WorkAuthSection p={p.data} /></div>
            <div id="profile-standardAnswers"><StandardAnswersSection p={p.data} /></div>
            <div id="profile-writingSamples"><WritingSamplesSection p={p.data} /></div>
          </div>
        </div>
        <p className="pt-6 pb-4 text-center text-xs text-slate-400">Profile version {p.version}</p>
      </div>
    </div>
  );
}
