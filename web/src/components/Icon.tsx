const paths = {
  jobs: 'M9 6V4h6v2M3 7h18v13H3zM3 11l9 3 9-3M10 13v3h4v-3',
  profile: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0M15 15l6 6',
  filter: 'M4 6h16M7 12h10M10 18h4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  refresh: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1',
  check: 'M5 12l4 4L19 6',
  close: 'M6 6l12 12M6 18L18 6',
  file: 'M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6',
} as const;

export function Icon({ name, size = 18 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
