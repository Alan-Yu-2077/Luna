import { describe, expect, test } from 'bun:test';
import { PACING } from './compile';
import { loadDemo, readDemoBridge, readPortrait } from './demoMode';

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
    const bundle = await loadDemo({ base: './demo/' }, 'zh', async (u) => {
      urls.push(u);
      if (u.endsWith('script.json')) return Response.json(script);
      if (u.endsWith('manifest.json')) return Response.json({ lines: [{ id: 'x', text: 'l', file: 'x.mp3', durationMs: 900 }] });
      return Response.json([]);
    });
    // v0.48.1: the tape and her voice per language; the settings registry (the server's English) shared.
    // v0.50.0: the engineering notes are shared too — one file carries both languages.
    expect(urls.sort()).toEqual([
      './demo/data/settings.json',
      './demo/notes.json',
      './demo/zh/script.json',
      './demo/zh/voice/manifest.json',
    ]);
    expect(bundle.compiled.scenes[0]?.turns[0]?.run.endMs).toBe(PACING.thinkMs + PACING.chunkMs + 900);
    expect(bundle.settings).toEqual([]);
  });

  // v0.51.0: unhashed files revalidate, so a deploy never plays the new code over yesterday's tape.
  test('the tape, the manifest, the settings and the notes are always revalidated', async () => {
    const caches: Array<RequestCache | undefined> = [];
    await loadDemo({ base: '/d/' }, 'en', async (u, init) => {
      caches.push(init?.cache);
      if (u.endsWith('script.json')) return Response.json(script);
      return u.endsWith('manifest.json') ? Response.json({ lines: [] }) : Response.json([]);
    });
    expect(caches).toEqual(['no-cache', 'no-cache', 'no-cache', 'no-cache']);
  });

  test('a broken notes file never blocks the boot — the replay just has no notes', async () => {
    const bundle = await loadDemo({ base: '/d/' }, 'en', async (u) =>
      u.endsWith('script.json') ? Response.json(script) : u.endsWith('notes.json') ? new Response('{not json') : new Response('', { status: 404 }),
    );
    expect(bundle.notes).toBeNull();
    expect(bundle.ids).toEqual(['a']);
  });

  test('a missing manifest or settings file degrades — silent lines, an empty panel — never a failed boot', async () => {
    const bundle = await loadDemo({ base: '/d/' }, 'en', async (u) =>
      u.endsWith('script.json') ? Response.json(script) : new Response('', { status: 404 }),
    );
    expect(bundle.settings).toEqual([]);
    expect(bundle.notes).toBeNull(); // no notes file: the replay plays on without the button
    await expect(bundle.speech('l')).rejects.toMatchObject({ status: 404 });
  });

  test('a missing script is the one thing that fails', async () => {
    await expect(loadDemo({ base: '/d/' }, 'en', async () => new Response('', { status: 404 }))).rejects.toThrow(/script/);
  });
});

// v0.46.3: the opening framing rides the bridge; nonsense is dropped, not clamped into something.
describe('readPortrait via the bridge', () => {
  test('a valid portrait comes through; absent → none (the full figure)', () => {
    expect(readDemoBridge({ lunaDemo: { portrait: { zoom: 1.7, top: 0.12 } } })).toEqual({
      base: './demo/',
      portrait: { zoom: 1.7, top: 0.12 },
    });
    expect(readDemoBridge({ lunaDemo: {} })).toEqual({ base: './demo/' });
  });

  test('out-of-bounds or malformed values are ignored', () => {
    expect(readPortrait({ zoom: 0.5, top: 0.1 })).toBeNull();
    expect(readPortrait({ zoom: 4, top: 0.1 })).toBeNull();
    expect(readPortrait({ zoom: 1.7, top: 0.9 })).toBeNull();
    expect(readPortrait({ zoom: '1.7', top: 0.1 })).toBeNull();
    expect(readPortrait({ zoom: Number.NaN, top: 0.1 })).toBeNull();
    expect(readPortrait('portrait')).toBeNull();
  });
});
