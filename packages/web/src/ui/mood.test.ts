import { describe, expect, test } from 'bun:test';
import { ExpressionKey } from '@luna/protocol';
import { moodOf } from './mood';

describe('moodOf', () => {
  test('every ExpressionKey has a non-empty emoji + label', () => {
    for (const key of ExpressionKey.options) {
      for (const lang of ['en', 'zh'] as const) {
        const m = moodOf(key, lang);
        expect(m.emoji.length).toBeGreaterThan(0);
        expect(m.label.length).toBeGreaterThan(0);
      }
    }
    expect(moodOf('steady_presence', 'en').label).toBe('Calm');
    expect(moodOf('steady_presence', 'zh').label).toBe('平静');
  });
});
