import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DataDiaries, DataDreams, DataSkills } from '@luna/protocol';
import { isKnownStep } from '../ui/dreamWords';
import { compileScript } from './compile';
import { lineKey } from './demoAudio';
import { DemoScript, DemoSettings, DREAM_ORDER, VoiceManifest, spokenLines, type DemoScript as Script } from './script';

// v0.46.0 — the SHIPPED tape, not a fixture: every language's `demo/<lang>/script.json` must parse
// and compile, and once a voice manifest exists every spoken line must be in it (an edited line with
// a stale voice is a CI red, never a visitor hearing the wrong words). An empty manifest is a demo
// not yet rendered — allowed, and silent.
// v0.48.1 — two languages, one story: the Chinese tape must be the English tape's skeleton byte for
// byte (the same tools with the same server summaries, the same faces, the same timing), differing
// only where words are — and what she wrote must sit on the same days with the same stamps.

const demoDir = join(import.meta.dir, '..', '..', 'demo');
// Every language the replay ships — a directory with a script is a language.
const LANGS = (['en', 'zh'] as const).filter((l) => existsSync(join(demoDir, l, 'script.json')));

async function loadLang(lang: string): Promise<{ script: Script; manifest: VoiceManifest }> {
  const script = DemoScript.parse(await Bun.file(join(demoDir, lang, 'script.json')).json());
  const mf = Bun.file(join(demoDir, lang, 'voice', 'manifest.json'));
  const manifest = (await mf.exists()) ? VoiceManifest.parse(await mf.json()) : { lines: [] };
  return { script, manifest };
}

const tapes = Object.fromEntries(await Promise.all(LANGS.map(async (l) => [l, await loadLang(l)] as const)));

const SENTENCE = /[。！？!?]+|\n+/;
const CLAUSE = /[，,；;：:。！？!?]+|\n+/;
const parts = (text: string, re: RegExp): string[] => text.split(re).map((s) => s.trim()).filter((s) => s !== '');

for (const lang of LANGS) {
  const { script, manifest } = tapes[lang]!;

  describe(`demo/${lang}/script.json`, () => {
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

    test('what she wrote in this language parses against the protocol shapes', async () => {
      DataDiaries.parse(await Bun.file(join(demoDir, lang, 'data', 'diaries.json')).json());
      DataSkills.parse(await Bun.file(join(demoDir, lang, 'data', 'skills.json')).json());
    });

    // v0.47.0 — the blocks the full show rides on.
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

    // v0.47.1 — the message tool's humanity caps. The real `message` tool refuses text over 280
    // chars, over 5 sentences, or with a clause over 150 chars (server/src/persona/humanity.ts). A line
    // the server would reject is not "a real capability" — so the tape may not carry one. The same
    // splitter counts 。 as a sentence end, so a Chinese line is held to exactly what the server holds.
    test('every spoken line passes the message tool’s caps: ≤ 280 chars, ≤ 5 sentences, clause ≤ 150', () => {
      const offenders = spokenLines(script).flatMap((text) => {
        const why: string[] = [];
        if (text.length > 280) why.push(`${text.length} chars`);
        const sentences = parts(text, SENTENCE).length;
        if (sentences > 5) why.push(`${sentences} sentences`);
        const longest = Math.max(...parts(text, CLAUSE).map((c) => c.length));
        if (longest > 150) why.push(`clause ${longest} chars`);
        return why.length ? [`${text.slice(0, 50)}… — ${why.join(', ')}`] : [];
      });
      expect(offenders).toEqual([]);
    });
  });
}

// What both languages share: the server's own English (dream reports, the settings registry).
describe('demo/data — the shared files', () => {
  test('parse against the protocol shapes, and every dream step has a sentence in the book', async () => {
    const dreams = DataDreams.parse(await Bun.file(join(demoDir, 'data', 'dreams.json')).json());
    DemoSettings.parse(await Bun.file(join(demoDir, 'data', 'settings.json')).json());
    const unknown = dreams.dreams.flatMap((d) => d.steps.map((s) => s.step)).filter((s) => !isKnownStep(s));
    expect(unknown).toEqual([]);
  });
});

// ── v0.48.1 — one story in two languages ────────────────────────────────────────────────────────

// Everything but the words: scene titles, what he types, what she says, and the curtain's labels.
function skeleton(script: Script): unknown {
  const { _note, ...rest } = script as Script & { _note?: string };
  void _note;
  return JSON.parse(
    JSON.stringify(rest, (key, value: unknown) => (key === 'title' || key === 'text' || key === 'label' ? undefined : value)),
  );
}

describe.skipIf(!tapes.zh)('the Chinese tape is the English tape, in Chinese', () => {
  // Read inside the tests: the describe body still runs when the Chinese tape is absent (skipped).
  const tape = (lang: 'en' | 'zh'): Script => tapes[lang]!.script;

  test('same scenes, same beats, same tools with the same server summaries, same faces, same timing', () => {
    expect(skeleton(tape('zh'))).toEqual(skeleton(tape('en')));
  });

  test('the words did change — every spoken line and every title is the Chinese one', () => {
    const zh = tape('zh');
    const cjk = /[一-鿿]/;
    expect(spokenLines(zh).filter((l) => !cjk.test(l))).toEqual([]);
    expect(zh.scenes.map((s) => s.title).filter((t) => !cjk.test(t))).toEqual([]);
  });

  test('her diaries sit on the same days with the same stamps', async () => {
    const read = async (lang: string) =>
      DataDiaries.parse(await Bun.file(join(demoDir, lang, 'data', 'diaries.json')).json()).entries.map((e) => ({
        kind: e.kind,
        period_key: e.period_key,
        generated_ms: e.generated_ms,
      }));
    expect(await read('zh')).toEqual(await read('en'));
  });

  test('her skills are the same records; the owner’s and the retired one are word for word his', async () => {
    const read = async (lang: string) => DataSkills.parse(await Bun.file(join(demoDir, lang, 'data', 'skills.json')).json()).skills;
    const en = await read('en');
    const zh = await read('zh');
    const fixed = (s: (typeof en)[number]) => ({ ...s, description: '', body: '' });
    expect(zh.map(fixed)).toEqual(en.map(fixed));
    for (const [i, s] of en.entries()) {
      if (s.source === 'owner' || s.deprecated_ms > 0) {
        expect(zh[i]!.description).toBe(s.description);
        expect(zh[i]!.body).toBe(s.body);
      }
    }
  });
});
