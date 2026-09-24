// v0.48.0 (Initiative 40) — the quiet note's phrase table, shared by both ends of the wire.
//
// A quiet waking (she did something, said nothing) ships one short English line built from the
// turn's tool calls: `searched the web · read 2 pages · saved a memory`. The server writes it
// (proactive/quietWork.ts compressNote) and the ledger stores it in English, always. The front end
// re-presents it in the interface language by parsing the same table — so a wording change on the
// server side fails a test here instead of silently leaking English into a Chinese screen.

export type QuietVerb = {
  en: (n: number) => string;
  zh: (n: number) => string;
  // Reads an English part back into its count (1 when the phrase does not carry one).
  parse: (part: string) => number | null;
};

const fixed = (en: string, zh: string): QuietVerb => ({
  en: () => en,
  zh: () => zh,
  parse: (p) => (p === en ? 1 : null),
});

const counted = (one: string, many: (n: number) => string, manyRe: RegExp, zhOne: string, zhMany: (n: number) => string): QuietVerb => ({
  en: (n) => (n === 1 ? one : many(n)),
  zh: (n) => (n === 1 ? zhOne : zhMany(n)),
  parse: (p) => {
    if (p === one) return 1;
    const m = manyRe.exec(p);
    return m ? Number(m[1]) : null;
  },
});

export const QUIET_VERBS: Record<string, QuietVerb> = {
  remember: counted('saved a memory', (n) => `saved ${n} memories`, /^saved (\d+) memories$/, '存了一条记忆', (n) => `存了 ${n} 条记忆`),
  recall: fixed('looked through her memories', '翻了翻记忆'),
  web_search: fixed('searched the web', '上网搜了搜'),
  web_fetch: counted('read a page', (n) => `read ${n} pages`, /^read (\d+) pages$/, '读了一个网页', (n) => `读了 ${n} 个网页`),
  music_now: fixed('glanced at the music', '瞄了眼在放的歌'),
  music_library: fixed('browsed his listening history', '翻了翻他的听歌记录'),
  music_lyrics: fixed('re-read the lyrics', '又看了一遍歌词'),
  weather: fixed('checked the weather', '看了看天气'),
  enter_dream: fixed('slipped toward a dream', '准备溜进梦里'),
};

// A tool the table has never met: named as itself, counted when repeated.
export function unknownVerbEn(name: string, n: number): string {
  return `used ${name}${n > 1 ? ` ×${n}` : ''}`;
}

const UNKNOWN_RE = /^used ([\w-]+)(?: ×(\d+))?$/;

export const QUIET_NOTE_SEPARATOR = ' · ';

// The note in Chinese, part by part. A part that does not parse (a new phrase, or the tail the
// server's 140-char cap cut mid-word) stays exactly as the server wrote it.
export function quietNoteZh(note: string): string {
  return note
    .split(QUIET_NOTE_SEPARATOR)
    .map((part) => {
      for (const verb of Object.values(QUIET_VERBS)) {
        const n = verb.parse(part);
        if (n !== null) return verb.zh(n);
      }
      const u = UNKNOWN_RE.exec(part);
      if (u) return `用了 ${u[1]}${u[2] ? ` ×${u[2]}` : ''}`;
      return part;
    })
    .join(QUIET_NOTE_SEPARATOR);
}
