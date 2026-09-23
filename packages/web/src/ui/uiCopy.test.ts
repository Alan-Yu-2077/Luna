import { afterEach, describe, expect, test } from 'bun:test';
import { copyTable, parseUiLang, resetUiLang, resolveUiLang, setUiLang, t, uiLang } from './uiCopy';

// v0.48.0 (Initiative 40): the interface language. The table must never be half-translated, the
// resolution order is a promise to the owner (an upgrade does not flip his app), and the module
// state is set once and read everywhere — so a test that sets it resets it.

afterEach(() => resetUiLang());

describe('the copy table', () => {
  test('every key has BOTH languages (parity — no half-translated screen)', () => {
    for (const [key, entry] of Object.entries(copyTable())) {
      expect(entry.en.trim().length, `en missing for ${key}`).toBeGreaterThan(0);
      expect(entry.zh.trim().length, `zh missing for ${key}`).toBeGreaterThan(0);
    }
  });

  test('placeholders are the same in both languages — a {n} cannot go missing in one', () => {
    const vars = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
    for (const [key, entry] of Object.entries(copyTable())) {
      expect(vars(entry.zh), `placeholders differ for ${key}`).toEqual(vars(entry.en));
    }
  });

  test('t() fills placeholders and follows the chosen language', () => {
    expect(t('time.min', { n: 3 }, 'en')).toBe('3 min ago');
    expect(t('time.min', { n: 3 }, 'zh')).toBe('3 分钟前');
    setUiLang('zh');
    expect(t('menu.talk')).toBe('聊天');
    expect(uiLang()).toBe('zh');
  });
});

describe('resolveUiLang', () => {
  test('?lang= wins, then the replay bridge, then the stored choice, then English', () => {
    expect(resolveUiLang({ search: '?lang=zh', bridgeLang: 'en', stored: 'en' })).toBe('zh');
    expect(resolveUiLang({ search: '', bridgeLang: 'zh', stored: 'en' })).toBe('zh');
    expect(resolveUiLang({ search: '', stored: 'zh' })).toBe('zh');
    expect(resolveUiLang({ search: '' })).toBe('en');
  });

  test('never the system language — an upgrade must not switch the owner’s app for him', () => {
    // There is no navigator input at all: nothing stored means English.
    expect(resolveUiLang({ search: '', stored: null })).toBe('en');
  });

  test('garbage anywhere is ignored, not trusted', () => {
    expect(resolveUiLang({ search: '?lang=fr', bridgeLang: 42, stored: 'klingon' })).toBe('en');
    expect(parseUiLang('ZH')).toBeNull();
  });
});
