import type { FetchLike } from './demoAudio';
import type { MusicStore } from './demoMusic';

// v0.46.0 — the data surface, static. The diary book, the skills page and the player card all
// take an injected fetch; this one answers the three `/api/data/*` reads from JSON files under the
// demo base and 404s everything else — which is precisely what those surfaces see with no backend
// (the player card unmounts itself, the voice-health line says the service is not running).
//
// v0.47.0 — with a music store, the card's three routes answer too: now / control / artwork, the
// shapes `musicApi.ts` serves, so the card's real polling and real buttons drive the demo's shelf.
//
// v0.48.1 — two bases. What she WROTE follows the language she was spoken to in (her diaries, her
// own skills: `demo/<lang>/data/`); what the server writes is one English grammar for both (the
// dream reports, the settings registry: `demo/data/`, re-presented by the views). And the voice
// health line gets the answer the real sidecar gives while her voice is playing — the tape imitates
// the server here as it does everywhere, instead of the settings page saying "not running" over it.

export type DemoBases = { lang: string; shared: string };

const DATA_ROUTES: Readonly<Record<string, { file: string; scope: keyof DemoBases }>> = {
  '/api/data/diaries': { file: 'data/diaries.json', scope: 'lang' },
  '/api/data/skills': { file: 'data/skills.json', scope: 'lang' },
  '/api/data/dreams': { file: 'data/dreams.json', scope: 'shared' },
};

const TTS_HEALTH = { ok: true, backend: { ready: true, state: 'ready' } };

function parse(url: string): URL {
  return new URL(url, 'http://demo.invalid/');
}

function pathOf(url: string): string {
  try {
    return parse(url).pathname;
  } catch {
    return url; // not a URL — match the raw string
  }
}

export function demoRoute(bases: DemoBases, url: string): string | null {
  const route = DATA_ROUTES[pathOf(url)];
  return route === undefined ? null : `${bases[route.scope]}${route.file}`;
}

const COVER_HASH = /^[a-z0-9-]+$/;

export function createDemoFetch(
  bases: DemoBases,
  fetchFn: FetchLike = (u, i) => fetch(u, i),
  music: MusicStore | null = null,
): FetchLike {
  return async (url, init) => {
    if (pathOf(url) === '/api/tts/health') return Response.json(TTS_HEALTH);
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
        return fetchFn(`${bases.shared}${file}`, init);
      }
    }
    const target = demoRoute(bases, url);
    if (target === null) return new Response('not found', { status: 404 });
    return fetchFn(target, init);
  };
}
