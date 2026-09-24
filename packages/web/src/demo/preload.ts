// v0.51.0 — the first visit downloads about 10 MB before she can appear (the Live2D model is 6.4 MB of
// moc3 and 1.3 MB of texture; the Cubism core; the handwriting). The entrance card is up long before
// that, so the model's files are fetched here while the visitor reads it, and the card's Enter shows the
// real progress. The same URLs are requested again when the model loads, so that load comes from cache.

export type PreloadProgress = { loaded: number; total: number };

export type FetchLike = (url: string) => Promise<Response>;

// The files worth waiting for: the model's own references, read from its model3.json.
export async function modelFiles(modelUrl: string, fetchFn: FetchLike): Promise<string[]> {
  const res = await fetchFn(modelUrl);
  if (!res.ok) return [];
  const json: unknown = await res.json();
  const refs: unknown = typeof json === 'object' && json !== null ? Reflect.get(json, 'FileReferences') : null;
  if (typeof refs !== 'object' || refs === null) return [];
  const names: string[] = [];
  for (const key of ['Moc', 'Physics', 'DisplayInfo']) {
    const v: unknown = Reflect.get(refs, key);
    if (typeof v === 'string') names.push(v);
  }
  const textures: unknown = Reflect.get(refs, 'Textures');
  if (Array.isArray(textures)) for (const t of textures) if (typeof t === 'string') names.push(t);
  const base = modelUrl.slice(0, modelUrl.lastIndexOf('/') + 1);
  return names.map((n) => base + n);
}

// Download every URL, reporting bytes as they arrive. A file whose size is unknown counts once it is
// done; a failed file counts as done — the model loader will meet the same failure and report it.
export async function preload(urls: string[], fetchFn: FetchLike, onProgress: (p: PreloadProgress) => void): Promise<void> {
  const sizes = new Map<string, number>();
  const got = new Map<string, number>();
  const report = (): void => {
    let loaded = 0;
    let total = 0;
    for (const u of urls) {
      const size = sizes.get(u) ?? 0;
      total += size;
      loaded += Math.min(got.get(u) ?? 0, size);
    }
    onProgress({ loaded, total });
  };
  await Promise.all(
    urls.map(async (u) => {
      try {
        const res = await fetchFn(u);
        const len = Number(res.headers.get('content-length') ?? '0');
        sizes.set(u, len > 0 ? len : 1);
        const reader = res.body?.getReader();
        if (!reader) {
          await res.arrayBuffer();
          got.set(u, sizes.get(u) ?? 1);
          report();
          return;
        }
        let n = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          n += value.byteLength;
          got.set(u, len > 0 ? n : 0);
          report();
        }
        got.set(u, sizes.get(u) ?? 1);
      } catch {
        sizes.set(u, sizes.get(u) ?? 1);
        got.set(u, sizes.get(u) ?? 1);
      }
      report();
    }),
  );
}
