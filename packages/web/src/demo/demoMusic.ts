import { MusicControlRequest, type MusicNow } from '@luna/protocol';
import type { TrackDef } from './script';

// v0.47.0 — the turntable's record shelf. The script names the tracks; `music` beats put one on;
// the card (real code, real /api/music/* routes, real buttons) reads this store through the demo
// fetch exactly as it reads the sidecar's Now Playing. Position is extrapolated from the wall
// clock like the sidecar does, a record that ends drops the next one, and the card's ▶ / ⏭ / ⏮
// really change what is playing.

export type MusicStore = {
  set(trackId: string | null): void;
  now(): MusicNow;
  control(rawBody: string): MusicNow | null; // null = bad op (the route answers 400)
  coverFile(hash: string): string | null; // demo-relative path of a generated cover
  currentId(): string | null;
};

export function createMusicStore(tracks: TrackDef[], clock: () => number = () => Date.now()): MusicStore {
  let idx = -1;
  let playing = false;
  let base = 0; // position (s) when `since` was stamped
  let since = 0;

  const start = (i: number): void => {
    idx = i;
    base = 0;
    since = clock();
    playing = i >= 0;
  };

  // Where the needle is; a record that ran out puts the next one on (the shelf loops).
  const position = (): number => {
    const t = tracks[idx];
    if (!t) return 0;
    if (!playing) return base;
    const p = base + (clock() - since) / 1000;
    if (p < t.duration) return p;
    start((idx + 1) % tracks.length);
    return 0;
  };

  const now = (): MusicNow => {
    const pos = position();
    const t = tracks[idx];
    if (!t) return { track: null, playing: false, position: 0, duration: null };
    return {
      track: { title: t.title, artist: t.artist, album: t.album, artworkHash: t.cover ?? null },
      playing,
      position: Math.round(pos * 10) / 10,
      duration: t.duration,
      ...(t.affinity ? { affinity: t.affinity } : {}),
    };
  };

  return {
    set(trackId) {
      if (trackId === null) {
        start(-1);
        return;
      }
      const i = tracks.findIndex((t) => t.id === trackId);
      if (i >= 0) start(i);
    },
    now,
    control(rawBody) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const req = MusicControlRequest.safeParse(parsed);
      if (!req.success) return null;
      const n = tracks.length;
      switch (req.data.op) {
        case 'play':
          if (idx < 0) start(0);
          else if (!playing) {
            since = clock();
            playing = true;
          }
          break;
        case 'pause':
          if (idx >= 0 && playing) {
            base = position();
            playing = false;
          }
          break;
        case 'toggle':
          if (idx < 0) start(0);
          else if (playing) {
            base = position();
            playing = false;
          } else {
            since = clock();
            playing = true;
          }
          break;
        case 'next':
          start(idx < 0 ? 0 : (idx + 1) % n);
          break;
        case 'prev':
          start(idx < 0 ? 0 : (idx - 1 + n) % n);
          break;
      }
      return now();
    },
    coverFile(hash) {
      return tracks.some((t) => t.cover === hash) ? `music/${hash}.svg` : null;
    },
    currentId: () => tracks[idx]?.id ?? null,
  };
}
