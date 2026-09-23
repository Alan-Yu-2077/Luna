import { describe, expect, test } from 'bun:test';
import { createDemoFetch, demoRoute } from './demoData';
import { createMusicStore } from './demoMusic';

// v0.46.0 — the static data surface: three reads answered from files, everything else a 404.

const BASES = { lang: './demo/zh/', shared: './demo/' };

describe('demoRoute', () => {
  // v0.48.1: what she wrote follows her language; what the server writes is shared English.
  test('her diaries and skills come from the language base, the dream reports from the shared one', () => {
    expect(demoRoute(BASES, '/api/data/diaries')).toBe('./demo/zh/data/diaries.json');
    expect(demoRoute(BASES, '/api/data/dreams?limit=5')).toBe('./demo/data/dreams.json');
    expect(demoRoute({ lang: '/x/en/', shared: '/x/' }, 'http://127.0.0.1:5173/api/data/skills')).toBe('/x/en/data/skills.json');
  });

  test('anything else has no file route', () => {
    expect(demoRoute(BASES, '/api/tts/health')).toBeNull();
    expect(demoRoute(BASES, '/api/music/now')).toBeNull();
    expect(demoRoute(BASES, '/api/data/soul')).toBeNull();
  });
});

describe('createDemoFetch', () => {
  test('routes a data read to the file and hands the init through', async () => {
    const calls: string[] = [];
    const f = createDemoFetch(BASES, async (u) => {
      calls.push(u);
      return new Response('{"entries":[]}');
    });
    const res = await f('/api/data/diaries');
    expect(res.ok).toBe(true);
    expect(calls).toEqual(['./demo/zh/data/diaries.json']);
  });

  test('the voice health line hears what the real sidecar says while her voice plays', async () => {
    const f = createDemoFetch(BASES, async () => new Response('', { status: 500 }));
    const res = await f('/api/tts/health');
    expect(res.ok).toBe(true);
    expect(((await res.json()) as { backend: { state: string } }).backend.state).toBe('ready');
  });

  test('a non-data URL is a 404 without touching the network — the same answer a missing backend gives', async () => {
    let touched = false;
    const f = createDemoFetch(BASES, async () => {
      touched = true;
      return new Response('');
    });
    const res = await f('/api/music/now');
    expect(res.status).toBe(404);
    expect(touched).toBe(false);
  });
});

// ── v0.47.0 — the card's routes, when the script has a shelf ────────────────────────────────────

describe('createDemoFetch with a music store', () => {
  const tracks = [{ id: 'hw', title: 'Heat Waves', artist: 'Glass Animals', album: 'Dreamland', duration: 238, cover: 'hw' }];

  test('now answers the MusicNow shape; control mutates through the store; artwork resolves a known cover', async () => {
    const store = createMusicStore(tracks, () => 0);
    const hits: string[] = [];
    const f = createDemoFetch(
      BASES,
      async (u) => {
        hits.push(u);
        return new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } });
      },
      store,
    );
    const idle = (await (await f('/api/music/now')).json()) as { track: unknown };
    expect(idle.track).toBeNull();
    store.set('hw');
    const on = (await (await f('/api/music/now')).json()) as { track: { title: string } };
    expect(on.track.title).toBe('Heat Waves');
    const paused = (await (await f('/api/music/control', { method: 'POST', body: JSON.stringify({ op: 'pause' }) })).json()) as { playing: boolean };
    expect(paused.playing).toBe(false);
    expect((await f('/api/music/control', { method: 'POST', body: '{"op":"x"}' })).status).toBe(400);
    const art = await f('/api/music/artwork?h=hw');
    expect(art.ok).toBe(true);
    expect(hits).toEqual(['./demo/music/hw.svg']);
    expect((await f('/api/music/artwork?h=nope')).status).toBe(404);
    expect((await f('/api/music/artwork?h=../etc')).status).toBe(404);
  });

  test('without a store the music routes stay 404, and the data routes are untouched by the store', async () => {
    const bare = createDemoFetch(BASES, async () => new Response(''));
    expect((await bare('/api/music/now')).status).toBe(404);
    const withStore = createDemoFetch(BASES, async (u) => new Response(u), createMusicStore(tracks));
    expect(await (await withStore('/api/data/skills')).text()).toBe('./demo/zh/data/skills.json');
  });
});
