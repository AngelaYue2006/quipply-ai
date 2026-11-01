import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Badge, Button, Card, EmptyState } from '../components/ui';
import { useToast } from '../components/toast';
import { navigate } from '../router';

type Item = { id: string; section: string; label: string; current: string; imported: string; kind: 'new' | 'changed'; defaultChecked: boolean };
type Review = { id: number; status: 'pending' | 'accepted' | 'discarded'; items: Item[] };

const SECTION_ORDER = ['identity', 'contact', 'links', 'education', 'experience', 'projects', 'skills'];
const SECTION_TITLE: Record<string, string> = {
  identity: 'Identity',
  contact: 'Contact',
  links: 'Links',
  education: 'Education',
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
};

export function ResumeImportPage({ id }: { id: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const review = useQuery({ queryKey: ['import', id], queryFn: () => api<Review>(`/resume-imports/${id}`) });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (review.data) setChecked(new Set(review.data.items.filter((i) => i.defaultChecked).map((i) => i.id)));
  }, [review.data]);

  const grouped = useMemo(() => {
    const items = review.data?.items ?? [];
    return SECTION_ORDER.map((s) => [s, items.filter((i) => i.section === s)] as const).filter(([, list]) => list.length);
  }, [review.data]);

  const accept = useMutation({
    mutationFn: () => api(`/resume-imports/${id}/accept`, { body: { itemIds: [...checked] } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['job'] });
      toast(`Added ${checked.size} field${checked.size === 1 ? '' : 's'} to your profile.`, 'success');
      navigate('/profile');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const discard = useMutation({
    mutationFn: () => api(`/resume-imports/${id}/discard`, { method: 'POST' }),
    onSuccess: () => navigate('/profile'),
    onError: (e) => toast((e as Error).message, 'error'),
  });

  if (review.isLoading) return <div className="p-6 text-sm text-slate-400">Loading import…</div>;
  if (review.error) return <div className="p-6 text-sm text-red-200">{(review.error as Error).message}</div>;
  const r = review.data!;

  const toggle = (itemId: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

  return (
    <div className="h-full overflow-y-auto">
      <div className="content-container max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <a href="#/profile" className="text-sm text-slate-400 hover:text-slate-200">
            ← Profile
          </a>
          <h1 className="page-title">Review your resume.</h1>
        </div>
        {r.status !== 'pending' ? (
          <EmptyState title={`This import was ${r.status}.`}>
            <a className="text-indigo-200 hover:underline" href="#/profile">
              Back to your profile
            </a>
          </EmptyState>
        ) : r.items.length === 0 ? (
          <EmptyState title="Nothing new in this resume.">Everything it contains is already in your profile.</EmptyState>
        ) : (
          <>
            <p className="text-sm text-slate-300">
              New fields are checked; fields that would replace something you entered are not. Nothing is saved until you click Accept.
              Work authorization, standard answers and preferences are never imported.
            </p>
            {grouped.map(([section, items]) => (
              <Card key={section} title={SECTION_TITLE[section]}>
                <div className="review-table"><table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400">
                      <th className="w-8 pb-2" />
                      <th className="w-44 pb-2 font-medium">Field</th>
                      <th className="pb-2 font-medium">Current</th>
                      <th className="pb-2 font-medium">From resume</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 align-top">
                    {items.map((i) => (
                      <tr key={i.id} className="cursor-pointer hover:bg-slate-950" onClick={() => toggle(i.id)}>
                        <td className="py-2">
                          <input type="checkbox" aria-label={`Import ${i.label}`} className="size-4" checked={checked.has(i.id)} onChange={() => toggle(i.id)} onClick={(e) => e.stopPropagation()} />
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium text-slate-200">{i.label}</div>
                          <Badge color={i.kind === 'new' ? 'green' : 'amber'}>{i.kind}</Badge>
                        </td>
                        <td className="py-2 pr-3 text-slate-400">{i.current || <span className="text-slate-500">empty</span>}</td>
                        <td className="py-2 text-slate-100">{i.imported}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </Card>
            ))}
            <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-950/95 py-3 backdrop-blur">
              <span className="mr-auto text-sm text-slate-300">
                {checked.size} of {r.items.length} selected
              </span>
              <Button variant="danger" onClick={() => discard.mutate()} loading={discard.isPending} disabled={accept.isPending}>
                Discard
              </Button>
              <Button variant="primary" onClick={() => accept.mutate()} loading={accept.isPending} disabled={discard.isPending || checked.size === 0}>
                Accept selected
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
