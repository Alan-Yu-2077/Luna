import type { FetchLike } from './demoAudio';

// v0.46.0 — the data surface, static. The diary book, the skills page and the player card all
// take an injected fetch; this one answers the three `/api/data/*` reads from JSON files under the
// demo base and 404s everything else — which is precisely what those surfaces see with no backend
// (the player card unmounts itself, the voice-health line says the service is not running).

const DATA_ROUTES: Readonly<Record<string, string>> = {
  '/api/data/diaries': 'data/diaries.json',
  '/api/data/dreams': 'data/dreams.json',
  '/api/data/skills': 'data/skills.json',
};

export function demoRoute(base: string, url: string): string | null {
  let path = url;
  try {
    path = new URL(url, 'http://demo.invalid/').pathname;
  } catch {
    /* not a URL — match the raw string */
  }
  const file = DATA_ROUTES[path];
  return file === undefined ? null : `${base}${file}`;
}

export function createDemoFetch(base: string, fetchFn: FetchLike = (u, i) => fetch(u, i)): FetchLike {
  return (url, init) => {
    const target = demoRoute(base, url);
    if (target === null) return Promise.resolve(new Response('not found', { status: 404 }));
    return fetchFn(target, init);
  };
}
