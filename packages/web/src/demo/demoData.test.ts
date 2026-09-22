import { describe, expect, test } from 'bun:test';
import { createDemoFetch, demoRoute } from './demoData';
import { createMusicStore } from './demoMusic';

// v0.46.0 — the static data surface: three reads answered from files, everything else a 404.

describe('demoRoute', () => {
  test('maps the three data reads under the base, ignoring query strings and origins', () => {
    expect(demoRoute('./demo/', '/api/data/diaries')).toBe('./demo/data/diaries.json');
    expect(demoRoute('./demo/', '/api/data/dreams?limit=5')).toBe('./demo/data/dreams.json');
    expect(demoRoute('/x/', 'http://127.0.0.1:5173/api/data/skills')).toBe('/x/data/skills.json');
  });

  test('anything else has no route', () => {
    expect(demoRoute('./demo/', '/api/tts/health')).toBeNull();
    expect(demoRoute('./demo/', '/api/music/now')).toBeNull();
    expect(demoRoute('./demo/', '/api/data/soul')).toBeNull();
  });
});

describe('createDemoFetch', () => {
  test('routes a data read to the file and hands the init through', async () => {
    const calls: string[] = [];
    const f = createDemoFetch('./demo/', async (u) => {
      calls.push(u);
      return new Response('{"entries":[]}');
    });
    const res = await f('/api/data/diaries');
    expect(res.ok).toBe(true);
    expect(calls).toEqual(['./demo/data/diaries.json']);
  });

  test('a non-data URL is a 404 without touching the network — the same answer a missing backend gives', async () => {
    let touched = false;
    const f = createDemoFetch('./demo/', async () => {
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
      './demo/',
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
    const bare = createDemoFetch('./demo/', async () => new Response(''));
    expect((await bare('/api/music/now')).status).toBe(404);
    const withStore = createDemoFetch('./demo/', async (u) => new Response(u), createMusicStore(tracks));
    expect(await (await withStore('/api/data/skills')).text()).toBe('./demo/data/skills.json');
  });
});
