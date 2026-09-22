import type { FetchSpeechOpts } from '../audio/ttsClient';
import type { DurationLookup } from './compile';
import type { VoiceManifest } from './script';

// v0.46.0 — her voice, pre-rendered. Plugs into `WebAudioSink`'s existing `fetchSpeechFn` seam in
// place of the GPT-SoVITS forward: the same bytes-in contract (text → audio ArrayBuffer), so the
// serial queue, lip-sync, the speech-gated bubbles and the punctuation gestures run untouched. A
// line the manifest does not carry rejects with a 404 — the sink's real failure path — and is
// skipped, logged, never mis-voiced.

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type SpeechFetcher = (text: string, opts?: FetchSpeechOpts) => Promise<ArrayBuffer>;

export function lineKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function withStatus(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

export function createDemoSpeech(
  manifest: VoiceManifest,
  base: string,
  fetchFn: FetchLike = (u, i) => fetch(u, i),
): SpeechFetcher {
  const byText = new Map(manifest.lines.map((l) => [lineKey(l.text), l]));
  return async (text, opts = {}) => {
    const line = byText.get(lineKey(text));
    if (!line) throw withStatus(`no voice rendered for: ${text.slice(0, 40)}`, 404);
    const res = await fetchFn(`${base}voice/${line.file}`, opts.signal ? { signal: opts.signal } : {});
    if (!res.ok) throw withStatus(`voice fetch failed: ${res.status}`, res.status);
    return res.arrayBuffer();
  };
}

export function durationLookup(manifest: VoiceManifest): DurationLookup {
  const byText = new Map(manifest.lines.map((l) => [lineKey(l.text), l.durationMs]));
  return (text) => byText.get(lineKey(text));
}
