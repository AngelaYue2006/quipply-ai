import type { JobSource, SourcePullResult } from './types';
import { USER_AGENT } from '../http';

/**
 * The public listings.json behind the Simplify / Pitt CSC internship repo.
 * Verified 2026-11-01: ~13 MB, 17,476 entries, 5,119 active and visible; GitHub raw serves an ETag.
 */
export class SimplifyInternshipsSource implements JobSource {
  readonly id = 'simplify-internships';
  constructor(
    private url: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async pull({ etag }: { etag: string | null }): Promise<SourcePullResult> {
    const res = await this.fetchImpl(this.url, {
      headers: { 'User-Agent': USER_AGENT, ...(etag ? { 'If-None-Match': etag } : {}) },
    });
    if (res.status === 304) return { notModified: true, etag };
    if (!res.ok) throw new Error(`Listings download failed: HTTP ${res.status}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error('Listings file is not a JSON array.');
    return { notModified: false, etag: res.headers.get('etag'), entries: body };
  }
}
