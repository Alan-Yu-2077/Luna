import { describe, expect, test } from 'bun:test';
import { loadDemo, readDemoBridge } from './demoMode';

// v0.46.0 — the bridge that decides whether this boot is the replay, and the bundle it loads.

describe('readDemoBridge', () => {
  test('absent → null: the desktop app and the dev server never see a tape', () => {
    expect(readDemoBridge({})).toBeNull();
    expect(readDemoBridge({ lunaDemo: null })).toBeNull();
    expect(readDemoBridge({ lunaDemo: 'yes' })).toBeNull();
  });

  test('present → a base that always ends in a slash, defaulting to ./demo/', () => {
    expect(readDemoBridge({ lunaDemo: {} })).toEqual({ base: './demo/' });
    expect(readDemoBridge({ lunaDemo: { base: '/tape' } })).toEqual({ base: '/tape/' });
    expect(readDemoBridge({ lunaDemo: { base: '  ' } })).toEqual({ base: './demo/' });
  });
});

describe('loadDemo', () => {
  const script = {
    version: 1,
    scenes: [{ id: 'a', title: 'A', beats: [{ kind: 'user', text: 'u' }, { kind: 'luna', text: 'l' }] }],
  };

  test('loads script + manifest + settings from the base and compiles', async () => {
    const urls: string[] = [];
    const bundle = await loadDemo({ base: './demo/' }, async (u) => {
      urls.push(u);
      if (u.endsWith('script.json')) return Response.json(script);
      if (u.endsWith('manifest.json')) return Response.json({ lines: [{ id: 'x', text: 'l', file: 'x.mp3', durationMs: 900 }] });
      return Response.json([]);
    });
    expect(urls.sort()).toEqual(['./demo/data/settings.json', './demo/script.json', './demo/voice/manifest.json']);
    expect(bundle.compiled.scenes[0]?.turns[0]?.run.endMs).toBe(700 + 25 + 900);
    expect(bundle.settings).toEqual([]);
  });

  test('a missing manifest or settings file degrades — silent lines, an empty panel — never a failed boot', async () => {
    const bundle = await loadDemo({ base: '/d/' }, async (u) =>
      u.endsWith('script.json') ? Response.json(script) : new Response('', { status: 404 }),
    );
    expect(bundle.settings).toEqual([]);
    await expect(bundle.speech('l')).rejects.toMatchObject({ status: 404 });
  });

  test('a missing script is the one thing that fails', async () => {
    await expect(loadDemo({ base: '/d/' }, async () => new Response('', { status: 404 }))).rejects.toThrow(/script/);
  });
});
