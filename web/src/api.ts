const token = document.querySelector('meta[name="quipply-token"]')?.getAttribute('content') ?? '';
const TOKEN_HEADER = 'x-quipply-token';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: { path: string; message: string }[] = [],
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; form?: FormData };

/** Every call carries the install token; the server rejects anything without it. */
export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { [TOKEN_HEADER]: token };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`/api${path}`, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const issues = data?.issues ?? [];
    const detail = issues.length ? ` ${issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join('; ')}` : '';
    throw new ApiError(`${data?.error ?? `Request failed (${res.status})`}${detail}`, res.status, issues);
  }
  return data as T;
}

/** Fetch a file with the token and open or download it (plain links can't send the header). */
export async function openBlob(path: string, download?: string) {
  const res = await fetch(`/api${path}`, { headers: { [TOKEN_HEADER]: token } });
  if (!res.ok) throw new ApiError(`Download failed (${res.status})`, res.status);
  const url = URL.createObjectURL(await res.blob());
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = download;
    a.click();
  } else window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const hasToken = Boolean(token) && token !== '__QUIPPLY_TOKEN__';
