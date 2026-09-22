import { describe, expect, test } from 'bun:test';
import { MusicNow } from '@luna/protocol';
import { createMusicStore } from './demoMusic';
import type { TrackDef } from './script';

// v0.47.0 — the record shelf behind the card. A fake wall clock drives extrapolation.

const TRACKS: TrackDef[] = [
  { id: 'a', title: 'A', artist: 'AA', album: 'Al', duration: 100, cover: 'a', affinity: { sessions: 3, listenedSeconds: 900, rank: 2 } },
  { id: 'b', title: 'B', artist: 'BB', album: '', duration: 50 },
];

function store(): { s: ReturnType<typeof createMusicStore>; tick: (ms: number) => void } {
  let now = 10_000;
  const s = createMusicStore(TRACKS, () => now);
  return { s, tick: (ms) => (now += ms) };
}

describe('now', () => {
  test('nothing on → the card’s exit shape; a track on → the MusicNow shape with cover and affinity', () => {
    const { s } = store();
    expect(s.now()).toEqual({ track: null, playing: false, position: 0, duration: null });
    s.set('a');
    const n = s.now();
    expect(MusicNow.safeParse(n).success).toBe(true);
    expect(n).toMatchObject({ track: { title: 'A', artist: 'AA', album: 'Al', artworkHash: 'a' }, playing: true, position: 0, duration: 100 });
    expect(n.affinity).toEqual({ sessions: 3, listenedSeconds: 900, rank: 2 });
    s.set('b');
    expect(s.now().affinity).toBeUndefined();
    expect(s.now().track?.artworkHash).toBeNull();
  });

  test('position follows the wall clock, to one decimal; an unknown id is ignored', () => {
    const { s, tick } = store();
    s.set('a');
    tick(12_340);
    expect(s.now().position).toBe(12.3);
    s.set('nope');
    expect(s.currentId()).toBe('a');
    s.set(null);
    expect(s.now().track).toBeNull();
  });

  test('a record that runs out drops the next one; the shelf loops', () => {
    const { s, tick } = store();
    s.set('b'); // 50s
    tick(50_000);
    expect(s.now().track?.title).toBe('A'); // wrapped to the first
    expect(s.now().position).toBe(0);
  });
});

describe('control', () => {
  const body = (op: string): string => JSON.stringify({ op });

  test('pause freezes the needle, play resumes from there, toggle flips', () => {
    const { s, tick } = store();
    s.set('a');
    tick(5000);
    expect(s.control(body('pause'))?.playing).toBe(false);
    tick(5000);
    expect(s.now().position).toBe(5);
    expect(s.control(body('play'))?.playing).toBe(true);
    tick(1000);
    expect(s.now().position).toBe(6);
    expect(s.control(body('toggle'))?.playing).toBe(false);
    expect(s.control(body('toggle'))?.playing).toBe(true);
  });

  test('next / prev walk the shelf and wrap; on an empty turntable they put the first record on', () => {
    const { s } = store();
    expect(s.control(body('next'))?.track?.title).toBe('A');
    expect(s.control(body('next'))?.track?.title).toBe('B');
    expect(s.control(body('next'))?.track?.title).toBe('A');
    expect(s.control(body('prev'))?.track?.title).toBe('B');
    const fresh = store().s;
    expect(fresh.control(body('prev'))?.track?.title).toBe('A');
  });

  test('a bad op or a bad body is null (the route answers 400)', () => {
    const { s } = store();
    expect(s.control(body('rewind'))).toBeNull();
    expect(s.control('not json')).toBeNull();
  });
});

describe('coverFile', () => {
  test('only hashes the shelf knows resolve, to a demo-relative svg', () => {
    const { s } = store();
    expect(s.coverFile('a')).toBe('music/a.svg');
    expect(s.coverFile('b')).toBeNull();
    expect(s.coverFile('../x')).toBeNull();
  });
});
