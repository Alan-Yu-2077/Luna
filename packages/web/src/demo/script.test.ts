import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { compileScript } from './compile';
import { lineKey } from './demoAudio';
import { DemoScript, DREAM_ORDER, VoiceManifest, spokenLines } from './script';

// v0.46.0 — the SHIPPED tape, not a fixture: `demo/script.json` must parse and compile, and once a
// voice manifest exists every spoken line must be in it (an edited line with a stale voice is a
// CI red, never a visitor hearing the wrong words). An empty manifest is a demo not yet rendered —
// allowed, and silent.

const demoDir = join(import.meta.dir, '..', '..', 'demo');

const script = DemoScript.parse(await Bun.file(join(demoDir, 'script.json')).json());
const manifest = VoiceManifest.parse(await Bun.file(join(demoDir, 'voice', 'manifest.json')).json());

describe('demo/script.json', () => {
  test('parses, compiles, and every scene has a title and at least one beat', () => {
    const compiled = compileScript(script);
    expect(compiled.scenes.length).toBe(script.scenes.length);
    for (const s of script.scenes) {
      expect(s.title.trim()).not.toBe('');
      expect(s.beats.length).toBeGreaterThan(0);
    }
  });

  test('scene ids are unique', () => {
    const ids = script.scenes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.skipIf(manifest.lines.length === 0)('every spoken line has a rendered voice (manifest present)', () => {
    const voiced = new Set(manifest.lines.map((l) => lineKey(l.text)));
    const missing = spokenLines(script).filter((t) => !voiced.has(lineKey(t)));
    expect(missing).toEqual([]);
  });

  test('the manifest carries no orphan lines (a voice for text the script no longer says)', () => {
    const spoken = new Set(spokenLines(script).map(lineKey));
    const orphans = manifest.lines.filter((l) => !spoken.has(lineKey(l.text))).map((l) => l.text);
    expect(orphans).toEqual([]);
  });

  test('the three data files parse against the protocol shapes', async () => {
    const { DataDiaries, DataDreams, DataSkills } = await import('@luna/protocol');
    const { DemoSettings } = await import('./script');
    DataDiaries.parse(await Bun.file(join(demoDir, 'data', 'diaries.json')).json());
    DataDreams.parse(await Bun.file(join(demoDir, 'data', 'dreams.json')).json());
    DataSkills.parse(await Bun.file(join(demoDir, 'data', 'skills.json')).json());
    DemoSettings.parse(await Bun.file(join(demoDir, 'data', 'settings.json')).json());
  });
});

// ── v0.47.0 — the blocks the full show rides on ─────────────────────────────────────────────────

describe('demo/script.json — dream and music blocks', () => {
  test.skipIf(!script.dream)('the dream’s steps follow the cycle’s order (a script cannot dream backwards)', () => {
    const order = script.dream!.steps.map((s) => DREAM_ORDER.indexOf(s.step));
    for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThanOrEqual(order[i - 1]!);
  });

  test.skipIf(!script.music)('every cover the shelf names exists as a generated svg', async () => {
    for (const t of script.music!.tracks) {
      if (!t.cover) continue;
      expect(await Bun.file(join(demoDir, 'music', `${t.cover}.svg`)).exists()).toBe(true);
    }
  });

  test('the shelf, if any, and the dream, if any, compile into the menu door and the card', () => {
    const c = compileScript(script);
    expect(c.dream === null).toBe(script.dream === undefined);
  });
});
