import { useEffect, useState } from 'react';

export type Route =
  | { page: 'jobs' }
  | { page: 'profile' }
  | { page: 'import'; id: number }
  | { page: 'settings' };

function parse(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'profile' && parts[1] === 'import' && Number(parts[2])) return { page: 'import', id: Number(parts[2]) };
  if (parts[0] === 'profile') return { page: 'profile' };
  if (parts[0] === 'settings') return { page: 'settings' };
  return { page: 'jobs' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path: string) {
  window.location.hash = path;
}
