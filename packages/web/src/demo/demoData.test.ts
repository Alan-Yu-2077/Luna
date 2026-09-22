import { describe, expect, test } from 'bun:test';
import { createDemoFetch, demoRoute } from './demoData';

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
