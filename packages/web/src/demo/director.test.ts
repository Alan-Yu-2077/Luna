import { describe, expect, test } from 'bun:test';
import { FURTHEST_KEY, readFurthest, saveFurthest, sceneOpen } from './director';

// v0.51.9 (owner): no skipping ahead — the picker opens what was watched to its end, and the next one.
describe('the scene picker lock', () => {
  test('a fresh visitor can pick scene 1 only; finishing a scene opens the one after it', () => {
    expect([0, 1, 2].map((i) => sceneOpen(i, -1))).toEqual([true, false, false]);
    expect([0, 1, 2, 3].map((i) => sceneOpen(i, 1))).toEqual([true, true, true, false]);
  });

  test('the mark is kept for the tab, and a missing or broken store starts over', () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(readFurthest(store)).toBe(-1);
    saveFurthest(store, 4);
    expect(data.get(FURTHEST_KEY)).toBe('4');
    expect(readFurthest(store)).toBe(4);
    data.set(FURTHEST_KEY, 'nonsense');
    expect(readFurthest(store)).toBe(-1);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readFurthest(broken)).toBe(-1);
    expect(() => saveFurthest(broken, 2)).not.toThrow();
    expect(readFurthest(null)).toBe(-1);
  });
});
