// v0.50.0 — the engineering notes: after each scene, a stack of paper sheets on what the visitor just
// watched — why she said it, and the mechanism and code behind it. One file for both languages
// (`demo/notes.json`): the structure and the code are shared, only the words differ, so the two can
// never disagree about the code. Every snippet is verbatim from the repo at `ref`; notes.test.ts holds
// each one to the file it names, line for line.
import { z } from 'zod';
import type { UiLang } from '../ui/uiCopy';

const Text = z.object({ en: z.string().min(1), zh: z.string().min(1) });

export const NoteBlock = z.discriminatedUnion('type', [
  z.object({ type: z.literal('p'), text: Text }),
  z.object({ type: z.literal('quote'), text: Text }),
  z.object({ type: z.literal('aside'), text: Text }),
  z.object({ type: z.literal('steps'), items: z.array(Text).min(2).max(8) }),
  z.object({ type: z.literal('flow'), items: z.array(Text).min(2).max(6) }),
  // v0.51.0: a tool card from this scene, drawn as the chat draws it (its start label, then its summary).
  z.object({ type: z.literal('card'), tool: z.string().min(1), summary: z.string().min(1) }),
  z.object({
    type: z.literal('code'),
    file: z.string().min(1),
    from: z.number().int().positive(),
    snippet: z.string().min(1),
    note: Text.optional(),
  }),
]);
export type NoteBlock = z.infer<typeof NoteBlock>;

export const NoteSheet = z.object({ title: Text, blocks: z.array(NoteBlock).min(1) });
export type NoteSheet = z.infer<typeof NoteSheet>;

export const SceneNotes = z.object({ hook: Text, sheets: z.array(NoteSheet).min(2) });
export type SceneNotes = z.infer<typeof SceneNotes>;

export const DemoNotes = z.object({
  _note: z.string().optional(),
  repo: z.string().url(),
  ref: z.string().regex(/^[0-9a-f]{7,40}$/),
  scenes: z.record(z.string(), SceneNotes),
});
export type DemoNotes = z.infer<typeof DemoNotes>;

export type Localized = { en: string; zh: string };
export const say = (text: Localized, lang: UiLang): string => text[lang];

export function snippetLines(snippet: string): number {
  return snippet.replace(/\n+$/, '').split('\n').length;
}

// The link opens the exact lines at the commit the notes were checked against, not a moving branch.
export function sourceUrl(notes: Pick<DemoNotes, 'repo' | 'ref'>, file: string, from: number, snippet: string): string {
  const to = from + snippetLines(snippet) - 1;
  return `${notes.repo.replace(/\/+$/, '')}/blob/${notes.ref}/${file}#L${from}-L${to}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

// The notes' only markup: `code` and **emphasis**. Everything is escaped first, so the text can carry
// nothing else into the page. (Code snippets never pass through here — they are escaped verbatim.)
export function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
}
