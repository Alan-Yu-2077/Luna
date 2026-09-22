import type { FetchLike } from './demoAudio';
import type { MusicStore } from './demoMusic';

// v0.46.0 — the data surface, static. The diary book, the skills page and the player card all
// take an injected fetch; this one answers the three `/api/data/*` reads from JSON files under the
// demo base and 404s everything else — which is precisely what those surfaces see with no backend
// (the player card unmounts itself, the voice-health line says the service is not running).
//
// v0.47.0 — with a music store, the card's three routes answer too: now / control / artwork, the
// shapes `musicApi.ts` serves, so the card's real polling and real buttons drive the demo's shelf.

const DATA_ROUTES: Readonly<Record<string, string>> = {
  '/api/data/diaries': 'data/diaries.json',
  '/api/data/dreams': 'data/dreams.json',
  '/api/data/skills': 'data/skills.json',
};

function parse(url: string): URL {
  return new URL(url, 'http://demo.invalid/');
}

export function demoRoute(base: string, url: string): string | null {
  let path = url;
  try {
    path = parse(url).pathname;
  } catch {
    /* not a URL — match the raw string */
  }
  const file = DATA_ROUTES[path];
  return file === undefined ? null : `${base}${file}`;
}

const COVER_HASH = /^[a-z0-9-]+$/;

export function createDemoFetch(
  base: string,
  fetchFn: FetchLike = (u, i) => fetch(u, i),
  music: MusicStore | null = null,
): FetchLike {
  return async (url, init) => {
    if (music) {
      const u = parse(url);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (u.pathname === '/api/music/now' && method === 'GET') return Response.json(music.now());
      if (u.pathname === '/api/music/control' && method === 'POST') {
        const body = typeof init?.body === 'string' ? init.body : '';
        const next = music.control(body);
        return next ? Response.json(next) : Response.json({ error: 'bad op' }, { status: 400 });
      }
      if (u.pathname === '/api/music/artwork' && method === 'GET') {
        const h = u.searchParams.get('h') ?? '';
        const file = COVER_HASH.test(h) ? music.coverFile(h) : null;
        if (file === null) return new Response('not found', { status: 404 });
        return fetchFn(`${base}${file}`, init);
      }
    }
    const target = demoRoute(base, url);
    if (target === null) return new Response('not found', { status: 404 });
    return fetchFn(target, init);
  };
}
