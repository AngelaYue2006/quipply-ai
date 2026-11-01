import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { Badge, Button, Textarea, cx } from '../../components/ui';
import { useToast } from '../../components/toast';
import { shortDate, timeAgo } from '../../format';
import { USER_STATUSES, type JobDetail, type UserStatus } from '../../../../src/shared/job';
import { Icon } from '../../components/Icon';
import { MatchPanel } from './MatchPanel';
import { useUpdateJobRow } from './useJobs';

const METHOD_LABEL: Record<string, string> = {
  greenhouse_api: 'Greenhouse API',
  lever_api: 'Lever API',
  ashby_api: 'Ashby API',
  readability: 'the posting page',
  manual: 'pasted by you',
};

function DescriptionSection({ job }: { job: JobDetail }) {
  const toast = useToast();
  const updateRow = useUpdateJobRow();
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [expanded, setExpanded] = useState(false);
  const d = job.description;

  const fetchIt = useMutation({
    mutationFn: () => api<{ result: { ok: boolean; message?: string }; job: JobDetail }>(`/jobs/${job.id}/description/fetch`, { method: 'POST' }),
    onSuccess: (r) => {
      updateRow(r.job);
      if (!r.result.ok) toast(r.result.message ?? 'Could not fetch the description.', 'error');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const save = useMutation({
    mutationFn: (text: string) => api<JobDetail>(`/jobs/${job.id}/description`, { method: 'PUT', body: { text } }),
    onSuccess: (r) => {
      updateRow(r);
      setPasting(false);
      setPasted('');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const pasteBox = (
    <div className="mt-2 space-y-2">
      <Textarea aria-label="Job description" rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the job description here" />
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={!pasted.trim()} loading={save.isPending} onClick={() => save.mutate(pasted)}>
          Save description
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPasting(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Description</h3>
        <div className="flex gap-1.5">
          {d?.text && (
            <Button size="sm" variant="ghost" onClick={() => setPasting((p) => !p)}>
              Paste instead
            </Button>
          )}
          <Button size="sm" variant={d?.text ? 'ghost' : 'primary'} loading={fetchIt.isPending} onClick={() => fetchIt.mutate()}>
            {d?.text ? 'Refetch' : 'Fetch description'}
          </Button>
        </div>
      </div>

      {d?.error && (
        <div className="mb-2 rounded-md border border-amber-800 bg-amber-950 px-3 py-2 text-sm text-amber-200">
          <p>{d.error.replace(/^\w+: /, '')}</p>
          <p className="mt-1">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
              Open posting
            </a>{' '}
            and{' '}
            <button className="font-medium underline" onClick={() => setPasting(true)}>
              paste the description
            </button>
            .
          </p>
        </div>
      )}

      {d?.text ? (
        <>
          <div className={cx('relative overflow-hidden rounded-md border border-slate-800 bg-slate-950 px-3 py-2', !expanded && 'max-h-56 overflow-y-auto')}>
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-slate-300">{d.text}</p>

          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>
              From {METHOD_LABEL[d.method ?? ''] ?? d.method}
              {d.fetchedAt ? `, ${timeAgo(d.fetchedAt)}` : ''} · {d.text.length.toLocaleString()} characters
            </span>
            <button className="text-indigo-200 hover:underline" onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Show less' : 'Show all'}
            </button>
          </div>
        </>
      ) : (
        !d?.error &&
        !pasting && (
          <p className="text-sm text-slate-400">
            Not fetched yet. Fetch it, or{' '}
            <button className="text-indigo-200 hover:underline" onClick={() => setPasting(true)}>
              paste it yourself
            </button>
            .
          </p>
        )
      )}
      {pasting && pasteBox}
    </section>
  );
}

export function JobPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const toast = useToast();
  const panelRef = useRef<HTMLElement>(null);
  const updateRow = useUpdateJobRow();
  const q = useQuery({ queryKey: ['job', id], queryFn: () => api<JobDetail>(`/jobs/${id}`) });
  const [notes, setNotes] = useState('');
  useEffect(() => setNotes(q.data?.notes ?? ''), [q.data?.id, q.data?.notes]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const app = document.querySelector<HTMLElement>('.app-sidebar');
    const main = document.getElementById('main-content');
    // The dialog is inside app-body, so disable its siblings rather than its ancestors.
    const siblings = Array.from(document.querySelectorAll<HTMLElement>('.jobs-page > :not(.job-detail):not(.detail-overlay), .workspace-header'));
    if (app) app.inert = true;
    siblings.forEach(el => { el.inert = true; });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)') ?? []).filter(el => el.getClientRects().length > 0);
      const first = nodes[0]; const last = nodes.at(-1);
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (app) app.inert = false; siblings.forEach(el => { el.inert = false; }); if (previous?.isConnected) previous.focus(); else main?.focus(); };
  }, [onClose]);

  const patch = useMutation({
    mutationFn: (body: { userStatus?: UserStatus; notes?: string }) => api<JobDetail>(`/jobs/${id}`, { method: 'PATCH', body }),
    onSuccess: updateRow,
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const j = q.data;
  return (
    <><div className="detail-overlay" onClick={onClose} aria-hidden="true" /><aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={j ? `${j.title} at ${j.company}` : 'Job details'} className="job-detail">
      <header className="flex items-start gap-3 border-b border-slate-800">
        <div className="min-w-0 flex-1">
          {j ? (
            <>
              <p className="text-sm text-slate-400">{j.company}</p>
              <h2 className="mt-1 text-xl leading-snug font-semibold text-slate-100">{j.title}</h2>
            </>
          ) : (
            <p className="text-sm text-slate-400">{q.error ? (q.error as Error).message : 'Loading…'}</p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </Button>
      </header>

      {j && (
        <div className="detail-content flex-1 space-y-6 overflow-y-auto">
          <section className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge color="indigo">{j.atsType}</Badge>
              {j.category && <Badge>{j.category}</Badge>}
              {!j.active && <Badge color="red">closed</Badge>}
              {j.isNew && <Badge color="blue">new</Badge>}
            </div>
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-slate-400">Locations</dt>
              <dd className="text-slate-200">{j.locations.join('; ') || '—'}</dd>
              <dt className="text-slate-400">Terms</dt>
              <dd className="text-slate-200">{j.terms.join(', ') || '—'}</dd>
              <dt className="text-slate-400">Degrees</dt>
              <dd className="text-slate-200">{j.degrees.join(', ') || '—'}</dd>
              <dt className="text-slate-400">Sponsorship</dt>
              <dd className="text-slate-200">{j.sponsorship || '—'}</dd>
              <dt className="text-slate-400">Posted</dt>
              <dd className="text-slate-200">{shortDate(j.datePosted)}</dd>
            </dl>
            <a href={j.url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium text-indigo-200 hover:underline">
              Open posting ↗
            </a>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">Your status</h3>
            <div className="inline-flex overflow-hidden rounded-md border border-slate-700">
              {USER_STATUSES.map((s) => (
                <button
                  key={s}
                  aria-pressed={j.userStatus === s}
                  disabled={patch.isPending}
                  onClick={() => patch.mutate({ userStatus: s })}
                  className={cx(
                    'border-r border-slate-700 px-3 py-1.5 text-sm capitalize last:border-r-0',
                    j.userStatus === s ? 'bg-violet-300 text-slate-950' : 'bg-slate-900 text-slate-300 hover:bg-slate-950',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <Textarea
              className="mt-3"
              rows={2}
              aria-label="Your notes"
              placeholder="What stands out about this role?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== j.notes && patch.mutate({ notes })}
            />
            <p className="mt-2 text-xs text-slate-400" role="status">{patch.isPending ? 'Saving changes...' : patch.isError ? 'Could not save. Edit your notes to try again.' : notes !== j.notes ? 'Notes save when you leave this field.' : 'Notes are saved on this device.'}</p>
          </section>

          <DescriptionSection job={j} />
          <MatchPanel job={j} />
        </div>
      )}
    </aside></>
  );
}
