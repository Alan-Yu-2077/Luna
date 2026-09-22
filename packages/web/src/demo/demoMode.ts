import type { Setting } from '@luna/protocol';
import { compileScript, type Compiled } from './compile';
import { createDemoSpeech, durationLookup, type FetchLike, type SpeechFetcher } from './demoAudio';
import { createDemoFetch } from './demoData';
import { DemoScript, DemoSettings, VoiceManifest } from './script';

// v0.46.0 — is this boot the showcase replay? `window.lunaDemo` is a bridge in the same family as
// `lunaConfig` / `lunaSetup` / `lunaPet`: an optional global the hosting page sets before app.ts
// runs. demo.html sets it; nothing else ever does, so the desktop app and the dev server cannot
// wander onto the tape.

export type DemoBridge = { base: string };

export function readDemoBridge(
  g: { lunaDemo?: unknown } = globalThis as { lunaDemo?: unknown },
): DemoBridge | null {
  const raw = g.lunaDemo;
  if (raw === null || typeof raw !== 'object') return null;
  const base = (raw as { base?: unknown }).base;
  const b = typeof base === 'string' && base.trim() !== '' ? base.trim() : './demo/';
  return { base: b.endsWith('/') ? b : `${b}/` };
}

export type DemoBundle = {
  base: string;
  compiled: Compiled;
  settings: Setting[];
  speech: SpeechFetcher;
  fetch: FetchLike;
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
  return {
    base,
    compiled: compileScript(script, durationLookup(manifest)),
    settings,
    speech: createDemoSpeech(manifest, base, fetchFn),
    fetch: createDemoFetch(base, fetchFn),
  };
}
