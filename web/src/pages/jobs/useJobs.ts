import { useQueryClient } from '@tanstack/react-query';
import type { JobDetail, JobRow, PullSummary } from '../../../../src/shared/job';

export type JobsResponse = { jobs: JobRow[]; lastPull: PullSummary | null };

/** After a job changes, update its row in every cached job list without refetching thousands of rows. */
export function useUpdateJobRow() {
  const qc = useQueryClient();
  return (detail: JobDetail) => {
    qc.setQueryData(['job', detail.id], detail);
    qc.setQueriesData<JobsResponse>({ queryKey: ['jobs'] }, (old) => {
      if (!old) return old;
      const { companyUrl: _c, dateUpdated: _d, description: _desc, matchResult: _m, ...row } = detail;
      return { ...old, jobs: old.jobs.map((j) => (j.id === detail.id ? { ...j, ...row } : j)) };
    });
  };
}
