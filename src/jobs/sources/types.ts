import { z } from 'zod';

/** One entry of the listings file, validated. Unknown extra fields are ignored. */
export const RawListing = z.object({
  id: z.string().min(1),
  company_name: z.string().min(1),
  company_url: z.string().default(''),
  title: z.string().min(1),
  locations: z.array(z.string()).default([]),
  terms: z.array(z.string()).default([]),
  category: z.string().default(''),
  degrees: z.array(z.string()).default([]),
  sponsorship: z.string().default(''),
  url: z.string().min(1),
  active: z.boolean(),
  is_visible: z.boolean(),
  /** Unix seconds. */
  date_posted: z.number(),
  date_updated: z.number(),
});
export type RawListing = z.infer<typeof RawListing>;

export type SourcePullResult =
  | { notModified: true; etag: string | null }
  | { notModified: false; etag: string | null; entries: unknown[] };

/** A place jobs come from. Entries are returned unvalidated; the pull validates and counts malformed ones. */
export interface JobSource {
  readonly id: string;
  pull(opts: { etag: string | null }): Promise<SourcePullResult>;
}
