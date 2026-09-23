import { describe, expect, test } from 'bun:test';
import { controllerCopy } from './chipCopy';

// v0.48.0: the chips the live log shows — dream steps as sentences, the quiet note in the
// interface language — while the wire text they are built from stays English.
describe('controllerCopy', () => {
  test('dream chips read like the diary book, never as a raw step id', () => {
    const zh = controllerCopy('zh');
    expect(zh.dreamStep({ step: 'rate_salience', status: 'ok', detail: 'rated 31 turns' })).toBe('🌙 回看了 31 个瞬间。');
    expect(zh.dreaming('rate_salience')).toBe('🌙 在做梦 · 回看');
    expect(zh.dreaming('finished_idle')).toBe('🌙 梦做完了，还睡着');
    expect(zh.awake).toBe('☀️ 醒了');
    const en = controllerCopy('en');
    expect(en.dreamStep({ step: 'rag_refresh', status: 'ok', detail: 'misses_before=10 filled=10 after=0' })).not.toContain('misses_before');
    expect(en.dreaming('finished_idle')).not.toContain('finished_idle');
  });

  test('the quiet note is re-read in Chinese; English passes through untouched', () => {
    expect(controllerCopy('zh').quietNote('searched the web · read 2 pages · saved a memory')).toBe(
      '🍃 上网搜了搜 · 读了 2 个网页 · 存了一条记忆',
    );
    expect(controllerCopy('en').quietNote('searched the web')).toBe('🍃 searched the web');
  });
});
