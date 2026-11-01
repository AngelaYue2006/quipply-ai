import { useState } from 'react';
import { Button, Input, Select } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { NO_FILTERS, type Filters } from './filters';

type Props = {
  filters: Filters;
  set: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  options: { categories: string[]; terms: string[]; degrees: string[]; ats: string[] };
  showClosed: boolean;
  setShowClosed: (value: boolean) => void;
  reset: () => void;
  profileAvailable: boolean;
};

export function JobFilters({ filters: f, set, options, showClosed, setShowClosed, reset, profileAvailable }: Props) {
  const [expanded, setExpanded] = useState(false);
  const extraCount = [f.location, f.remote, f.ats, f.postedDays, f.degree, f.prefs, showClosed].filter(Boolean).length;
  const changed = JSON.stringify(f) !== JSON.stringify(NO_FILTERS) || showClosed;
  return <div className="filter-area">
    <div className="primary-filters">
      <div className="search-field"><Icon name="search" /><Input aria-label="Search company or title" placeholder="Search roles or companies…" value={f.q} onChange={e => set('q', e.target.value)} />{f.q && <button aria-label="Clear search" onClick={() => set('q', '')}><Icon name="close" size={15} /></button>}</div>
      <label className="filter-field"><span>Category</span><Select value={f.category} onChange={e => set('category', e.target.value)}><option value="">All categories</option>{options.categories.map(c => <option key={c}>{c}</option>)}</Select></label>
      <label className="filter-field"><span>Term</span><Select value={f.term} onChange={e => set('term', e.target.value)}><option value="">All terms</option>{options.terms.map(t => <option key={t}>{t}</option>)}</Select></label>
      <label className="filter-field score-filter"><span>Minimum score</span><div><Input type="number" min={0} max={100} step={1} placeholder="Any" value={f.minScore} onChange={e => { const value = e.target.value; set('minScore', value === '' ? '' : Math.min(100, Math.max(0, Math.round(Number(value))))); }} /><span>/ 100</span></div></label>
      <Button className="more-filters" aria-expanded={expanded} aria-controls="advanced-filters" onClick={() => setExpanded(!expanded)}><Icon name="filter" size={16} />Filters{extraCount > 0 && <span className="filter-count">{extraCount}</span>}</Button>
    </div>
    {expanded && <div id="advanced-filters" className="advanced-filters">
      <label className="filter-field"><span>Location</span><Input placeholder="City, state, or country" value={f.location} onChange={e => set('location', e.target.value)} /></label>
      <label className="filter-field"><span>Application platform</span><Select value={f.ats} onChange={e => set('ats', e.target.value)}><option value="">All platforms</option><option value="supported">Greenhouse, Lever, Ashby, Workday</option>{options.ats.map(a => <option key={a}>{a}</option>)}</Select></label>
      <label className="filter-field"><span>Posted within (days)</span><Input type="number" min={1} max={3650} step={1} placeholder="Any time" value={f.postedDays || ''} onChange={e => set('postedDays', e.target.value === '' ? 0 : Math.min(3650, Math.max(1, Math.round(Number(e.target.value)))))} /></label>
      <label className="filter-field"><span>Degree</span><Select value={f.degree} onChange={e => set('degree', e.target.value)}><option value="">Any degree</option>{options.degrees.map(d => <option key={d}>{d}</option>)}</Select></label>
      <div className="filter-toggles">
        <label><input type="checkbox" checked={f.remote} onChange={e => set('remote', e.target.checked)} />{f.location ? 'Also include remote roles' : 'Remote roles only'}</label>
        <label><input type="checkbox" checked={f.prefs} disabled={!profileAvailable} onChange={e => set('prefs', e.target.checked)} />Use my profile preferences</label>
        <label><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />Include closed postings</label>
        <a href="#/profile" className="text-accent text-xs hover:underline">Edit preferences ↗</a>
      </div>
      {f.prefs && <p className="filter-help">Using your saved categories, terms, locations, remote preference, and company exclusions.</p>}
    </div>}
    {changed && <div className="active-filters"><span>Filtered view</span>{f.q && <span>“{f.q}”</span>}{f.category && <span>{f.category}</span>}{f.term && <span>{f.term}</span>}{f.minScore !== '' && <span>Score ≥ {f.minScore} · scored jobs only</span>}{extraCount > 0 && !expanded && <button onClick={() => setExpanded(true)}>{extraCount} more filter{extraCount === 1 ? '' : 's'}</button>}<button className="reset-filters" onClick={reset}>Reset all</button></div>}
  </div>;
}
