import { describe, expect, it } from 'vitest';
import { llmCalls, resumeImports } from '../src/db/schema';
import { FakeLlmClient } from '../src/llm/client';
import { ResumeDraft, applyDraftItems, buildDraftItems, normalizeDraft } from '../src/profile/resume-draft';
import { acceptImport, discardImport, getImportReview, importFromResume, saveResume } from '../src/profile/resumes';
import { getProfile, writeProfile } from '../src/profile/service';
import { fakeProfile, fixture, testConfig, testDb } from './helpers';

const RECORDED = fixture('resume-import/recorded-response.json');
const FAKE_PDF = Buffer.from('%PDF-1.4\n% fake resume for tests\n%%EOF\n');

function draft() {
  return normalizeDraft(ResumeDraft.parse(JSON.parse(RECORDED)));
}

describe('resume draft schema', () => {
  it('cannot carry work authorization, standard answers, preferences or writing samples', () => {
    const keys = Object.keys(ResumeDraft.shape);
    expect(keys.sort()).toEqual(['contact', 'education', 'experience', 'identity', 'links', 'projects', 'skills']);
    expect(Object.keys(ResumeDraft.shape.identity.shape)).not.toContain('pronouns');
  });

  it('normalizes: trims bullets, drops malformed dates, clears end date for current roles', () => {
    const d = draft();
    expect(d.education[1]!.graduation).toBe(''); // "2023" isn't YYYY-MM, so it's dropped rather than guessed
    expect(d.experience[0]!.bullets[2]).toBe('Added integration tests');
    expect(d.experience[1]!.end).toBe('');
  });
});

describe('draft review items', () => {
  it('pre-checks new fields and leaves changed fields unchecked', () => {
    const items = buildDraftItems(fakeProfile(), draft());
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId['identity.middleName']).toMatchObject({ kind: 'new', defaultChecked: true });
    expect(byId['contact.email']).toMatchObject({ kind: 'changed', defaultChecked: false, current: 'testy@example.com' });
    expect(byId['identity.firstName']).toBeUndefined(); // unchanged
    expect(byId['links.github']).toBeUndefined(); // unchanged
    expect(byId['education.0']).toMatchObject({ kind: 'changed', defaultChecked: false });
    expect(byId['education.1']).toMatchObject({ kind: 'new', defaultChecked: true });
    expect(byId['experience.1']).toMatchObject({ kind: 'new' });
    expect(byId['skills.languages']!.imported).toBe('Go');
    expect(byId['skills.tools']!.imported).toBe('Kubernetes');
  });

  it('applies only the checked items', () => {
    const p = fakeProfile();
    const next = applyDraftItems(p, draft(), ['identity.middleName', 'education.1', 'skills.languages']);
    expect(next.identity.middleName).toBe('Q');
    expect(next.contact.email).toBe('testy@example.com'); // not checked
    expect(next.education).toHaveLength(2);
    expect(next.education[0]!.gpa).toBe('3.70'); // the changed entry wasn't checked
    expect(next.skills.languages.map((s) => s.name)).toContain('Go');
    expect(next.skills.tools.map((s) => s.name)).not.toContain('Kubernetes');
    expect(next.workAuth).toEqual(p.workAuth);
  });
});

describe('importFromResume end to end (recorded model response)', () => {
  it('stores a pending draft, logs the call, and accept merges + bumps the version', async () => {
    const db = testDb();
    const cfg = testConfig();
    writeProfile(db, fakeProfile());
    const { id: resumeId } = await saveResume(db, cfg, { filename: 'resume.pdf', bytes: FAKE_PDF });
    const client = new FakeLlmClient([RECORDED]);

    const { id } = await importFromResume(db, cfg, client, resumeId);
    expect(client.requests[0]!.documents?.[0]?.kind).toBe('pdf');
    expect(client.requests[0]!.model).toBe(cfg.importModel);

    const call = db.select().from(llmCalls).get()!;
    expect(call).toMatchObject({ action: 'resume_import', promptVersion: 'resume-import@1', ok: true });
    expect(call.costUsd).toBeGreaterThan(0);

    const review = getImportReview(db, id);
    expect(review.status).toBe('pending');
    const before = getProfile(db);
    const checked = review.items.filter((i) => i.defaultChecked).map((i) => i.id);
    const saved = acceptImport(db, id, checked);
    expect(saved.version).toBe(before.version + 1);
    expect(saved.data.identity.middleName).toBe('Q');
    expect(saved.data.workAuth).toEqual(before.data.workAuth);
    expect(db.select().from(resumeImports).get()!.status).toBe('accepted');
    expect(() => acceptImport(db, id, checked)).toThrow(/already/);
  });

  it('discard leaves the profile untouched', async () => {
    const db = testDb();
    const cfg = testConfig();
    writeProfile(db, fakeProfile());
    const { id: resumeId } = await saveResume(db, cfg, { filename: 'r.pdf', bytes: FAKE_PDF });
    const { id } = await importFromResume(db, cfg, new FakeLlmClient([RECORDED]), resumeId);
    const before = getProfile(db);
    discardImport(db, id);
    expect(getProfile(db)).toEqual(before);
  });

  it('rejects files that are not PDFs', async () => {
    await expect(saveResume(testDb(), testConfig(), { filename: 'x.docx', bytes: Buffer.from('PK...') })).rejects.toThrow(/PDF/);
  });
});
