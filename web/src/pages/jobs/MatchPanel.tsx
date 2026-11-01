import { useMutation } from '@tanstack/react-query';
import { api } from '../../api';
import { Badge, Button, Spinner, cx } from '../../components/ui';
import { useToast } from '../../components/toast';
import { VERDICT_COLOR, timeAgo } from '../../format';
import type { JobDetail } from '../../../../src/shared/job';
import { useUpdateJobRow } from './useJobs';

export function MatchPanel({ job }: { job: JobDetail }) {
  const toast = useToast();
  const updateRow = useUpdateJobRow();
  const score = useMutation({
    mutationFn: () => api<JobDetail>(`/jobs/${job.id}/match`, { method: 'POST' }),
    onSuccess: (d) => {
      updateRow(d);
      if (d.matchResult?.status === 'error') toast(`Scoring failed: ${d.matchResult.warnings[0] ?? 'unknown error'}`, 'error');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const m = job.matchResult;
  const hasDescription = Boolean(job.description?.text);

  const scoreButton = (label: string) => (
    <Button size="sm" variant={m && !m.stale ? 'secondary' : 'primary'} onClick={() => score.mutate()} loading={score.isPending} disabled={!hasDescription}>
      {label}
    </Button>
  );

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Your match</h3>
        {m ? scoreButton('Rescore') : null}
      </div>

      {score.isPending && (
        <p className="mb-2 flex items-center gap-2 text-sm text-slate-300">
          <Spinner /> Checking the posting against your profile…
        </p>
      )}

      {!m ? (
        <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-300">
          <p className="mb-1 font-medium text-slate-200">See how this role fits you.</p>
          <p className="mb-4 text-xs leading-relaxed text-slate-400">Compare the requirements with your profile to see strengths, gaps, and eligibility. Scoring uses a model request.</p>
          {scoreButton('Score match')}
          {!hasDescription && <p className="mt-2 text-xs text-slate-400">Fetch or paste the description first; jobs without one aren't scored.</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {m.stale && (
            <div className="rounded-md border border-amber-800 bg-amber-950 px-3 py-2 text-sm text-amber-200">
              {m.matcherVersion !== 'rubric@1' ? 'The matcher changed since this score' : 'Your profile changed since this score'}. Rescore to update it.
            </div>
          )}

          {m.status === 'not_scored' && <p className="text-sm text-slate-300">{m.warnings[0] ?? 'Not scored.'}</p>}
          {m.status === 'error' && <p className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-200">Scoring failed: {m.warnings[0]}</p>}

          {m.status === 'scored' && m.verdict === 'ineligible' && (
            <div className="rounded-lg border border-red-800 bg-red-950 p-3">
              <p className="text-sm font-semibold text-red-200">Ineligible</p>
              <ul className="mt-1.5 space-y-1 text-sm text-red-200">
                {m.eligibility.blockers.map((b) => (
                  <li key={b.rule}>
                    <Badge color="red" className="mr-1.5">
                      {b.rule}
                    </Badge>
                    {b.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {m.status === 'scored' && m.verdict !== 'ineligible' && (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
                <span className={cx('text-3xl font-semibold tabular-nums', m.stale ? 'text-slate-400' : 'text-slate-100')}>{m.score ?? '—'}<span className="ml-1 text-sm font-normal text-slate-400">/ 100</span></span>
                {m.verdict && <Badge color={VERDICT_COLOR[m.verdict]}>{m.verdict}</Badge>}
                <span className="ml-auto text-xs text-slate-400">scored {timeAgo(m.computedAt)}</span>
              </div>
              {m.summary && <p className="text-sm text-slate-300">{m.summary}</p>}

              {m.strengths.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-xs font-medium text-slate-400">Strengths</h4>
                  <ul className="space-y-2">
                    {m.strengths.map((s, i) => (
                      <li key={i} className="text-sm">
                        <p className="font-medium text-slate-200">✓ {s.point}</p>
                        <p className="mt-0.5 border-l-2 border-slate-800 pl-2 text-xs text-slate-400">
                          Posting: “{s.evidence.job}”<br />
                          You: “{s.evidence.profile}”
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {m.gaps.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-xs font-medium text-slate-400">Gaps</h4>
                  <ul className="space-y-1">
                    {m.gaps.map((g, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                        <Badge color={g.severity === 'required' ? 'red' : 'gray'}>{g.severity}</Badge>
                        {g.point}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(m.skills.required.length > 0 || m.skills.preferred.length > 0) && (
                <div>
                  <h4 className="mb-1.5 text-xs font-medium text-slate-400">Skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {[...m.skills.required.map((s) => ({ ...s, req: true })), ...m.skills.preferred.map((s) => ({ ...s, req: false }))].map((s, i) => (
                      <span
                        key={i}
                        title={s.req ? 'required' : 'preferred'}
                        className={cx(
                          'rounded-full border px-2 py-0.5 text-xs',
                          s.have ? 'border-emerald-800 bg-emerald-950 text-emerald-200' : 'border-red-800 bg-red-950 text-red-200',
                          !s.req && 'border-dashed',
                        )}
                      >
                        {s.have ? '✓' : '✗'} {s.skill}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">Dashed = preferred</p>
                </div>
              )}
            </>
          )}

          {m.status === 'scored' && m.warnings.length > 0 && (
            <ul className="space-y-1 rounded-md bg-amber-950 px-3 py-2 text-xs text-amber-200">
              {m.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
