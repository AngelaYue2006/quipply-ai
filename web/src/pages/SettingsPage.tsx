import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Badge, Button, Card, Input, Label } from '../components/ui';
import { useToast } from '../components/toast';
import { usd } from '../format';

type Settings = { matchModel: string; importModel: string; listingsUrl: string; pullWindowDays: number };
type SettingsView = {
  settings: Settings;
  dataDir: string;
  apiKeySet: boolean;
  costs: { action: string; calls: number; costUsd: number; inputTokens: number; outputTokens: number }[];
  totalCostUsd: number;
};

export const WINDOW_OPTIONS = [
  [3, '3 days'],
  [7, '7 days'],
  [14, '14 days'],
  [30, '30 days'],
  [0, 'All'],
] as const;

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<SettingsView>('/settings') });
  const form = useForm<Settings>();
  useEffect(() => {
    if (q.data) form.reset(q.data.settings);
  }, [q.data, form]);
  const save = useMutation({
    mutationFn: (s: Settings) => api<SettingsView>('/settings', { method: 'PUT', body: { ...s, pullWindowDays: Number(s.pullWindowDays) } }),
    onSuccess: (v) => {
      qc.setQueryData(['settings'], v);
      toast('Settings saved.', 'success');
    },
    onError: (e) => toast((e as Error).message, 'error'),
  });

  if (!q.data) return <div className="p-6 text-sm text-slate-400">{q.error ? (q.error as Error).message : 'Loading…'}</div>;
  const v = q.data;

  return (
    <div className="content-page">
      <div className="content-container max-w-4xl space-y-6">
        <div className="page-heading"><div><p className="eyebrow">MAKE YOURSELF AT HOME</p><h1>Workspace settings.</h1><p className="page-description">Manage your job source, model preferences, and usage in one place.</p></div></div>
        <form onSubmit={form.handleSubmit((s) => save.mutate(s))}>
          <Card
            title="Search & model preferences"
            description="Changes apply to your next pull or model request."
            actions={
              <Button type="submit" size="sm" variant="primary" loading={save.isPending} disabled={!form.formState.isDirty}>
                Save changes
              </Button>
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="match-model">Match model</Label>
                <Input id="match-model" {...form.register('matchModel', { required: true })} />
              </div>
              <div>
                <Label htmlFor="import-model">Resume import model</Label>
                <Input id="import-model" {...form.register('importModel', { required: true })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="listings-url" hint="the repo name changes each recruiting season">Listings source URL</Label>
                <Input id="listings-url" type="url" {...form.register('listingsUrl', { required: true })} />
              </div>
              <div>
                <Label htmlFor="pull-window">Default pull window</Label>
                <Input id="pull-window" type="number" min={0} max={3650} step={1} {...form.register('pullWindowDays', { required: true, min: 0, max: 3650 })} />
                <p className="mt-2 text-xs text-slate-400">Number of days to pull. Enter 0 for all dates.</p>
              </div>
            </div>
          </Card>
        </form>

        <Card title="Environment" description="Set in .env; restart the server after changing it.">
          <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <dt className="text-slate-400">Anthropic API key</dt>
            <dd>{v.apiKeySet ? <Badge color="green">set</Badge> : <Badge color="red">missing: add ANTHROPIC_API_KEY to .env</Badge>}</dd>
            <dt className="text-slate-400">Data folder</dt>
            <dd className="font-mono text-xs break-all text-slate-300">{v.dataDir}</dd>
          </dl>
        </Card>

        <Card title="Model cost so far" description="Every model call is logged with its tokens and cost.">
          {v.costs.length === 0 ? (
            <p className="text-sm text-slate-400">No model calls yet.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="pb-2 font-medium">Action</th>
                  <th className="pb-2 text-right font-medium">Calls</th>
                  <th className="pb-2 text-right font-medium">Input tokens</th>
                  <th className="pb-2 text-right font-medium">Output tokens</th>
                  <th className="pb-2 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 tabular-nums">
                {v.costs.map((c) => (
                  <tr key={c.action}>
                    <td className="py-1.5">{c.action}</td>
                    <td className="py-1.5 text-right">{c.calls}</td>
                    <td className="py-1.5 text-right">{c.inputTokens.toLocaleString()}</td>
                    <td className="py-1.5 text-right">{c.outputTokens.toLocaleString()}</td>
                    <td className="py-1.5 text-right">{usd(c.costUsd)}</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-1.5">Total</td>
                  <td colSpan={3} />
                  <td className="py-1.5 text-right">{usd(v.totalCostUsd)}</td>
                </tr>
              </tbody>
            </table></div>
          )}
        </Card>
      </div>
    </div>
  );
}
