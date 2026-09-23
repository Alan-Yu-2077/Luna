import { describe, expect, test } from 'bun:test';
import { QUIET_VERBS, quietNoteZh, unknownVerbEn } from './quietNote';

// v0.48.0: the quiet note is written in English by the server and read back by the front end. The
// round trip is the contract — every phrase the server can write parses, at every count.
describe('the quiet-note phrase table', () => {
  test('every English phrase parses back to its own count', () => {
    for (const [tool, verb] of Object.entries(QUIET_VERBS)) {
      for (const n of [1, 2, 7]) {
        const parsed = verb.parse(verb.en(n));
        expect(parsed, `${tool} ×${n}`).not.toBeNull();
        // Fixed phrases carry no count; counted ones must round-trip exactly.
        if (verb.en(1) !== verb.en(2)) expect(parsed).toBe(n);
      }
    }
  });

  test('no two tools share an English phrase — a parse can never land on the wrong verb', () => {
    const ones = Object.values(QUIET_VERBS).map((v) => v.en(1));
    expect(new Set(ones).size).toBe(ones.length);
    for (const [a, va] of Object.entries(QUIET_VERBS)) {
      for (const [b, vb] of Object.entries(QUIET_VERBS)) {
        if (a !== b) expect(vb.parse(va.en(1)), `${a} parsed as ${b}`).toBeNull();
      }
    }
  });

  test('the Chinese note reads part by part, and unknown or cut-off parts stay as written', () => {
    expect(quietNoteZh('searched the web · read 2 pages · saved a memory')).toBe('上网搜了搜 · 读了 2 个网页 · 存了一条记忆');
    expect(quietNoteZh(unknownVerbEn('plan', 2))).toBe('用了 plan ×2');
    expect(quietNoteZh('checked the weather · browsed his listening hist…')).toBe('看了看天气 · browsed his listening hist…');
  });
});
