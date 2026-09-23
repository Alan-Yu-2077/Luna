import type { Setting } from '@luna/protocol';
import type { UiLang } from '../ui/uiCopy';
import { compileScript, type Compiled } from './compile';
import { createDemoSpeech, durationLookup, type FetchLike, type SpeechFetcher } from './demoAudio';
import { createDemoFetch } from './demoData';
import { createMusicStore, type MusicStore } from './demoMusic';
import { DemoScript, DemoSettings, VoiceManifest } from './script';
import { DemoNotes } from './notes';

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
  // The card loads its cover as a CSS background — a real browser fetch the injected `fetch`
  // never sees — so it takes this URL builder instead of the sidecar's artwork route.
  coverUrl: (hash: string) => string;
  hasDream: boolean;
  titles: string[];
  // v0.50.0: scene ids (the notes are keyed by them) and the engineering notes — null when the file is
  // missing or malformed: the replay plays on, without the button.
  ids: string[];
  notes: DemoNotes | null;
};

// The three files the demo rides on. The script is required; a missing voice manifest or settings
// snapshot degrades (silent lines / an empty server-settings panel) rather than blocking the boot.
// v0.48.1: the tape is per language — `demo/<lang>/` holds the script, her voice and what she wrote;
// `demo/` itself holds what both languages share (the server's English, the covers).
export async function loadDemo(
  bridge: DemoBridge,
  lang: UiLang = 'en',
  fetchFn: FetchLike = (u, i) => fetch(u, i),
): Promise<DemoBundle> {
  const { base } = bridge;
  const langBase = `${base}${lang}/`;
  const [scriptRes, voiceRes, settingsRes, notesRes] = await Promise.all([
    fetchFn(`${langBase}script.json`),
    fetchFn(`${langBase}voice/manifest.json`),
    fetchFn(`${base}data/settings.json`),
    fetchFn(`${base}notes.json`),
  ]);
  if (!scriptRes.ok) throw new Error(`demo script unreachable: ${scriptRes.status}`);
  const script = DemoScript.parse(await scriptRes.json());
  const manifest = voiceRes.ok ? VoiceManifest.parse(await voiceRes.json()) : { lines: [] };
  const settings = settingsRes.ok ? DemoSettings.parse(await settingsRes.json()) : [];
  const music = script.music ? createMusicStore(script.music.tracks) : null;
  const notesParsed = notesRes.ok ? DemoNotes.safeParse(await notesRes.json().catch(() => null)) : null;
  return {
    base,
    compiled: compileScript(script, durationLookup(manifest)),
    settings,
    speech: createDemoSpeech(manifest, langBase, fetchFn),
    fetch: createDemoFetch({ lang: langBase, shared: base }, fetchFn, music),
    music,
    coverUrl: (hash) => `${base}music/${encodeURIComponent(hash)}.svg`,
    hasDream: script.dream !== undefined,
    titles: script.scenes.map((s) => s.title),
    ids: script.scenes.map((s) => s.id),
    notes: notesParsed?.success ? notesParsed.data : null,
  };
}
