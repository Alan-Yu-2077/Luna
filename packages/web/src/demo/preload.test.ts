import { describe, expect, test } from 'bun:test';
import { modelFiles, preload, type PreloadProgress } from './preload';

describe('preload (v0.51.0: the entrance counts her files in)', () => {
  test('modelFiles reads the model3.json references, relative to it', async () => {
    const files = await modelFiles('./models/y/y.model3.json', async () =>
      Response.json({ FileReferences: { Moc: 'y.moc3', Textures: ['y.8192/t0.png'], Physics: 'y.physics3.json' } }),
    );
    expect(files).toEqual(['./models/y/y.moc3', './models/y/y.physics3.json', './models/y/y.8192/t0.png']);
  });

  test('progress is bytes over the declared sizes, and ends complete — a failed file counts as done', async () => {
    const seen: PreloadProgress[] = [];
    await preload(
      ['a', 'b', 'bad'],
      async (u) => {
        if (u === 'bad') throw new Error('offline');
        const body = new Uint8Array(u === 'a' ? 300 : 100);
        return new Response(body, { headers: { 'content-length': String(body.byteLength) } });
      },
      (p) => seen.push(p),
    );
    const last = seen[seen.length - 1];
    expect(last && last.loaded).toBe(last?.total);
    expect(seen.some((p) => p.loaded < p.total)).toBe(true);
  });
});
