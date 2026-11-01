import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../api';
import { Badge, Button, EmptyState, Select, cx } from '../components/ui';
import { useToast } from '../components/toast';
import { VERDICT_COLOR, shortDate, timeAgo } from '../format';
import { type JobRow, type PullSummary, type UserStatus } from '../../../src/shared/job';
import type { Profile } from '../../../src/shared/profile';
import { JobPanel } from './jobs/JobPanel';
import type { JobsResponse } from './jobs/useJobs';
import { Icon } from '../components/Icon';
import { JobFilters } from './jobs/JobFilters';
import { applyFilters, NO_FILTERS, type Filters } from './jobs/filters';
import { WINDOW_OPTIONS } from './SettingsPage';

function pullText(p: PullSummary) {
  if (p.error) return `Last pull failed ${timeAgo(p.startedAt)}: ${p.error}`;
  const when = `Last pull ${timeAgo(p.startedAt)}`;
  if (p.notModified || p.added + p.updated + p.closed === 0) return `${when} · no changes`;
  return `${when} · ${p.added} new · ${p.updated} updated · ${p.closed} closed`;
}

const distinct = (jobs: JobRow[], pick: (j: JobRow) => string[]) =>
  [...new Set(jobs.flatMap(pick))].filter(Boolean).sort((a, b) => a.localeCompare(b));

function ScoreCell({ m }: { m: JobRow['match'] }) {
  if (!m || m.status === 'not_scored') return <span className="text-xs text-slate-400">Not scored</span>;
  if (m.status === 'error') return <Badge color="red">error</Badge>;
  const color = m.verdict ? VERDICT_COLOR[m.verdict] : 'gray';
  return (
    <span className={cx('inline-flex items-center gap-1', m.stale && 'opacity-50')} title={m.stale ? 'Profile changed; rescore' : m.verdict ?? ''}>
      <Badge color={color}>{m.verdict === 'ineligible' ? 'Ineligible' : (m.score === null ? 'No score' : `${m.score} / 100`)}</Badge>
      {m.stale && <span className="text-xs text-slate-400">↻</span>}
    </span>
  );
}

const STATUS_COLOR: Record<UserStatus, 'gray' | 'blue' | 'amber' | 'green'> = { new: 'gray', interested: 'blue', skipped: 'amber', applied: 'green' };
const col = createColumnHelper<JobRow>();
const GRID = '42px minmax(270px,2.5fr) minmax(160px,1.4fr) 110px 100px 110px';

export function JobsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [showClosed, setShowClosed] = useState(false);
  const jobsQ = useQuery({ queryKey: ['jobs', showClosed], queryFn: () => api<JobsResponse>(`/jobs?includeClosed=${showClosed ? 1 : 0}`) });
  const profileQ = useQuery({ queryKey: ['profile'], queryFn: () => api<{ data: Profile; version: number }>('/profile') });
  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: () => api<{ settings: { pullWindowDays: number } }>('/settings') });
  const [windowDays, setWindowDays] = useState<number | null>(null);
  useEffect(() => {
    if (windowDays === null && settingsQ.data) setWindowDays(settingsQ.data.settings.pullWindowDays);
  }, [settingsQ.data, windowDays]);

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => { setFilters((f) => ({ ...f, [k]: v })); setSelection({}); };
  const resetFilters = () => { setFilters(NO_FILTERS); setShowClosed(false); setSelection({}); };
  const [sorting, setSorting] = useState<SortingState>([{ id: 'datePosted', desc: true }]);
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const close = useCallback(() => setOpenId(null), []);

  const pull = useMutation({
    mutationFn: () => api<PullSummary>('/jobs/pull', { body: { windowDays: windowDays ?? 7 } }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast(p.notModified ? 'No changes since your last pull.' : `Pulled jobs: ${p.added} new, ${p.updated} updated, ${p.closed} closed.`, 'success');
    },
    onError: (e) => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast((e as Error).message, 'error');
    },
  });

  const bulk = useMutation({
    mutationFn: (body: { userStatus: UserStatus; ids: number[] }) =>
      api<{ changed: number }>('/jobs/bulk-status', { body }),
    onSuccess: (r, { userStatus, ids: submittedIds }) => {
      const ids = new Set(submittedIds);
      qc.setQueriesData<JobsResponse>({ queryKey: ['jobs'] }, (old) =>
        old ? { ...old, jobs: old.jobs.map((j) => (ids.has(j.id) ? { ...j, userStatus } : j)) } : old,
      );
      ids.forEach((id) => qc.invalidateQueries({ queryKey: ['job', id] }));
      setSelection({});
      toast(`Marked ${r.changed} job${r.changed === 1 ? '' : 's'} ${userStatus}.`, 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  const all = useMemo(() => jobsQ.data?.jobs ?? [], [jobsQ.data]);
  const rows = useMemo(() => applyFilters(all, filters, profileQ.data?.data), [all, filters, profileQ.data]);
  const options = useMemo(
    () => ({
      categories: distinct(all, (j) => [j.category]),
      terms: distinct(all, (j) => j.terms),
      degrees: distinct(all, (j) => j.degrees),
      ats: distinct(all, (j) => [j.atsType]),
    }),
    [all],
  );

  const columns = useMemo(
    () => [
      col.display({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            className="size-4"
            aria-label="Select all"
            checked={table.getIsAllRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomeRowsSelected();
            }}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input type="checkbox" className="size-4" aria-label={`Select ${row.original.title} at ${row.original.company}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} onClick={(e) => e.stopPropagation()} />
        ),
      }),
      col.accessor('company', {
        header: 'Opportunity',
        cell: (c) => <div className="opportunity-cell"><span className="company-avatar">{c.getValue().slice(0, 2).toUpperCase()}</span><div className="min-w-0"><button className="job-title" onClick={(e) => { e.stopPropagation(); setOpenId(c.row.original.id); }}>{c.row.original.title}</button><div className="company-line"><span className="truncate">{c.getValue()}</span>{c.row.original.isNew && <span className="new-dot">New</span>}</div></div></div>,
      }),
      col.accessor((j) => j.locations.join('; '), { id: 'location', header: 'Location', cell: (c) => <div className="min-w-0"><div className="truncate text-slate-300" title={c.getValue()}>{c.getValue() || 'Not specified'}</div><div className="mt-1 truncate text-xs text-slate-400">{c.row.original.terms.join(', ')}</div></div> }),
      col.accessor((j) => j.match?.score ?? -1, { id: 'score', header: 'Match score', cell: (c) => <ScoreCell m={c.row.original.match} />, sortDescFirst: true }),
      col.accessor('datePosted', { header: 'Posted', cell: (c) => <span className="text-slate-300 tabular-nums">{shortDate(c.getValue())}</span>, sortDescFirst: true }),
      col.accessor('userStatus', {
        header: 'Status',
        cell: (c) => (
          <span className="flex items-center gap-1">
            <Badge color={STATUS_COLOR[c.getValue()]}>{c.getValue()}</Badge>
            {!c.row.original.active && <Badge color="red">closed</Badge>}
          </span>
        ),
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, rowSelection: selection },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    getRowId: (j) => String(j.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const tableRows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const virtual = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 76,
    overscan: 12,
    scrollMargin,
  });
  // Use only visible rows, and capture their IDs when the action starts.
  // A filter or query refresh during the request must not change the target set.
  const selectedIds = rows.filter(j => selection[String(j.id)]).map(j => j.id);
  const selectedCount = selectedIds.length;
  const lastPull = jobsQ.data?.lastPull ?? null;

  // The virtual rows share the page's scroll area. Re-measure their starting
  // position when filters expand, text wraps, or the viewport changes size.
  useLayoutEffect(() => {
    const page = scrollRef.current;
    const list = listRef.current;
    if (!page || !list) return;
    const measure = () => setScrollMargin(list.getBoundingClientRect().top - page.getBoundingClientRect().top + page.scrollTop);
    const observer = new ResizeObserver(measure);
    observer.observe(page);
    page.querySelectorAll('.page-heading, .board-overview, .board-tabs, .filter-area, .bulk-actions').forEach(el => observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, [jobsQ.isLoading, tableRows.length, selectedCount]);

  const pullControls = (
    <div className="pull-controls">
      <Select className="h-9 w-28" value={windowDays ?? 7} onChange={(e) => setWindowDays(Number(e.target.value))} aria-label="Pull window">
        {windowDays !== null && !WINDOW_OPTIONS.some(([d]) => d === windowDays) && <option value={windowDays}>Last {windowDays} days</option>}
        {WINDOW_OPTIONS.map(([d, l]) => (
          <option key={d} value={d}>
            {d === 0 ? 'All dates' : `Last ${l}`}
          </option>
        ))}
      </Select>
      <Button variant="primary" onClick={() => pull.mutate()} loading={pull.isPending}>
        <Icon name="refresh" size={16} /> Pull jobs
      </Button>
    </div>
  );

  if (jobsQ.isLoading) return <div className="p-6 text-sm text-slate-400">Loading jobs…</div>;
  if (jobsQ.error) return <div className="p-6"><EmptyState title="Could not load your job board."><p className="mb-4">{(jobsQ.error as Error).message}</p><Button onClick={() => jobsQ.refetch()} loading={jobsQ.isFetching}>Try again</Button></EmptyState></div>;

  const counts = { interested: all.filter(j => j.userStatus === 'interested').length, applied: all.filter(j => j.userStatus === 'applied').length, new: all.filter(j => j.isNew).length };
  return (
    <div ref={scrollRef} className="jobs-page">
      <div className="page-heading">
        <div><p className="eyebrow">MAKE YOUR NEXT MOVE</p><h1>Find your next opportunity.</h1><p className="page-description">Explore internships, find your fit, and keep your search in focus.</p></div>
        {pullControls}
      </div>
      <div className="board-overview">
        <div><span className="overview-icon"><Icon name="jobs" /></span><div><strong>{all.length.toLocaleString()}</strong><span>In your job board</span></div></div>
        <div><span className="overview-icon"><Icon name="refresh" /></span><div><strong>{counts.new.toLocaleString()}</strong><span>New in latest pull</span></div></div>
        <div><span className="overview-icon"><Icon name="check" /></span><div><strong>{counts.interested.toLocaleString()}</strong><span>Interested</span></div></div>
        <div><span className="overview-icon"><Icon name="arrow" /></span><div><strong>{counts.applied.toLocaleString()}</strong><span>Applied</span></div></div>
      </div>
      <section className="job-board" aria-label="Internship listings">
      <div className="board-tabs">
        <div className="status-tabs" aria-label="Filter by status">
          {([['not_skipped', 'Explore'], ['interested', 'Interested'], ['applied', 'Applied'], ['skipped', 'Skipped'], ['', 'All jobs']] as const).map(([value, label]) => <button key={value} className={cx(filters.status === value && 'active')} aria-pressed={filters.status === value} onClick={() => set('status', value)}>{label}</button>)}
        </div>
        <span className="results-count" aria-live="polite">{rows.length.toLocaleString()} results</span>
      </div>
      <JobFilters filters={filters} set={set} options={options} showClosed={showClosed} setShowClosed={(value) => { setShowClosed(value); setSelection({}); }} reset={resetFilters} profileAvailable={!!profileQ.data} />
      {selectedCount > 0 && (
        <div className="bulk-actions flex flex-wrap items-center gap-2 border-b border-indigo-800 bg-indigo-950 px-5 py-2 text-sm">
          <span className="font-medium text-indigo-200">{selectedCount} selected</span>
          {(['interested', 'skipped', 'applied', 'new'] as const).map((s) => (
            <Button key={s} size="sm" onClick={() => bulk.mutate({ userStatus: s, ids: selectedIds })} disabled={bulk.isPending}>
              Mark {s}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelection({})}>
            Clear
          </Button>
        </div>
      )}

      <div className="jobs-scroll bg-slate-900">
        <div className={tableRows.length ? 'min-w-[820px]' : 'min-w-0'} role="table" aria-label="Jobs" aria-rowcount={tableRows.length + 1}>
          <div role="row" className={cx('sticky top-0 z-10 grid border-b border-slate-800 bg-slate-900 text-xs font-medium text-slate-400', tableRows.length === 0 && 'hidden')} style={{ gridTemplateColumns: GRID }}>
            {table.getHeaderGroups()[0]!.headers.map((h) => {
              const sorted = h.column.getIsSorted();
              return (
                <div
                  key={h.id}
                  role="columnheader"
                  aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                  className={cx('flex items-center gap-1 px-3 py-3', h.column.getCanSort() && 'cursor-pointer select-none hover:text-slate-200')}
                  
                >
                  {h.column.getCanSort() ? <button className="sort-button" onClick={h.column.getToggleSortingHandler()} aria-label={`Sort by ${h.column.columnDef.header}, ${sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'not sorted'}`}>{flexRender(h.column.columnDef.header, h.getContext())}<span>{sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'}</span></button> : flexRender(h.column.columnDef.header, h.getContext())}
                </div>
              );
            })}
          </div>
          {tableRows.length === 0 ? (
            <div className="board-empty"><span className="empty-icon"><Icon name="jobs" size={28} /></span><EmptyState title={all.length ? 'No matches just yet.' : 'Your next chapter starts here.'}><p>{all.length ? 'Try a different keyword or loosen your filters to see more opportunities.' : 'Pull internships from Simplify / Pitt CSC, then open a role to explore your match.'}</p><div className="mt-4">{all.length ? <Button onClick={resetFilters}>Reset filters</Button> : <Button variant="primary" loading={pull.isPending} onClick={() => pull.mutate()}>Pull jobs</Button>}</div></EmptyState></div>
          ) : (
            <div ref={listRef} style={{ height: virtual.getTotalSize(), position: 'relative' }}>
              {virtual.getVirtualItems().map((v) => {
                const row = tableRows[v.index]!;
                return (
                  <div
                    key={row.id}
                    role="row"
                    aria-rowindex={v.index + 2}
                    onClick={() => setOpenId(row.original.id)}
                    className={cx(
                      'absolute inset-x-0 grid cursor-pointer items-center border-b border-slate-800 text-sm hover:bg-slate-950',
                      (openId === row.original.id || row.getIsSelected()) && 'bg-teal-950 hover:bg-teal-950',
                      !row.original.active && 'text-slate-400',
                    )}
                    style={{ gridTemplateColumns: GRID, height: v.size, transform: `translateY(${v.start - scrollMargin}px)` }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <div key={cell.id} role="cell" className="flex min-w-0 items-center px-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <footer className="board-footer"><span>{lastPull ? pullText(lastPull) : 'Simplify / Pitt CSC internship listings'}</span><span>Updated only when you pull</span></footer>
      </section>
      {openId !== null && <JobPanel key={openId} id={openId} onClose={close} />}
    </div>
  );
}
