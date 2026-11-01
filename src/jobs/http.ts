/** A clear user agent for every request to a job site or listings file. */
export const USER_AGENT = 'quipply-ai/0.1 (personal job-search tool; one request at a time)';

/** Minimum gap between description requests (SPEC hard rule 5). */
export const MIN_REQUEST_GAP_MS = 1000;

let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

/**
 * Run job-site requests one at a time with at least MIN_REQUEST_GAP_MS between their starts.
 * `sleep` is injectable so tests don't wait.
 */
export function politely<T>(fn: () => Promise<T>, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}
