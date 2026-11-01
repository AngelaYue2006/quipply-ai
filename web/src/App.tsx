import { hasToken } from './api';
import { cx } from './components/ui';
import { Icon } from './components/Icon';
import { useRoute } from './router';
import { JobsPage } from './pages/JobsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ResumeImportPage } from './pages/ResumeImportPage';
import { SettingsPage } from './pages/SettingsPage';

const NAV = [
  { href: '#/jobs', label: 'Job board', page: 'jobs' },
  { href: '#/profile', label: 'Your profile', page: 'profile' },
  { href: '#/settings', label: 'Settings', page: 'settings' },
] as const;

export function App() {
  const route = useRoute();
  const active = route.page === 'import' ? 'profile' : route.page;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content" onClick={(e) => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
      <aside className="app-sidebar">
        <a href="#/jobs" className="brand"><span className="brand-mark">q<span>·</span></span>quipply<span className="version-tag">v1</span></a>
        <div className="nav-caption">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation" className="main-nav">
          {NAV.map((n) => <a key={n.page} href={n.href} aria-current={active === n.page ? 'page' : undefined} className={cx('nav-item', active === n.page && 'is-active')}><Icon name={n.page} /><span>{n.label}</span>{active === n.page && <span className="nav-dot" />}</a>)}
        </nav>
        <div className="sidebar-note"><span className="local-dot" /> Local workspace<p>Your search, at your pace.<br />Everything starts with you.</p></div>
        <div className="sidebar-footer"><span className="workspace-avatar">Q</span><div>Personal workspace<small>Internship tracker</small></div></div>
      </aside>
      <div className="app-body">
        <header className="workspace-header"><span>Workspace <span className="breadcrumb-divider">/</span> <strong>{NAV.find(n => n.page === active)?.label}</strong></span><span className="workspace-status"><span className="local-dot" /> On this device</span></header>
        {!hasToken && <div className="border-b border-amber-800 bg-amber-950 px-5 py-2 text-sm text-amber-200">This page has no API token. Open the dashboard from the URL printed by <code>pnpm dev</code> or <code>pnpm start</code>.</div>}
        <main id="main-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1">
          {route.page === 'jobs' && <JobsPage />}
          {route.page === 'profile' && <ProfilePage />}
          {route.page === 'import' && <ResumeImportPage id={route.id} />}
          {route.page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
}
