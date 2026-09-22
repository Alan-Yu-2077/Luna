import { z } from 'zod';
import { Citation, ExpressionKey, Setting, ToolName } from '@luna/protocol';

// v0.46.0 — the showcase SCRIPT: what the owner writes. It is authored as beats (what happens in
// the room), never as wire frames; `compile.ts` turns each beat into the exact ServerEvent frames
// the real socket would have carried. A script that could compile to a frame the real `wsClient`
// would reject cannot exist — the compiler validates every frame against the protocol.

export const LunaLine = z.object({
  text: z.string().min(1),
  expression: ExpressionKey.optional(),
  emotion: z.number().min(0).max(1).optional(),
  // Omitted = decided by position: the last line before the turn closes is final.
  is_final: z.boolean().optional(),
});
export type LunaLine = z.infer<typeof LunaLine>;

export const ToolCall = z.object({
  name: ToolName,
  summary: z.string().min(1),
  ms: z.number().int().nonnegative().optional(),
  // web_search / web_fetch sources — ride the turn's `turn.result` as citations, so the source
  // chips appear the way v0.18.2 draws them.
  sources: z.array(Citation).optional(),
});
export type ToolCall = z.infer<typeof ToolCall>;

export const Beat = z.discriminatedUnion('kind', [
  // Pre-typed into the real input; the visitor presses Send. Everything up to the next user beat
  // plays after that press.
  z.object({ kind: z.literal('user'), text: z.string().min(1) }),
  LunaLine.extend({ kind: z.literal('luna') }),
  ToolCall.extend({ kind: z.literal('tool') }),
  // Her own waking: lines = she spoke (🌱); no lines = a quiet one (a 🍃 leaf when quiet_note is set,
  // the soft chip otherwise). Tools run first either way, as chips.
  z.object({
    kind: z.literal('proactive'),
    delayMs: z.number().int().nonnegative().optional(),
    lines: z.array(LunaLine).optional(),
    tools: z.array(ToolCall).optional(),
    quiet_note: z.string().optional(),
  }),
  // Direct choreography on the Live2D sink, the same calls `wakeSequence.ts` makes.
  z.object({
    kind: z.literal('action'),
    name: z.string().min(1),
    intensity: z.number().min(0).max(1).optional(),
  }),
  z.object({ kind: z.literal('pulse'), pose: z.record(z.number()), ms: z.number().int().positive() }),
  z.object({ kind: z.literal('pause'), ms: z.number().int().nonnegative() }),
]);
export type Beat = z.infer<typeof Beat>;

export const Scene = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  beats: z.array(Beat).min(1),
});
export type Scene = z.infer<typeof Scene>;

export const DemoScript = z.object({
  version: z.literal(1),
  scenes: z.array(Scene).min(1),
});
export type DemoScript = z.infer<typeof DemoScript>;

// One pre-rendered utterance. `text` is the key: the browser looks a line up by its exact text, so
// an edited line has no voice until it is rendered again — silence, never a mismatched voice.
export const VoiceLine = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  file: z.string().min(1),
  durationMs: z.number().nonnegative(),
});
export type VoiceLine = z.infer<typeof VoiceLine>;

export const VoiceManifest = z.object({ lines: z.array(VoiceLine) });
export type VoiceManifest = z.infer<typeof VoiceManifest>;

// The settings.state snapshot the tape sends on connect (the server's registry, frozen).
export const DemoSettings = z.array(Setting);

// Every line the voice must carry, in script order, deduplicated by text.
export function spokenLines(script: DemoScript): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (text: string): void => {
    if (seen.has(text)) return;
    seen.add(text);
    out.push(text);
  };
  for (const scene of script.scenes) {
    for (const beat of scene.beats) {
      if (beat.kind === 'luna') add(beat.text);
      if (beat.kind === 'proactive') for (const line of beat.lines ?? []) add(line.text);
    }
  }
  return out;
}
