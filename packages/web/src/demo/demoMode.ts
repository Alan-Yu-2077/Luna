import type { Setting } from '@luna/protocol';
import { compileScript, type Compiled } from './compile';
import { createDemoSpeech, durationLookup, type FetchLike, type SpeechFetcher } from './demoAudio';
import { createDemoFetch } from './demoData';
import { createMusicStore, type MusicStore } from './demoMusic';
import { DemoScript, DemoSettings, VoiceManifest } from './script';

// v0.46.0 — is this boot the showcase replay? `window.lunaDemo` is a bridge in the same family as
// `lunaConfig` / `lunaSetup` / `lunaPet`: an optional global the hosting page sets before app.ts
// runs. demo.html sets it; nothing else ever does, so the desktop app and the dev server cannot
// wander onto the tape.

// v0.46.3: how she is framed when the page opens — a half-body portrait (zoom on the full-body
// height-fit, headroom as a fraction of the stage), the owner's own framing of her. Absent = the
// app's full figure. Bounds keep a typo from opening on a nostril or a dot.
export type Portrait = { zoom: number; top: number };
export type DemoBridge = { base: string; portrait?: Portrait };

export function readPortrait(raw: unknown): Portrait | null {
  if (raw === null || typeof raw !== 'object') return null;
  const { zoom, top } = raw as { zoom?: unknown; top?: unknown };
  if (typeof zoom !== 'number' || typeof top !== 'number') return null;
  if (!Number.isFinite(zoom) || !Number.isFinite(top)) return null;
  if (zoom < 1 || zoom > 3 || top < 0 || top > 0.5) return null;
  return { zoom, top };
}

export function readDemoBridge(
  g: { lunaDemo?: unknown } = globalThis as { lunaDemo?: unknown },
): DemoBridge | null {
  const raw = g.lunaDemo;
  if (raw === null || typeof raw !== 'object') return null;
  const { base, portrait } = raw as { base?: unknown; portrait?: unknown };
  const b = typeof base === 'string' && base.trim() !== '' ? base.trim() : './demo/';
  const p = readPortrait(portrait);
  return { base: b.endsWith('/') ? b : `${b}/`, ...(p ? { portrait: p } : {}) };
}

export type DemoBundle = {
  base: string;
  compiled: Compiled;
  settings: Setting[];
  speech: SpeechFetcher;
  fetch: FetchLike;
  // v0.47.0: the turntable's shelf (null when the script names no tracks), whether the menu's
  // Dream door has a dream to play, and the scene titles the picker lists.
  music: MusicStore | null;
  hasDream: boolean;
  titles: string[];
};

// The three files the demo rides on. The script is required; a missing voice manifest or settings
// snapshot degrades (silent lines / an empty server-settings panel) rather than blocking the boot.
export async function loadDemo(bridge: DemoBridge, fetchFn: FetchLike = (u, i) => fetch(u, i)): Promise<DemoBundle> {
  const { base } = bridge;
  const [scriptRes, voiceRes, settingsRes] = await Promise.all([
    fetchFn(`${base}script.json`),
    fetchFn(`${base}voice/manifest.json`),
    fetchFn(`${base}data/settings.json`),
  ]);
  if (!scriptRes.ok) throw new Error(`demo script unreachable: ${scriptRes.status}`);
  const script = DemoScript.parse(await scriptRes.json());
  const manifest = voiceRes.ok ? VoiceManifest.parse(await voiceRes.json()) : { lines: [] };
  const settings = settingsRes.ok ? DemoSettings.parse(await settingsRes.json()) : [];
  const music = script.music ? createMusicStore(script.music.tracks) : null;
  return {
    base,
    compiled: compileScript(script, durationLookup(manifest)),
    settings,
    speech: createDemoSpeech(manifest, base, fetchFn),
    fetch: createDemoFetch(base, fetchFn, music),
    music,
    hasDream: script.dream !== undefined,
    titles: script.scenes.map((s) => s.title),
  };
}
