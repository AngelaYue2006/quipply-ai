import { describe, expect, it } from 'vitest';
import { Profile, emptyProfile, isSectionEmpty, PROFILE_SECTION_NAMES } from '../src/shared/profile';
import { exportProfile, getProfile, importProfile, saveSection, writeProfile } from '../src/profile/service';
import { fakeProfile, testDb } from './helpers';

describe('Profile schema', () => {
  it('round-trips through JSON without changes', () => {
    const p = fakeProfile();
    expect(Profile.parse(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('fills defaults for an empty object and every section is present', () => {
    const p = emptyProfile();
    expect(Object.keys(p).sort()).toEqual([...PROFILE_SECTION_NAMES].sort());
    expect(p.education).toEqual([]);
    expect(p.workAuth.citizenship).toBe('');
  });

  it('rejects malformed dates', () => {
    expect(() => Profile.parse({ education: [{ school: 'X', graduation: '05/2027' }] })).toThrow();
  });

  it('isSectionEmpty treats blank strings, empty lists and lone booleans as empty', () => {
    const p = emptyProfile();
    expect(isSectionEmpty(p.identity)).toBe(true);
    expect(isSectionEmpty(p.preferences)).toBe(true);
    expect(isSectionEmpty({ ...p.identity, firstName: 'A' })).toBe(false);
  });
});

describe('profile service', () => {
  it('creates an empty profile on first read and survives reopening the same file', async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const { openDb } = await import('../src/db/client');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quipply-db-')), 'q.db');
    const db1 = openDb(file);
    saveSection(db1, 'identity', { firstName: 'Testy' });
    const db2 = openDb(file); // simulates a restart
    expect(getProfile(db2).data.identity.firstName).toBe('Testy');
  });

  it('saves one section without touching the others', () => {
    const db = testDb();
    writeProfile(db, fakeProfile());
    saveSection(db, 'contact', { email: 'new@example.com' });
    const p = getProfile(db).data;
    expect(p.contact.email).toBe('new@example.com');
    expect(p.contact.phone).toBe(''); // the section is replaced as a whole
    expect(p.identity.firstName).toBe('Testy');
    expect(p.education).toHaveLength(1);
  });

  it('increments the version on every write path', () => {
    const db = testDb();
    const v0 = getProfile(db).version;
    expect(saveSection(db, 'identity', {}).version).toBe(v0 + 1);
    expect(writeProfile(db, fakeProfile()).version).toBe(v0 + 2);
    expect(importProfile(db, exportProfile(db)).version).toBe(v0 + 3);
  });

  it('export then import gives an identical profile', () => {
    const db = testDb();
    writeProfile(db, fakeProfile());
    const exported = JSON.parse(JSON.stringify(exportProfile(db)));
    const other = testDb();
    importProfile(other, exported);
    expect(getProfile(other).data).toEqual(getProfile(db).data);
  });

  it('rejects an import that is not a valid profile', () => {
    const db = testDb();
    expect(() => importProfile(db, { format: 'quipply-profile', profile: { education: 'nope' } })).toThrow();
  });
});
