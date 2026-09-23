import { describe, expect, test } from 'bun:test';
import { toolCardLabel } from './toolLabels';

describe('toolCardLabel', () => {
  test('recall (started) → cute label', () =>
    expect(toolCardLabel('🔧 recall…')).toBe('flipped through memories 🔖'));
  test('read_file (started) → cute label', () =>
    expect(toolCardLabel('🔧 read_file…')).toBe('read something 📖'));
  test('enter_dream → cute label', () =>
    expect(toolCardLabel('🔧 enter_dream…')).toBe('getting ready to dream 🌙'));
  test('unknown summary → stripped passthrough', () =>
    expect(toolCardLabel('🔧 2 hits')).toBe('2 hits'));

  // v0.20.9 — exact match, not substring: the old includes() mislabeled these.
  test('recall_skill (started) → its OWN cute label (not recall)', () =>
    expect(toolCardLabel('🔧 recall_skill…')).toBe('recalled a skill 💡'));
  test('propose_self_edit (started) → its OWN label (not edit)', () =>
    expect(toolCardLabel('🔧 propose_self_edit…')).toBe('proposed a self-edit ✍️'));
  test('a finish summary containing a tool-name substring is NOT rewritten', () =>
    expect(toolCardLabel('🔧 edited memory/recall.ts (1 replacements)')).toBe(
      'edited memory/recall.ts (1 replacements)',
    ));
});

describe('v0.48.0 — every tool, both languages', () => {
  test('the tools that used to leak their raw id now carry a label', () => {
    for (const name of ['weather', 'music_now', 'music_control', 'music_library', 'music_lyrics', 'time_now'] as const) {
      expect(toolCardLabel(`🔧 ${name}…`, 'en')).not.toBe(name);
      expect(toolCardLabel(`🔧 ${name}…`, 'zh')).not.toBe(name);
    }
  });
  test('the start label speaks the interface language; the finish summary stays the tool’s own words', () => {
    expect(toolCardLabel('🔧 recall…', 'zh')).toBe('翻了翻记忆 🔖');
    expect(toolCardLabel('🔧 3 hits', 'zh')).toBe('3 hits');
    expect(toolCardLabel('🔧 tests pass (2110)', 'zh')).toBe('tests pass (2110)');
  });
  test('remember no longer wears the second-thought glyph', () => {
    expect(toolCardLabel('🔧 remember…', 'en')).not.toContain('💭');
  });
});
