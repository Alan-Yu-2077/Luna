import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { compileScript } from './compile';
import { durationLookup } from './demoAudio';
import {
  FURTHEST_KEY,
  GUIDE_COPY,
  readFurthest,
  REPLAY_MINUTES,
  saveFurthest,
  sceneOpen,
  TYPE_LEAD_MS,
  TYPE_MS,
} from './director';
import { DemoScript, VoiceManifest } from './script';

// v0.51.9 (owner): no skipping ahead — the picker opens what was watched to its end, and the next one.
describe('the scene picker lock', () => {
  test('a fresh visitor can pick scene 1 only; finishing a scene opens the one after it', () => {
    expect([0, 1, 2].map((i) => sceneOpen(i, -1))).toEqual([true, false, false]);
    expect([0, 1, 2, 3].map((i) => sceneOpen(i, 1))).toEqual([true, true, true, false]);
  });

  test('the mark is kept for the tab, and a missing or broken store starts over', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(readFurthest(store)).toBe(-1);
    saveFurthest(store, 4);
    expect(data.get(FURTHEST_KEY)).toBe('4');
    expect(readFurthest(store)).toBe(4);
    data.set(FURTHEST_KEY, 'nonsense');
    expect(readFurthest(store)).toBe(-1);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readFurthest(broken)).toBe(-1);
    expect(() => saveFurthest(broken, 2)).not.toThrow();
    expect(readFurthest(null)).toBe(-1);
  });
});

// The entry card promises a length. Recompute it from each tape: the compiled timeline (her voice,
// the pacing, the curtains), his lines typed out, and a visitor's own clicks — ➤ after each line,
// Next scene, the few interactive moments.
describe('the length on the entry card', () => {
  const demoDir = join(import.meta.dir, '..', '..', 'demo');
  const LANGS = (['en', 'zh'] as const).filter((l) => existsSync(join(demoDir, l, 'script.json')));
  const PRESS_MS = 1500; // reading the typed line, then ➤
  const NEXT_MS = 3000; // a scene ends → Next scene
  const INTERACTIVE_MS = 15_000; // opening the paper on the desktop, pressing play

  for (const lang of LANGS) {
    test(`${lang}: about ${REPLAY_MINUTES} minutes, watched through`, async () => {
      const script = DemoScript.parse(await Bun.file(join(demoDir, lang, 'script.json')).json());
      const manifest = VoiceManifest.parse(await Bun.file(join(demoDir, lang, 'voice', 'manifest.json')).json());
      const { scenes } = compileScript(script, durationLookup(manifest));
      let ms = (scenes.length - 1) * NEXT_MS;
      for (const scene of scenes) {
        for (const run of [scene.prelude, ...scene.turns.map((t) => t.run)]) {
          ms += run.endMs;
          for (const cue of run.cues) {
            if (cue.kind === 'stage' && (cue.stage.kind === 'open_file' || cue.stage.kind === 'press_play')) {
              ms += INTERACTIVE_MS;
            }
          }
        }
        for (const turn of scene.turns) ms += TYPE_LEAD_MS + [...turn.userText].length * TYPE_MS + PRESS_MS;
      }
      expect(Math.abs(ms / 60_000 - REPLAY_MINUTES)).toBeLessThanOrEqual(3);
      expect(GUIDE_COPY[lang].length).toContain(String(REPLAY_MINUTES));
    });
  }

  test('reading every engineering note takes over an hour, in either language', async () => {
    const notes: unknown = await Bun.file(join(demoDir, 'notes.json')).json();
    const texts = { en: [] as string[], zh: [] as string[] };
    const walk = (o: unknown): void => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (o === null || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) {
        if ((k === 'en' || k === 'zh') && typeof v === 'string') texts[k].push(v);
        else walk(v);
      }
    };
    walk(notes);
    const words = texts.en.join(' ').match(/[A-Za-z0-9']+/g)?.length ?? 0;
    const hanzi = texts.zh.join('').match(/[\u4e00-\u9fff]/g)?.length ?? 0;
    expect(words / 220).toBeGreaterThan(60); // an unhurried 220 words a minute
    expect(hanzi / 450).toBeGreaterThan(60); // 450 characters a minute
  });
});
