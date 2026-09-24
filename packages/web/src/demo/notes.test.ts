import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DemoNotes, inlineHtml, snippetLines, sourceUrl } from './notes';
import { DemoScript } from './script';

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');
const demoDir = join(import.meta.dir, '..', '..', 'demo');
const notesPath = join(demoDir, 'notes.json');

describe('notes markup', () => {
  test('escapes everything, then allows only `code` and **emphasis**', () => {
    expect(inlineHtml('a <script>x</script> & `b<c>` **d**')).toBe(
      'a &lt;script&gt;x&lt;/script&gt; &amp; <code>b&lt;c&gt;</code> <b>d</b>',
    );
  });
  test('a source link pins the commit and the exact lines', () => {
    expect(sourceUrl({ repo: 'https://github.com/o/r/', ref: 'abc1234' }, 'a/b.ts', 10, 'x\ny\nz\n')).toBe(
      'https://github.com/o/r/blob/abc1234/a/b.ts#L10-L12',
    );
    expect(snippetLines('one')).toBe(1);
  });
});

// The notes are the page's engineering claims. Each code block must be the named file's lines, verbatim,
// where it says they are; each quote must be a line the scene really says; every scene has its stack.
describe.skipIf(!existsSync(notesPath))('demo/notes.json', () => {
  const notes = () => DemoNotes.parse(JSON.parse(readFileSync(notesPath, 'utf8')));
  const tape = (lang: 'en' | 'zh') =>
    DemoScript.parse(JSON.parse(readFileSync(join(demoDir, lang, 'script.json'), 'utf8')));
  const linesOf = (lang: 'en' | 'zh', sceneId: string): Set<string> => {
    const scene = tape(lang).scenes.find((s) => s.id === sceneId);
    const out = new Set<string>();
    for (const b of scene?.beats ?? []) {
      if (b.kind === 'user' || b.kind === 'luna') out.add(b.text);
      if (b.kind === 'proactive') for (const l of b.lines ?? []) out.add(l.text);
    }
    return out;
  };

  test('parses, and every scene of the show has notes (and no notes for a scene that does not exist)', () => {
    const ids = tape('en').scenes.map((s) => s.id);
    expect(Object.keys(notes().scenes).sort()).toEqual([...ids].sort());
  });

  test('every code block is the named file, verbatim, at the stated line', () => {
    const bad: string[] = [];
    for (const [id, scene] of Object.entries(notes().scenes)) {
      for (const sheet of scene.sheets) {
        for (const b of sheet.blocks) {
          if (b.type !== 'code') continue;
          const path = join(repoRoot, b.file);
          if (!existsSync(path)) {
            bad.push(`${id}: missing file ${b.file}`);
            continue;
          }
          // Split on \r?\n: a Windows checkout (CI) has CRLF line ends; the snippets are stored with \n.
          const file = readFileSync(path, 'utf8').split(/\r?\n/);
          const want = b.snippet.replace(/\n+$/, '').split('\n');
          const got = file.slice(b.from - 1, b.from - 1 + want.length);
          if (got.join('\n') !== want.join('\n')) bad.push(`${id}: ${b.file}:${b.from} does not match`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  // v0.51.0: a card block is a tool card this scene really shows — the same tool, the same summary line.
  test('every card is a tool card of its scene (name and summary as the tape has them)', () => {
    const bad: string[] = [];
    const script = tape('en');
    for (const [id, scene] of Object.entries(notes().scenes)) {
      const beats = script.scenes.find((s) => s.id === id)?.beats ?? [];
      const cards = new Set<string>();
      for (const b of beats) {
        if (b.kind === 'tool') cards.add(`${b.name}\u0000${b.summary}`);
        if (b.kind === 'proactive') for (const c of [...(b.tools ?? []), ...(b.then_tools ?? [])]) cards.add(`${c.name}\u0000${c.summary}`);
      }
      for (const sheet of scene.sheets) {
        for (const b of sheet.blocks) {
          if (b.type === 'card' && !cards.has(`${b.tool}\u0000${b.summary}`)) bad.push(`${id}: ${b.tool} — ${b.summary}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  // A quote may be an excerpt, but a verbatim one: contiguous text of a line the scene really says.
  test('every quote is (part of) a line the scene really says, in each language', () => {
    const bad: string[] = [];
    for (const [id, scene] of Object.entries(notes().scenes)) {
      const en = linesOf('en', id);
      const zh = linesOf('zh', id);
      for (const sheet of scene.sheets) {
        for (const b of sheet.blocks) {
          if (b.type !== 'quote') continue;
          if (![...en].some((l) => l.includes(b.text.en))) bad.push(`${id} en: ${b.text.en}`);
          if (![...zh].some((l) => l.includes(b.text.zh))) bad.push(`${id} zh: ${b.text.zh}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
