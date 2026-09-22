import { describe, expect, test } from 'bun:test';
import { createDemoSpeech, durationLookup, lineKey } from './demoAudio';
import type { VoiceManifest } from './script';

// v0.46.0 — her pre-rendered voice behind the sink's synthesis seam.

const manifest: VoiceManifest = {
  lines: [{ id: 'abc', text: 'Hello   there.', file: 'abc.mp3', durationMs: 1200 }],
};

describe('lineKey', () => {
  test('trims and collapses whitespace, so a re-wrapped script line still finds its voice', () => {
    expect(lineKey('  Hello\n  there. ')).toBe('Hello there.');
  });
});

describe('createDemoSpeech', () => {
  test('fetches the manifest file under <base>voice/ and returns its bytes', async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const speak = createDemoSpeech(manifest, './demo/', async (u, i) => {
      calls.push([u, i]);
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const buf = await speak('Hello there.');
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls).toEqual([['./demo/voice/abc.mp3', {}]]);
  });

  test('passes the barge-in signal through', async () => {
    const ac = new AbortController();
    let seen: AbortSignal | undefined;
    const speak = createDemoSpeech(manifest, '/d/', async (_u, i) => {
      seen = i?.signal ?? undefined;
      return new Response(new Uint8Array([0]));
    });
    await speak('Hello there.', { signal: ac.signal });
    expect(seen).toBe(ac.signal);
  });

  test('a line with no voice rejects with a 404 — the sink treats it as unspoken, not as a crash', async () => {
    const speak = createDemoSpeech(manifest, '/d/', async () => new Response(''));
    await expect(speak('never rendered')).rejects.toMatchObject({ status: 404 });
  });

  test('a failed fetch carries its status for the sink’s retry logic', async () => {
    const speak = createDemoSpeech(manifest, '/d/', async () => new Response('', { status: 503 }));
    await expect(speak('Hello there.')).rejects.toMatchObject({ status: 503 });
  });
});

describe('durationLookup', () => {
  test('answers by normalized text; unknown → undefined (the compiler estimates)', () => {
    const d = durationLookup(manifest);
    expect(d('Hello there.')).toBe(1200);
    expect(d('nope')).toBeUndefined();
  });
});
