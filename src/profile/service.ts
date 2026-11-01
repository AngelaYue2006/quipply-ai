import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { profile as profileTable } from '../db/schema';
import { Profile, PROFILE_SECTIONS, emptyProfile, type ProfileSection } from '../shared/profile';

export type StoredProfile = { data: Profile; version: number };

/** The profile is a single row; create it empty on first read. */
export function getProfile(db: Db): StoredProfile {
  const row = db.select().from(profileTable).limit(1).get();
  if (row) return { data: Profile.parse(row.data), version: row.version };
  const data = emptyProfile();
  db.insert(profileTable).values({ data, version: 1 }).run();
  return { data, version: 1 };
}

/** Replace the whole profile and bump its version. Every write path goes through here. */
export function writeProfile(db: Db, next: Profile): StoredProfile {
  const data = Profile.parse(next);
  const current = getProfile(db);
  const version = current.version + 1;
  const row = db.select({ id: profileTable.id }).from(profileTable).limit(1).get()!;
  db.update(profileTable).set({ data, version }).where(eq(profileTable.id, row.id)).run();
  return { data, version };
}

export function saveSection(db: Db, section: ProfileSection, value: unknown): StoredProfile {
  const parsed = PROFILE_SECTIONS[section].parse(value);
  const current = getProfile(db);
  return writeProfile(db, { ...current.data, [section]: parsed });
}

/** Export format: the profile plus a marker so imports can be checked. */
export function exportProfile(db: Db) {
  return { format: 'quipply-profile', formatVersion: 1, exportedAt: new Date().toISOString(), profile: getProfile(db).data };
}

export function importProfile(db: Db, file: unknown): StoredProfile {
  const obj = (file ?? {}) as { format?: string; profile?: unknown };
  const raw = obj.format === 'quipply-profile' ? obj.profile : file;
  return writeProfile(db, Profile.parse(raw));
}
